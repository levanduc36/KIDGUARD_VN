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
const userShape = row => row ? { id: row.id, username: row.username, nickname: row.nickname, fullName: row.full_name, role: row.role, publicId: row.public_id } : null;
const usernameSchema = z.string().trim().toLowerCase().regex(/^[a-z0-9_]{3,32}$/);
const passwordSchema = z.string().min(8).max(128);
const registerSchema = z.object({ username: usernameSchema, password: passwordSchema, nickname: z.string().trim().min(2).max(40).optional(), fullName: z.string().trim().min(2).max(100), role: z.enum(['student', 'teacher']).default('student'), teacherCode: z.string().trim().min(6).max(128).optional() }).strict();
const loginSchema = z.object({ username: usernameSchema, password: z.string().min(1).max(128) }).strict();
const classNameSchema = z.string().trim().min(2).max(80);
const requestIdSchema = z.string().uuid();
const classIdSchema = z.string().uuid();
const teacherCodeHash = code => hashToken(code.trim().toUpperCase());

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
    CREATE TABLE IF NOT EXISTS teacher_access_codes (
      code_hash TEXT PRIMARY KEY, label TEXT NOT NULL, created_at INTEGER NOT NULL,
      expires_at INTEGER, used_at INTEGER, used_by TEXT REFERENCES users(id) ON DELETE SET NULL,
      revoked_at INTEGER
    );
    CREATE TABLE IF NOT EXISTS classes (
      id TEXT PRIMARY KEY, owner_teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      name TEXT NOT NULL, join_code TEXT NOT NULL UNIQUE, created_at INTEGER NOT NULL
    );
    CREATE INDEX IF NOT EXISTS classes_owner ON classes(owner_teacher_id);
    CREATE TABLE IF NOT EXISTS class_members (
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      joined_at INTEGER NOT NULL, PRIMARY KEY(class_id, student_id)
    );
    CREATE TABLE IF NOT EXISTS class_requests (
      id TEXT PRIMARY KEY, class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      kind TEXT NOT NULL CHECK(kind IN ('join_request','invite')),
      status TEXT NOT NULL CHECK(status IN ('pending','accepted','rejected','expired')),
      created_at INTEGER NOT NULL, expires_at INTEGER NOT NULL, resolved_at INTEGER
    );
    CREATE INDEX IF NOT EXISTS class_requests_lookup ON class_requests(class_id, student_id, status, expires_at);
    CREATE TABLE IF NOT EXISTS class_notes (
      class_id TEXT NOT NULL REFERENCES classes(id) ON DELETE CASCADE,
      student_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      teacher_id TEXT NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      body TEXT NOT NULL, updated_at INTEGER NOT NULL, PRIMARY KEY(class_id, student_id, teacher_id)
    );
  `);
  const userColumns = new Set(db.prepare('PRAGMA table_info(users)').all().map(column => column.name));
  if (!userColumns.has('full_name')) db.exec("ALTER TABLE users ADD COLUMN full_name TEXT NOT NULL DEFAULT ''");
  if (!userColumns.has('role')) db.exec("ALTER TABLE users ADD COLUMN role TEXT NOT NULL DEFAULT 'student'");
  if (!userColumns.has('public_id')) db.exec('ALTER TABLE users ADD COLUMN public_id TEXT');
  db.exec('CREATE UNIQUE INDEX IF NOT EXISTS users_public_id ON users(public_id) WHERE public_id IS NOT NULL');
  const newPublicId = role => {
    const prefix = role === 'teacher' ? 'T' : 'S';
    for (let tries = 0; tries < 20; tries++) {
      const value = `${prefix}${randomBytes(6).readUIntBE(0, 6).toString().padStart(9, '0').slice(-9)}`;
      if (!db.prepare('SELECT 1 FROM users WHERE public_id=?').get(value)) return value;
    }
    throw new Error('Could not allocate public user ID');
  };
  for (const row of db.prepare("SELECT id, nickname, role FROM users WHERE public_id IS NULL OR public_id='' OR full_name='' ").all()) {
    db.prepare('UPDATE users SET public_id=COALESCE(NULLIF(public_id,\'\'),?), full_name=CASE WHEN full_name=\'\' THEN nickname ELSE full_name END, role=CASE WHEN role=\'teacher\' THEN \'teacher\' ELSE \'student\' END WHERE id=?').run(newPublicId(row.role), row.id);
  }
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
      req.user = db.prepare('SELECT u.* FROM sessions s JOIN users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?').get(req.sessionHash, Date.now());
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
  const requireTeacher = (req, res, next) => req.user?.role === 'teacher' ? next() : res.status(403).json({ error: 'Chức năng này dành cho giáo viên.' });
  const codeAlphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  const newClassCode = () => {
    for (let tries = 0; tries < 20; tries++) {
      let value = 'KG-';
      for (let index = 0; index < 8; index++) value += codeAlphabet[randomBytes(1)[0] % codeAlphabet.length];
      if (!db.prepare('SELECT 1 FROM classes WHERE join_code=?').get(value)) return value;
    }
    throw new Error('Could not allocate class code');
  };
  const getClass = id => db.prepare('SELECT * FROM classes WHERE id=?').get(id);
  const isMember = (classId, studentId) => Boolean(db.prepare('SELECT 1 FROM class_members WHERE class_id=? AND student_id=?').get(classId, studentId));
  const expireRequests = () => db.prepare("UPDATE class_requests SET status='expired', resolved_at=? WHERE status='pending' AND expires_at<=?").run(Date.now(), Date.now());
  const classForTeacher = (classId, teacherId) => db.prepare('SELECT * FROM classes WHERE id=? AND owner_teacher_id=?').get(classId, teacherId);
  const classForStudent = (classId, studentId) => db.prepare('SELECT c.* FROM classes c JOIN class_members m ON m.class_id=c.id WHERE c.id=? AND m.student_id=?').get(classId, studentId);
  app.get('/api/health', (_req, res) => res.json({ status: 'ok' }));
  app.get('/api/session', (req, res) => res.json({ user: userShape(req.user) }));
  app.post('/api/auth/register', authLimit, async (req, res) => {
    const parsed = registerSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Kiểm tra họ tên, tên đăng nhập (3–32 ký tự a–z, 0–9, _) và mật khẩu (8–128 ký tự).' });
    const { username, nickname, password, fullName, role, teacherCode } = parsed.data;
    if (role === 'student' && !nickname) return res.status(400).json({ error: 'Học sinh cần nhập biệt danh.' });
    const accountNickname = role === 'teacher' ? fullName : nickname;
    if (role === 'teacher' && !teacherCode) return res.status(400).json({ error: 'Em cần nhập mã xác minh giáo viên.' });
    const salt = randomBytes(16).toString('hex');
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    const id = randomUUID();
    const publicId = newPublicId(role);
    try {
      db.exec('BEGIN IMMEDIATE');
      if (role === 'teacher') {
        const code = db.prepare('SELECT * FROM teacher_access_codes WHERE code_hash=?').get(teacherCodeHash(teacherCode));
        if (!code || code.used_at || code.revoked_at || (code.expires_at && code.expires_at <= Date.now())) {
          db.exec('ROLLBACK');
          return res.status(400).json({ error: 'Mã xác minh giáo viên không đúng, đã dùng hoặc đã hết hạn.' });
        }
      }
      db.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,full_name,role,public_id) VALUES (?,?,?,?,?,?,?,?)').run(id, username, accountNickname, `${salt}:${key.toString('hex')}`, Date.now(), fullName, role, publicId);
      if (role === 'teacher') db.prepare('UPDATE teacher_access_codes SET used_at=?, used_by=? WHERE code_hash=? AND used_at IS NULL AND revoked_at IS NULL').run(Date.now(), id, teacherCodeHash(teacherCode));
      db.exec('COMMIT');
    } catch (error) {
      try { db.exec('ROLLBACK'); } catch {}
      if (String(error.message).includes('UNIQUE')) return res.status(409).json({ error: 'Tên đăng nhập này chưa khả dụng. Em hãy chọn một tên khác nhé.' });
      throw error;
    }
    setSession(req, res, id);
    res.status(201).json({ user: { id, username, nickname: accountNickname, fullName, role, publicId } });
  });
  app.post('/api/auth/login', authLimit, async (req, res) => {
    const parsed = loginSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' });
    const { username, password } = parsed.data;
    // Reserve a trial before the asynchronous hash check. Parallel requests must
    // share the same budget, including requests still being verified.
    const now = Date.now();
    const trial = db.prepare(`INSERT INTO login_failures(username,count,until_at) VALUES (?,1,?)
      ON CONFLICT(username) DO UPDATE SET
        count=CASE WHEN login_failures.until_at<=? THEN 1 ELSE login_failures.count+1 END,
        until_at=CASE WHEN login_failures.until_at<=? THEN excluded.until_at ELSE login_failures.until_at END
      WHERE login_failures.until_at<=? OR login_failures.count<10
      RETURNING until_at`).get(username, now + 15 * 60_000, now, now, now);
    if (!trial) return res.status(429).json({ error: 'Đã thử quá nhiều lần. Vui lòng đợi 15 phút rồi thử lại.' });
    const user = db.prepare('SELECT * FROM users WHERE username=?').get(username);
    const [salt, stored] = user ? user.password_hash.split(':') : [fakeSalt, fakeHash.toString('hex')];
    const key = await derive(password, salt, 64, { N: 32768, r: 8, p: 1, maxmem: 64 * 1024 * 1024 });
    if (!timingSafeEqual(key, Buffer.from(stored, 'hex')) || !user) {
      return res.status(401).json({ error: 'Tên đăng nhập hoặc mật khẩu chưa đúng.' });
    }
    db.prepare('DELETE FROM login_failures WHERE username=? AND until_at=?').run(username, trial.until_at);
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
  // Recover the authoritative position after a response is lost. Never expose
  // another user's attempt or internal scores, even for completed attempts.
  app.get('/api/attempts/:id', requireUser, (req, res) => {
    const attempt = db.prepare('SELECT * FROM attempts WHERE id=? AND user_id=?').get(req.params.id, req.user.id);
    if (!attempt) return res.status(404).json({ error: 'Không tìm thấy lượt làm bài.' });
    if (attempt.completed_at && attempt.review_json) return res.json({ nextNode: null, answered: JSON.parse(attempt.answers).length, result: resultDetail(attempt) });
    const lesson = lessons.find(item => item.id === attempt.lesson_id);
    if (!lesson?.nodes || lesson.version !== attempt.lesson_version) return res.status(409).json({ error: 'Bài học đã cập nhật. Em hãy bắt đầu lượt mới nhé.' });
    res.json({ nextNode: publicNode(lesson, attempt.current_node), answered: JSON.parse(attempt.answers).length, result: null });
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
  app.get('/api/classes', requireUser, (req, res) => {
    expireRequests();
    if (req.user.role === 'teacher') {
      const classes = db.prepare(`SELECT c.*,
        (SELECT COUNT(*) FROM class_members m WHERE m.class_id=c.id) AS member_count,
        (SELECT COUNT(*) FROM class_requests r WHERE r.class_id=c.id AND r.status='pending' AND r.kind='join_request') AS pending_count
        FROM classes c WHERE c.owner_teacher_id=? ORDER BY c.created_at DESC`).all(req.user.id).map(row => ({ id: row.id, name: row.name, joinCode: row.join_code, createdAt: row.created_at, memberCount: row.member_count, pendingCount: row.pending_count }));
      return res.json({ classes, invitations: [], requests: [] });
    }
    const classes = db.prepare(`SELECT c.id,c.name,c.join_code,c.created_at,u.full_name AS teacher_name FROM class_members m JOIN classes c ON c.id=m.class_id JOIN users u ON u.id=c.owner_teacher_id WHERE m.student_id=? ORDER BY c.created_at DESC`).all(req.user.id).map(row => ({ id: row.id, name: row.name, joinCode: row.join_code, createdAt: row.created_at, teacherName: row.teacher_name }));
    const invitations = db.prepare(`SELECT r.id,r.class_id,c.name,u.full_name AS teacher_name,r.expires_at FROM class_requests r JOIN classes c ON c.id=r.class_id JOIN users u ON u.id=c.owner_teacher_id WHERE r.student_id=? AND r.kind='invite' AND r.status='pending' AND r.expires_at>? ORDER BY r.created_at DESC`).all(req.user.id, Date.now()).map(row => ({ id: row.id, classId: row.class_id, className: row.name, teacherName: row.teacher_name, expiresAt: row.expires_at }));
    const requests = db.prepare("SELECT r.id,r.class_id,c.name,r.expires_at FROM class_requests r JOIN classes c ON c.id=r.class_id WHERE r.student_id=? AND r.kind='join_request' AND r.status='pending' ORDER BY r.created_at DESC").all(req.user.id).map(row => ({ id: row.id, classId: row.class_id, className: row.name, expiresAt: row.expires_at }));
    res.json({ classes, invitations, requests });
  });
  app.post('/api/classes', requireUser, requireTeacher, (req, res) => {
    const parsed = z.object({ name: classNameSchema }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Tên lớp cần có từ 2 đến 80 ký tự.' });
    const id = randomUUID(), joinCode = newClassCode(), createdAt = Date.now();
    db.prepare('INSERT INTO classes(id,owner_teacher_id,name,join_code,created_at) VALUES (?,?,?,?,?)').run(id, req.user.id, parsed.data.name, joinCode, createdAt);
    res.status(201).json({ class: { id, name: parsed.data.name, joinCode, createdAt, memberCount: 0, pendingCount: 0 } });
  });
  app.post('/api/classes/join', requireUser, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Chỉ tài khoản học sinh mới có thể xin vào lớp.' });
    expireRequests();
    const parsed = z.object({ code: z.string().trim().toUpperCase().min(4).max(32) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Mã lớp không hợp lệ.' });
    const classRow = db.prepare('SELECT * FROM classes WHERE join_code=?').get(parsed.data.code);
    if (!classRow) return res.status(404).json({ error: 'Không tìm thấy lớp học với mã này.' });
    if (isMember(classRow.id, req.user.id)) return res.status(409).json({ error: 'Em đã ở trong lớp này.' });
    if (db.prepare("SELECT 1 FROM class_requests WHERE class_id=? AND student_id=? AND status='pending' AND expires_at>?").get(classRow.id, req.user.id, Date.now())) return res.status(409).json({ error: 'Yêu cầu của em đang chờ giáo viên xét duyệt.' });
    const id = randomUUID(), expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    db.prepare("INSERT INTO class_requests(id,class_id,student_id,kind,status,created_at,expires_at) VALUES (?,?,?,'join_request','pending',?,?)").run(id, classRow.id, req.user.id, Date.now(), expiresAt);
    res.status(201).json({ request: { id, classId: classRow.id, className: classRow.name, expiresAt } });
  });
  app.post('/api/classes/:id/invite', requireUser, requireTeacher, (req, res) => {
    const classRow = classForTeacher(req.params.id, req.user.id);
    if (!classRow) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    expireRequests();
    const parsed = z.object({ studentId: z.string().regex(/^S\d{9}$/) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'ID học sinh không hợp lệ.' });
    const student = db.prepare("SELECT * FROM users WHERE public_id=? AND role='student'").get(parsed.data.studentId);
    if (!student) return res.status(404).json({ error: 'Không tìm thấy học sinh với ID này.' });
    if (isMember(classRow.id, student.id)) return res.status(409).json({ error: 'Học sinh đã ở trong lớp' });
    if (db.prepare("SELECT 1 FROM class_requests WHERE class_id=? AND student_id=? AND status='pending' AND expires_at>?").get(classRow.id, student.id, Date.now())) return res.status(409).json({ error: 'Đã có lời mời hoặc yêu cầu đang chờ xử lý.' });
    const id = randomUUID(), expiresAt = Date.now() + 7 * 24 * 60 * 60 * 1000;
    db.prepare("INSERT INTO class_requests(id,class_id,student_id,kind,status,created_at,expires_at) VALUES (?,?,?,'invite','pending',?,?)").run(id, classRow.id, student.id, Date.now(), expiresAt);
    res.status(201).json({ invitation: { id, student: { fullName: student.full_name, publicId: student.public_id }, expiresAt } });
  });
  app.get('/api/classes/:id/requests', requireUser, requireTeacher, (req, res) => {
    if (!classForTeacher(req.params.id, req.user.id)) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    expireRequests();
    const requests = db.prepare(`SELECT r.id,r.kind,r.created_at,r.expires_at,u.full_name,u.public_id,u.nickname FROM class_requests r JOIN users u ON u.id=r.student_id WHERE r.class_id=? AND r.status='pending' ORDER BY r.created_at ASC`).all(req.params.id).map(row => ({ id: row.id, kind: row.kind, createdAt: row.created_at, expiresAt: row.expires_at, student: { fullName: row.full_name, nickname: row.nickname, publicId: row.public_id } }));
    res.json({ requests });
  });
  app.post('/api/classes/:id/requests/:requestId/respond', requireUser, (req, res) => {
    const parsed = z.object({ decision: z.enum(['accept', 'reject']) }).strict().safeParse(req.body);
    if (!parsed.success || !classIdSchema.safeParse(req.params.id).success || !requestIdSchema.safeParse(req.params.requestId).success) return res.status(400).json({ error: 'Yêu cầu không hợp lệ.' });
    expireRequests();
    const request = db.prepare("SELECT * FROM class_requests WHERE id=? AND class_id=? AND status='pending' AND expires_at>?").get(req.params.requestId, req.params.id, Date.now());
    if (!request) return res.status(404).json({ error: 'Không tìm thấy yêu cầu đang chờ.' });
    const allowed = request.kind === 'join_request' ? Boolean(classForTeacher(request.class_id, req.user.id)) : request.student_id === req.user.id;
    if (!allowed) return res.status(403).json({ error: 'Em không có quyền xử lý yêu cầu này.' });
    db.exec('BEGIN IMMEDIATE');
    try {
      db.prepare("UPDATE class_requests SET status=?,resolved_at=? WHERE id=? AND status='pending'").run(parsed.data.decision === 'accept' ? 'accepted' : 'rejected', Date.now(), request.id);
      if (parsed.data.decision === 'accept') db.prepare('INSERT OR IGNORE INTO class_members(class_id,student_id,joined_at) VALUES (?,?,?)').run(request.class_id, request.student_id, Date.now());
      db.exec('COMMIT');
    } catch (error) { db.exec('ROLLBACK'); throw error; }
    res.json({ ok: true, status: parsed.data.decision === 'accept' ? 'accepted' : 'rejected' });
  });
  app.get('/api/classes/:id/members', requireUser, (req, res) => {
    const teacher = req.user.role === 'teacher' && classForTeacher(req.params.id, req.user.id);
    const student = req.user.role === 'student' && classForStudent(req.params.id, req.user.id);
    if (!teacher && !student) return res.status(403).json({ error: 'Em không có quyền xem lớp này.' });
    const members = db.prepare(`SELECT u.id,u.full_name,u.nickname,u.public_id,m.joined_at FROM class_members m JOIN users u ON u.id=m.student_id WHERE m.class_id=? ORDER BY u.full_name COLLATE NOCASE`).all(req.params.id);
    if (!teacher) return res.json({ members: members.map(row => ({ fullName: row.full_name })) });
    const notes = new Map(db.prepare('SELECT student_id,body,updated_at FROM class_notes WHERE class_id=? AND teacher_id=?').all(req.params.id, req.user.id).map(row => [row.student_id, row]));
    const attempts = db.prepare(`SELECT a.user_id,a.lesson_id,a.lesson_title,a.completed_at,a.review_json,a.teacher_score FROM attempts a JOIN class_members m ON m.student_id=a.user_id WHERE m.class_id=? AND a.is_demo=0 AND a.completed_at IS NOT NULL AND a.review_json IS NOT NULL ORDER BY a.teacher_score DESC, a.completed_at DESC`).all(req.params.id);
    const best = new Map();
    for (const attempt of attempts) { const key = `${attempt.user_id}:${attempt.lesson_id}`; if (!best.has(key)) best.set(key, attempt); }
    const progress = new Map();
    for (const attempt of best.values()) { const review = JSON.parse(attempt.review_json); const values = progress.get(attempt.user_id) ?? []; values.push({ lessonId: attempt.lesson_id, lessonTitle: attempt.lesson_title, evaluation: review.evaluation, completedAt: attempt.completed_at }); progress.set(attempt.user_id, values); }
    res.json({ members: members.map(row => ({ studentId: row.id, fullName: row.full_name, nickname: row.nickname, publicId: row.public_id, joinedAt: row.joined_at, progress: progress.get(row.id) ?? [], note: notes.get(row.id) ? { body: notes.get(row.id).body, updatedAt: notes.get(row.id).updated_at } : null })) });
  });
  app.post('/api/classes/:id/members/:studentId/remove', requireUser, requireTeacher, (req, res) => {
    if (!classForTeacher(req.params.id, req.user.id)) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?').run(req.params.id, req.params.studentId);
    res.json({ ok: true });
  });
  app.post('/api/classes/:id/leave', requireUser, (req, res) => {
    if (req.user.role !== 'student') return res.status(403).json({ error: 'Giáo viên không thể rời lớp do mình quản lý.' });
    db.prepare('DELETE FROM class_members WHERE class_id=? AND student_id=?').run(req.params.id, req.user.id);
    res.json({ ok: true });
  });
  app.post('/api/classes/:id/notes/:studentId', requireUser, requireTeacher, (req, res) => {
    if (!classForTeacher(req.params.id, req.user.id) || !isMember(req.params.id, req.params.studentId)) return res.status(404).json({ error: 'Không tìm thấy học sinh trong lớp.' });
    const parsed = z.object({ body: z.string().trim().max(2000) }).strict().safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: 'Ghi chú không được vượt quá 2000 ký tự.' });
    if (!parsed.data.body) {
      db.prepare('DELETE FROM class_notes WHERE class_id=? AND student_id=? AND teacher_id=?').run(req.params.id, req.params.studentId, req.user.id);
      return res.json({ ok: true });
    }
    db.prepare('INSERT INTO class_notes(class_id,student_id,teacher_id,body,updated_at) VALUES (?,?,?,?,?) ON CONFLICT(class_id,student_id,teacher_id) DO UPDATE SET body=excluded.body,updated_at=excluded.updated_at').run(req.params.id, req.params.studentId, req.user.id, parsed.data.body, Date.now());
    res.json({ ok: true });
  });
  app.post('/api/classes/:id/delete', requireUser, requireTeacher, (req, res) => {
    if (!classForTeacher(req.params.id, req.user.id)) return res.status(404).json({ error: 'Không tìm thấy lớp học.' });
    db.prepare('DELETE FROM classes WHERE id=?').run(req.params.id);
    res.json({ ok: true });
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
