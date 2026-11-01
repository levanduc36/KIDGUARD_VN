import express from 'express';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdirSync, existsSync } from 'node:fs';
import path from 'node:path';
import { z } from 'zod';
import { lessons, lessonSummary, publicNode } from './content.mjs';
import { completeAttempt, migrateResults, resultSummary, resultDetail } from './results.mjs';

const derive = promisify(scrypt);
const SESSION_MS = 7 * 24 * 60 * 60 * 1000;
const hashToken = token => createHash('sha256').update(token).digest('hex');
const userShape = row => row ? { id: row.id, username: row.username, nickname: row.nickname } : null;
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/);
const passwordSchema = z.string().min(8).max(128);
const registerSchema = z.object({ username: usernameSchema, password: passwordSchema, nickname: z.string().trim().min(2).max(40) }).strict();
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();

export async function createApp(options = {}) {
  const production = options.production ?? process.env.NODE_ENV === 'production';
  const origin = options.origin ?? process.env.APP_ORIGIN ?? 'http://localhost:5173';
  if (production && !origin.startsWith('https://')) throw new Error('Production requires APP_ORIGIN with HTTPS.');
  const origins = new Set([origin]);
  if (!production) {
    for (const url of ['http://localhost:5173', 'http://127.0.0.1:5173', 'http://localhost:3001', 'http://127.0.0.1:3001']) origins.add(url);
  }
  const databasePath = options.databasePath ?? process.env.DATABASE_PATH ?? './data/kidguard.sqlite';
  if (databasePath !== ':memory:') mkdirSync(path.dirname(path.resolve(databasePath)), { recursive: true });
  const db = new DatabaseSync(databasePath);
  db.exec(`
    PRAGMA journal_mode = WAL;
    PRAGMA foreign_keys = ON;
    PRAGMA busy_timeout = 5000;
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY, username TEXT NOT NULL UNIQUE, nickname TEXT NOT NULL,
      password_hash TEXT NOT NULL, created_at INTEGER NOT NULL
    );
    CREATE TABLE IF NOT EXISTS sessions (
      token_hash TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      expires_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS sessions_expiry ON sessions(expires_at);
    CREATE TABLE IF NOT EXISTS attempts (
      id TEXT PRIMARY KEY, user_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      lesson_id TEXT NOT NULL, lesson_version INTEGER NOT NULL, lesson_title TEXT NOT NULL, is_demo INTEGER NOT NULL,
      current_node TEXT, answers TEXT NOT NULL DEFAULT '[]', score INTEGER,
      created_at INTEGER NOT NULL, completed_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS attempts_owner_score ON attempts(user_id, lesson_id, score DESC, completed_at DESC);
    CREATE TABLE IF NOT EXISTS login_failures (username TEXT PRIMARY KEY, count INTEGER NOT NULL, until_at INTEGER NOT NULL);
  `);
  migrateResults(db, lessons);
  const cleanup = () => {
    db.prepare('DELETE FROM sessions WHERE expires_at <= ?').run(Date.now());
    db.prepare('DELETE FROM login_failures WHERE until_at <= ?').run(Date.now());
    db.prepare('DELETE FROM attempts WHERE completed_at IS NULL AND created_at < ?').run(Date.now() - SESSION_MS);
  };
  cleanup();
  const cleanupTimer = setInterval(cleanup, 60 * 60 * 1000);
  cleanupTimer.unref();
  const fakeSalt = randomBytes(16).toString('hex');
  const fakeHash = await derive('unused-password', fakeSalt, 64);
  const app = express();
  app.disable('x-powered-by');
  if (process.env.TRUST_PROXY === '1') app.set('trust proxy', 1);
  app.use(helmet({
    contentSecurityPolicy: { directives: {
      defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'"], imgSrc: ["'self'", 'data:'],
      mediaSrc: ["'self'"], connectSrc: ["'self'"], fontSrc: ["'self'"], objectSrc: ["'none'"],
      frameAncestors: ["'none'"], formAction: ["'self'"], upgradeInsecureRequests: production ? [] : null,
    } },
    strictTransportSecurity: production ? undefined : false,
    referrerPolicy: { policy: 'no-referrer' },
  }));
  app.use('/api', (req, res, next) => {
    res.set('Cache-Control', 'no-store');
    if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
      if (!origins.has(req.get('origin')) || req.get('x-kidguard-request') !== '1' || !req.is('application/json')) {
        return res.status(403).json({ error: 'Yêu cầu không hợp lệ. Vui lòng tải lại trang.' });
      }
    }
    next();
  });
  app.use('/api', rateLimit({ windowMs: 60_000, limit: options.apiLimit ?? 240, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Em thao tác hơi nhanh. Hãy thử lại sau một phút nhé.' } }));
  app.use(express.json({ limit: '16kb' }));
  app.use('/api', (req, res, next) => {
    const token = (req.headers.cookie ?? '').split(';').map(part => part.trim()).find(part => part.startsWith('kg_session='))?.slice(11);
    if (token && /^[a-f0-9]{64}$/.test(token)) {
      req.sessionHash = hashToken(token);
      req.user = db.prepare('SELECT u.id, u.username, u.nickname FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(req.sessionHash, Date.now());
    }
    next();
  });
  const requireUser = (req, res, next) => req.user ? next() : res.status(401).json({ error: 'Em hãy đăng nhập để tiếp tục nhé.' });
  const authLimit = rateLimit({ windowMs: 15 * 60_000, limit: options.authLimit ?? 15, skipSuccessfulRequests: true, standardHeaders: 'draft-8', legacyHeaders: false, message: { error: 'Đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.' } });
  const setSession = (req, res, userId) => {
    if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES (?,?,?)').run(hashToken(token), userId, Date.now() + SESSION_MS);
    res.cookie('kg_session', token, { httpOnly: true, secure: production, sameSite: 'strict', maxAge: SESSION_MS, path: '/' });
  };
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/session', (req, res) => res.json({ user: userShape(req.user) }));
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Kiểm tra biệt danh, tên đăng nhập (3–32 ký tự a–z, 0–9, _) và mật khẩu (8–128 ký tự).' });
    const { username, nickname, password } = parsed.data;
    const salt = randomBytes(16).toString('hex');
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const id = randomUUID();
    try {
      db.prepare('INSERT INTO users VALUES (?,?,?,?,?)').run(id, username, nickname, `${salt}:${key.toString('hex')}`, Date.now());
    } catch (error) {
      if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tên đăng nhập này chưa khả dụng. Em hãy chọn một tên khác nhé.' });
      throw error;
    }
    setSession(req, res, id);
    res.status(201).json({ user: { id, username, nickname } });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' });
    const { username, password } = parsed.data;
    const failed = db.prepare('SELECT * FROM login_failures WHERE username=? AND until_at>?').get(username, Date.now());
    if (failed?.count >= 10) return res.status(429).json({ error: 'Đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.' });
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const [salt, stored] = user ? user.password_hash.split(':') : [fakeSalt, fakeHash.toString('hex')];
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (!timingSafeEqual(key, Buffer.from(stored, 'hex')) || !user) {
      db.prepare('INSERT INTO login_failures VALUES (?,?,?) ON CONFLICT(username) DO UPDATE SET count=excluded.count, until_at=excluded.until_at').run(username, (failed?.count ?? 0) + 1, failed?.until_at ?? Date.now() + 15 * 60_000);
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' });
    }
    db.prepare('DELETE FROM login_failures WHERE username=?').run(username);
    setSession(req, res, user.id);
    res.json({ user: userShape(user) });
  });
  app.post('/api/auth/logout', (req, res) => {
    if (req.sessionHash) db.prepare('DELETE FROM sessions WHERE token_hash=?').run(req.sessionHash);
    res.clearCookie('kg_session', { httpOnly: true, secure: production, sameSite: 'strict', path: '/' });
    res.json({ ok: true });
  });
  app.get('/api/lessons', requireUser, (_req, res) => res.json({ lessons: lessons.map(lessonSummary) }));
  app.post('/api/attempts', requireUser, (req, res) => {
    const input = z.object({ lessonId: z.string().max(80) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Bài học không hợp lệ.' });
    const lesson = lessons.find(item => item.id === input.data.lessonId);
    if (!lesson || !lesson.nodes || lesson.status === 'coming-soon') return res.status(409).json({ error: 'Bài học đang được chuẩn bị. Em quay lại sau nhé.' });
    const id = randomUUID();
    db.prepare('INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,current_node,created_at) VALUES (?,?,?,?,?,?,?,?)').run(id, req.user.id, lesson.id, lesson.version, lesson.title, lesson.status === 'demo' ? 1 : 0, lesson.startNode, Date.now());
    res.status(201).json({ id, lesson: lessonSummary(lesson), node: publicNode(lesson, lesson.startNode), answered: 0 });
  });
  app.post('/api/attempts/:id/choices', requireUser, (req, res) => {
    const input = z.object({ nodeId: z.string().max(80), choiceId: z.string().max(80) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Lựa chọn không hợp lệ.' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
    if (attempt.completed_at || attempt.current_node !== input.data.nodeId) return res.status(409).json({ error: 'Lựa chọn đã được ghi nhận hoặc không đúng bước hiện tại.' });
    const lesson = lessons.find(item => item.id === attempt.lesson_id);
    if (!lesson?.nodes || lesson.version !== attempt.lesson_version) return res.status(409).json({ error: 'Bài học đã cập nhật. Em hãy bắt đầu lượt mới nhé.' });
    const node = lesson.nodes[attempt.current_node];
    const choice = node.choices.find(item => item.id === input.data.choiceId);
    if (!choice) return res.status(400).json({ error: 'Lựa chọn không hợp lệ.' });
    const answers = JSON.parse(attempt.answers);
    answers.push({ nodeId: attempt.current_node, choiceId: choice.id, points: choice.points, maxPoints: Math.max(...node.choices.map(c => c.points)), title: node.title, text: node.text, choiceText: choice.text, feedback: choice.feedback });
    const completed = choice.next === null;
    const result = completed ? completeAttempt(db, attempt, lesson, node, answers) : null;
    if (!completed) db.prepare('UPDATE attempts SET current_node=?, answers=? WHERE id=?').run(choice.next, JSON.stringify(answers), attempt.id);
    res.json({ feedback: choice.feedback, positive: choice.points === Math.max(...node.choices.map(c => c.points)), nextNode: completed ? null : publicNode(lesson, choice.next), answered: answers.length, result });
  });
  app.post('/api/attempts/:id/advance', requireUser, (req, res) => {
    const input = z.object({ nodeId: z.string().max(80) }).strict().safeParse(req.body);
    if (!input.success) return res.status(400).json({ error: 'Bước học không hợp lệ.' });
    const attempt = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
    if (attempt.completed_at || attempt.current_node !== input.data.nodeId) return res.status(409).json({ error: 'Bước học đã được ghi nhận hoặc không đúng bước hiện tại.' });
    const lesson = lessons.find(item => item.id === attempt.lesson_id);
    if (!lesson?.nodes || lesson.version !== attempt.lesson_version) return res.status(409).json({ error: 'Bài học đã cập nhật. Em hãy bắt đầu lượt mới nhé.' });
    const node = lesson.nodes[attempt.current_node];
    if (node.choices.length || !['narrative', 'ending'].includes(node.kind)) return res.status(409).json({ error: 'Em hãy chọn cách xử lý trước khi tiếp tục.' });
    const answers = JSON.parse(attempt.answers);
    const completed = node.kind === 'ending';
    const result = completed ? completeAttempt(db, attempt, lesson, node, answers) : null;
    if (!completed) db.prepare('UPDATE attempts SET current_node=? WHERE id=?').run(node.next, attempt.id);
    res.json({ nextNode: completed ? null : publicNode(lesson, node.next), answered: answers.length, result });
  });
  app.get('/api/history', requireUser, (req, res) => {
    const rows = db.prepare('SELECT * FROM attempts WHERE user_id=? AND is_demo=0 AND completed_at IS NOT NULL AND review_json IS NOT NULL ORDER BY completed_at DESC, rowid DESC').all(req.user.id);
    res.json({ attempts: rows.filter(row => lessons.some(lesson => lesson.id === row.lesson_id)).map(resultSummary) });
  });
  app.get('/api/history/:id', requireUser, (req, res) => {
    const row = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=? AND is_demo=0 AND completed_at IS NOT NULL AND review_json IS NOT NULL').get(req.params.id, req.user.id);
    if (!row || !lessons.some(lesson => lesson.id === row.lesson_id)) return res.status(404).json({ error: 'Không tìm thấy kết quả này.' });
    res.json({ result: resultDetail(row) });
  });
  app.use('/api', (_req, res) => res.status(404).json({ error: 'Không tìm thấy chức năng này.' }));
  const dist = path.resolve('dist');
  if (existsSync(dist)) {
    app.use('/assets', express.static(path.join(dist, 'assets'), { maxAge: '1d', immutable: false }));
    app.use(express.static(dist, { maxAge: 0 }));
    app.get('/{*path}', (_req, res) => res.sendFile(path.join(dist, 'index.html')));
  }
  app.use((error, _req, res, _next) => {
    if (error.type === 'entity.too.large') return res.status(413).json({ error: 'Dữ liệu gửi lên quá lớn.' });
    if (error instanceof SyntaxError && error.status === 400) return res.status(400).json({ error: 'Dữ liệu gửi lên không hợp lệ.' });
    console.error('Request failed:', error.name);
    res.status(500).json({ error: 'Có lỗi xảy ra. Em vui lòng thử lại sau nhé.' });
  });
  return { app, db, close: () => { clearInterval(cleanupTimer); db.close(); } };
}
