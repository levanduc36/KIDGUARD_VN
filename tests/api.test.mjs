import { test } from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { createApp } from '../server/app.mjs';
import { lessons } from '../server/content.mjs';
import { evaluationFor, migrateResults } from '../server/results.mjs';

const origin = 'http://localhost:5173';
const headers = { origin, 'content-type': 'application/json', 'x-kidguard-request': '1' };
async function fixture(t, options = {}) {
  const instance = await createApp({ databasePath: ':memory:', authLimit: 100, ...options });
  const server = instance.app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(async () => { await new Promise(resolve => server.close(resolve)); instance.close(); });
  async function request(url, body, cookie, overrides = {}) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api${url}`, {
      method: body === undefined ? 'GET' : 'POST',
      headers: { ...headers, ...(cookie ? { cookie } : {}), ...overrides },
      body: body === undefined ? undefined : JSON.stringify(body),
    });
    const payload = await response.json();
    return { status: response.status, data: payload, headers: response.headers, cookie: response.headers.get('set-cookie')?.split(';')[0] };
  }
  const register = (username = 'test_hero') => request('/auth/register', { username, nickname: 'Người hùng nhí', fullName: 'Người hùng nhí', password: 'a-strong-passphrase-123' });
  return { ...instance, request, register };
}

test('accounts persist, passwords are hashed, sessions rotate and logout revokes access', async t => {
  const { request, register, db } = await fixture(t);
  assert.equal((await request('/lessons')).status, 401);
  const account = await register();
  assert.equal(account.status, 201);
  assert.match(account.headers.get('set-cookie'), /HttpOnly/i);
  assert.match(account.headers.get('set-cookie'), /SameSite=Strict/i);
  assert.equal(account.data.user.username, 'test_hero');
  assert.equal(account.data.user.password_hash, undefined);
  assert.notEqual(db.prepare('SELECT password_hash FROM users').get().password_hash, 'a-strong-passphrase-123');
  assert.equal(db.prepare('SELECT token_hash FROM sessions').get().token_hash.length, 64);
  assert.notEqual(db.prepare('SELECT token_hash FROM sessions').get().token_hash, account.cookie.split('=')[1]);
  assert.equal((await request('/session', undefined, account.cookie)).data.user.username, 'test_hero');
  assert.equal((await register()).status, 409);
  const login = await request('/auth/login', { username: 'TEST_HERO', password: 'a-strong-passphrase-123' }, account.cookie);
  assert.equal(login.status, 200);
  assert.notEqual(login.cookie, account.cookie);
  assert.equal((await request('/lessons', undefined, account.cookie)).status, 401);
  await request('/auth/logout', {}, login.cookie);
  assert.equal((await request('/lessons', undefined, login.cookie)).status, 401);
});

test('validation, CSRF and expired sessions are enforced', async t => {
  const { request, register, db } = await fixture(t);
  const body = { username: 'test_hero', nickname: 'Nhí', fullName: 'Bạn Nhí', password: 'long-password-123' };
  assert.equal((await request('/auth/register', body, null, { origin: 'https://evil.example' })).status, 403);
  assert.equal((await request('/auth/register', body, null, { 'x-kidguard-request': '' })).status, 403);
  assert.equal((await request('/auth/register', { ...body, password: '123' })).status, 400);
  assert.equal((await request('/auth/register', { ...body, username: 'eight_chars', password: '12345678' })).status, 201);
  assert.equal((await request('/auth/register', { ...body, username: 'seven_chars', password: '1234567' })).status, 400);
  assert.equal((await request('/auth/register', { ...body, username: "'; DROP TABLE users;--" })).status, 400);
  const account = await register();
  db.prepare('UPDATE sessions SET expires_at=?').run(Date.now() - 1);
  assert.equal((await request('/history', undefined, account.cookie)).status, 401);
  const unknown = await request('/auth/login', { username: 'missing_user', password: 'wrong' });
  const wrong = await request('/auth/login', { username: 'test_hero', password: 'wrong' });
  assert.equal(unknown.data.error, wrong.data.error);
  assert.equal(unknown.status, 401);
});

test('official branches show endings before saving, protect score and isolate history', async t => {
  const { request, register, db } = await fixture(t);
  const alice = await register('alice_hero');
  const bob = await register('bob_hero');
  const catalog = await request('/lessons', undefined, alice.cookie);
  assert.deepEqual(catalog.data.lessons.map(l => l.id), ['lua-dao', 'bao-luc-hoc-duong']);
  assert.ok(catalog.data.lessons.every(l => l.nodes === undefined));
  assert.equal((await request('/attempts', { lessonId: 'demo' }, alice.cookie)).status, 409);
  for (const safe of [false, true]) {
    const start = await request('/attempts', { lessonId: 'lua-dao' }, alice.cookie);
    assert.equal(start.status, 201);
    assert.equal(start.data.node.choices[0].points, undefined);
    const route = `/attempts/${start.data.id}`;
    const first = { nodeId: 'Scene 1', choiceId: safe ? '1.4' : '1.1' };
    assert.equal((await request(`${route}/choices`, first, bob.cookie)).status, 404);
    assert.equal((await request(`${route}/choices`, { ...first, score: 100 }, alice.cookie)).status, 400);
    assert.equal((await request(`${route}/advance`, { nodeId: 'Scene 1' }, alice.cookie)).status, 409);
    let current = await request(`${route}/choices`, first, alice.cookie);
    assert.equal(current.data.result, null);
    assert.equal((await request(`${route}/choices`, first, alice.cookie)).status, 409);
    if (!safe) {
      assert.equal(current.data.nextNode.id, 'After 1.1');
      assert.match(current.data.nextNode.video.src, /sau-option-1-1/);
      current = await request(`${route}/advance`, { nodeId: 'After 1.1' }, alice.cookie);
      assert.equal(current.data.answered, 1);
      assert.equal(current.data.nextNode.id, 'Scene 2A');
      current = await request(`${route}/choices`, { nodeId: 'Scene 2A', choiceId: '2A.1' }, alice.cookie);
    }
    const ending = current.data.nextNode;
    assert.equal(ending.kind, 'ending');
    assert.ok(ending.video && ending.analysis);
    assert.equal(current.data.result, null);
    assert.equal(db.prepare('SELECT completed_at FROM attempts WHERE id=?').get(start.data.id).completed_at, null);
    assert.equal((await request(`${route}/advance`, { nodeId: ending.id }, bob.cookie)).status, 404);
    const final = await request(`${route}/advance`, { nodeId: ending.id }, alice.cookie);
    assert.equal(final.data.result.evaluation.level, safe ? 'confident' : 'practice');
    assert.equal(final.data.result.score, undefined);
    assert.ok(final.data.result.analysis);
    assert.equal(db.prepare('SELECT score FROM attempts WHERE id=?').get(start.data.id).score, null);
    assert.equal(final.data.result.lessonId, 'lua-dao');
    assert.equal((await request(`${route}/advance`, { nodeId: ending.id }, alice.cookie)).status, 409);
  }
  // Historical demo rows are preserved in storage but never exposed in achievements.
  db.prepare('INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,score,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?)').run('legacy', alice.data.user.id, 'demo', 1, 'Demo', 1, 99, Date.now(), Date.now());
  const history = await request('/history', undefined, alice.cookie);
  assert.deepEqual(history.data.attempts.map(a => a.evaluation.level), ['confident', 'practice']);
  assert.ok(history.data.attempts.every(a => a.score === undefined));
  assert.ok(history.data.attempts.every(a => a.lessonId === 'lua-dao'));
  assert.deepEqual((await request('/history', undefined, bob.cookie)).data.attempts, []);
});

test('every official route can be completed through the API', async t => {
  const { request, register } = await fixture(t, { apiLimit: 2000 });
  const account = await register();
  for (const lesson of lessons) {
    const routes = [];
    function walk(id, actions = [], earned = 0, maximum = 0) {
      const node = lesson.nodes[id];
      if (node.kind === 'ending') { routes.push({ actions: [...actions, [id, null]], earned, maximum }); return; }
      if (node.kind === 'narrative') { walk(node.next, [...actions, [id, null]], earned, maximum); return; }
      for (const choice of node.choices) walk(choice.next, [...actions, [id, choice.id]], earned + choice.points, maximum + Math.max(...node.choices.map(c => c.points)));
    }
    walk(lesson.startNode);
    for (const route of routes) {
      const start = await request('/attempts', { lessonId: lesson.id }, account.cookie);
      let current;
      for (const [nodeId, choiceId] of route.actions) {
        current = await request(`/attempts/${start.data.id}/${choiceId ? 'choices' : 'advance'}`, choiceId ? { nodeId, choiceId } : { nodeId }, account.cookie);
        assert.equal(current.status, 200, `${lesson.id}/${nodeId}: ${JSON.stringify(current.data)}`);
      }
      assert.deepEqual(current.data.result.evaluation, evaluationFor(Math.round(100 * route.earned / Math.max(1, route.maximum))));
    }
  }
});

test('account login throttling is enforced', async t => {
  const { request } = await fixture(t, { authLimit: 2 });
  for (let i = 0; i < 2; i++) assert.equal((await request('/auth/login', { username: 'nobody', password: 'wrong' })).status, 401);
  assert.equal((await request('/auth/login', { username: 'nobody', password: 'wrong' })).status, 429);
});

test('parallel login checks reserve an atomic account budget and reset after expiry or success', async t => {
  const { request, register, db } = await fixture(t);
  await register('parallel_hero');
  const wrong = { username: 'parallel_hero', password: 'wrong' };
  const burst = await Promise.all(Array.from({ length: 18 }, () => request('/auth/login', wrong)));
  assert.equal(burst.filter(r => r.status === 401).length, 10);
  assert.equal(burst.filter(r => r.status === 429).length, 8);
  assert.equal(db.prepare('SELECT count FROM login_failures WHERE username=?').get(wrong.username).count, 10);
  assert.equal((await request('/auth/login', { ...wrong, password: 'a-strong-passphrase-123' })).status, 429);
  db.prepare('UPDATE login_failures SET until_at=? WHERE username=?').run(Date.now() - 1, wrong.username);
  assert.equal((await request('/auth/login', { ...wrong, password: 'a-strong-passphrase-123' })).status, 200);
  assert.equal(db.prepare('SELECT count FROM login_failures WHERE username=?').get(wrong.username), undefined);
  assert.equal((await request('/auth/login', wrong)).status, 401);
  assert.equal(db.prepare('SELECT count FROM login_failures WHERE username=?').get(wrong.username).count, 1);
});

test('attempt recovery returns the saved position or result only to its owner', async t => {
  const { request, register } = await fixture(t);
  const owner = await register('recovery_owner'), stranger = await register('recovery_other');
  const start = await request('/attempts', { lessonId: 'lua-dao' }, owner.cookie);
  const url = `/attempts/${start.data.id}`;
  assert.equal((await request(url)).status, 401);
  assert.equal((await request(url, undefined, stranger.cookie)).status, 404);
  assert.equal((await request(url, undefined, owner.cookie)).data.nextNode.id, 'Scene 1');
  const moved = await request(`${url}/choices`, { nodeId: 'Scene 1', choiceId: '1.4' }, owner.cookie);
  const saved = await request(url, undefined, owner.cookie);
  assert.equal(saved.data.nextNode.id, moved.data.nextNode.id);
  assert.equal(saved.data.answered, 1);
  assert.equal((await request(`${url}/choices`, { nodeId: 'Scene 1', choiceId: '1.1' }, owner.cookie)).status, 409);
  const finished = await request(`${url}/advance`, { nodeId: saved.data.nextNode.id }, owner.cookie);
  for (let index = 0; index < 2; index++) {
    const recovered = await request(url, undefined, owner.cookie);
    assert.deepEqual(recovered.data.result, finished.data.result);
    assert.equal(recovered.data.nextNode, null);
    assert.doesNotMatch(JSON.stringify(recovered.data), /"(?:score|teacher_score|points|maxPoints)":/);
  }
});

test('class invitations, expiry, notes and removal preserve membership boundaries', async t => {
  const { request, register, db } = await fixture(t);
  const code = 'TEACH-CLASS-REGRESSION';
  db.prepare('INSERT INTO teacher_access_codes(code_hash,label,created_at) VALUES (?,?,?)').run(createHash('sha256').update(code).digest('hex'), 'test', Date.now());
  const teacher = await request('/auth/register', { username: 'regression_teacher', fullName: 'Giáo viên kiểm thử', role: 'teacher', teacherCode: code, password: 'a-test-password' });
  const student = await register('regression_student');
  const outsider = await register('regression_outsider');
  const a = (await request('/classes', { name: 'Lớp A' }, teacher.cookie)).data.class;
  const b = (await request('/classes', { name: 'Lớp B' }, teacher.cookie)).data.class;
  const id = student.data.user.id;
  for (const classroom of [a, b]) {
    await request(`/classes/${classroom.id}/invite`, { studentId: student.data.user.publicId }, teacher.cookie);
    const invitation = (await request('/classes', undefined, student.cookie)).data.invitations.find(i => i.classId === classroom.id);
    const responseUrl = `/classes/${classroom.id}/requests/${invitation.id}/respond`;
    assert.equal((await request(responseUrl, { decision: 'accept' }, teacher.cookie)).status, 403);
    assert.equal((await request(responseUrl, { decision: 'accept' }, outsider.cookie)).status, 403);
    assert.equal((await request(responseUrl, { decision: 'accept' }, student.cookie)).status, 200);
    assert.equal((await request(`/classes/${classroom.id}/notes/${id}`, { body: classroom.name }, teacher.cookie)).status, 200);
  }
  assert.equal((await request('/classes', undefined, student.cookie)).data.invitations.length, 0);
  assert.equal((await request(`/classes/${a.id}/notes/${id}`, { body: '' }, student.cookie)).status, 403);
  assert.equal((await request(`/classes/${a.id}/notes/${id}`, { body: '   ' }, teacher.cookie)).status, 200);
  assert.equal((await request(`/classes/${a.id}/members`, undefined, teacher.cookie)).data.members[0].note, null);
  assert.equal((await request(`/classes/${b.id}/members`, undefined, teacher.cookie)).data.members[0].note.body, 'Lớp B');
  assert.equal((await request(`/classes/${a.id}/members/${id}/remove`, {}, student.cookie)).status, 403);
  assert.equal((await request(`/classes/${a.id}/members/${id}/remove`, {}, teacher.cookie)).status, 200);
  assert.equal((await request(`/classes/${a.id}/members`, undefined, student.cookie)).status, 403);
  assert.equal((await request(`/classes/${b.id}/members`, undefined, student.cookie)).status, 200);
  await request(`/classes/${a.id}/invite`, { studentId: student.data.user.publicId }, teacher.cookie);
  const expired = (await request('/classes', undefined, student.cookie)).data.invitations[0];
  db.prepare('UPDATE class_requests SET expires_at=? WHERE id=?').run(Date.now() - 1, expired.id);
  assert.equal((await request(`/classes/${a.id}/requests/${expired.id}/respond`, { decision: 'accept' }, student.cookie)).status, 404);
  assert.equal((await request('/classes', undefined, student.cookie)).data.invitations.length, 0);
  await request('/classes/join', { code: a.joinCode }, outsider.cookie);
  assert.equal((await request('/classes', undefined, teacher.cookie)).data.classes.find(c => c.id === a.id).pendingCount, 1);
});

test('score migration repairs approximate rankings using retained answers and leaves unknown scores unknown', async t => {
  const { register, db } = await fixture(t);
  const owner = await register('migration_scores');
  const insert = db.prepare(`INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,answers,teacher_score,review_json,created_at,completed_at)
    VALUES (?,?,'lua-dao',?,'Lừa đảo',0,?,?,?,1,2)`);
  for (const [id, answers, approximate] of [
    ['perfect', [{ nodeId: 'Scene 1', choiceId: '1.4', points: 2, maxPoints: 2 }], 90],
    ['half', [{ nodeId: 'Scene 1', choiceId: '1.1', points: 1, maxPoints: 2 }], 65],
    ['unknown', [], 65],
    ['unmigrated', [{ nodeId: 'Scene 1', choiceId: '1.2', points: 0, maxPoints: 2 }], null],
  ]) insert.run(id, owner.data.user.id, lessons[0].version, JSON.stringify(answers), approximate, JSON.stringify({ evaluation: evaluationFor(approximate ?? 0), choices: [] }));
  db.prepare('DELETE FROM schema_migrations WHERE name=?').run('exact_teacher_scores_v1');
  db.prepare(`INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,answers,score,created_at,completed_at)
    VALUES ('original-score',?,'lua-dao',?,'Lừa đảo',0,'[]',65,1,2)`).run(owner.data.user.id, lessons[0].version);
  for (let index = 0; index < 2; index++) {
    migrateResults(db, lessons);
    assert.equal(db.prepare('SELECT teacher_score FROM attempts WHERE id=?').get('perfect').teacher_score, 100);
    assert.equal(db.prepare('SELECT teacher_score FROM attempts WHERE id=?').get('half').teacher_score, 50);
    assert.equal(db.prepare('SELECT teacher_score FROM attempts WHERE id=?').get('unknown').teacher_score, null);
    assert.equal(db.prepare('SELECT teacher_score FROM attempts WHERE id=?').get('unmigrated').teacher_score, 0);
    assert.equal(db.prepare('SELECT teacher_score FROM attempts WHERE id=?').get('original-score').teacher_score, 65);
  }
});

test('teacher codes, class membership and learner privacy are enforced', async t => {
  const { request, db } = await fixture(t);
  const teacherCode = 'TEACH-PRIVATE-ONE';
  db.prepare('INSERT INTO teacher_access_codes(code_hash,label,created_at,expires_at) VALUES (?,?,?,?)').run(createHash('sha256').update(teacherCode.toUpperCase()).digest('hex'), 'Cô An', Date.now(), Date.now() + 86_400_000);
  const teacher = await request('/auth/register', { username: 'co_an', nickname: 'Cô An', fullName: 'Nguyễn Thị An', password: 'long-password-123', role: 'teacher', teacherCode });
  const student = await request('/auth/register', { username: 'ban_an', nickname: 'An nhỏ', fullName: 'Trần Minh An', password: 'long-password-123', role: 'student' });
  const another = await request('/auth/register', { username: 'ban_binh', nickname: 'Bình nhỏ', fullName: 'Lê Gia Bình', password: 'long-password-123', role: 'student' });
  assert.equal(teacher.status, 201); assert.match(teacher.data.user.publicId, /^T\d{9}$/);
  assert.equal(student.status, 201); assert.match(student.data.user.publicId, /^S\d{9}$/);
  assert.equal((await request('/auth/register', { username: 'co_lan', nickname: 'Cô Lan', fullName: 'Lê Lan', password: 'long-password-123', role: 'teacher', teacherCode })).status, 400);
  const created = await request('/classes', { name: 'Lớp 5A' }, teacher.cookie);
  assert.equal(created.status, 201);
  assert.equal((await request('/classes', { name: 'Không được' }, student.cookie)).status, 403);
  const classId = created.data.class.id;
  assert.equal((await request('/classes/join', { code: created.data.class.joinCode }, student.cookie)).status, 201);
  assert.equal((await request(`/classes/${classId}/members`, undefined, student.cookie)).status, 403);
  const pending = await request(`/classes/${classId}/requests`, undefined, teacher.cookie);
  assert.equal(pending.data.requests.length, 1);
  assert.equal((await request(`/classes/${classId}/requests/${pending.data.requests[0].id}/respond`, { decision: 'accept' }, another.cookie)).status, 403);
  assert.equal((await request(`/classes/${classId}/requests/${pending.data.requests[0].id}/respond`, { decision: 'accept' }, teacher.cookie)).status, 200);
  const studentView = await request(`/classes/${classId}/members`, undefined, student.cookie);
  assert.deepEqual(studentView.data.members, [{ fullName: 'Trần Minh An' }]);
  const teacherView = await request(`/classes/${classId}/members`, undefined, teacher.cookie);
  assert.equal(teacherView.data.members[0].publicId, student.data.user.publicId);
  assert.equal((await request(`/classes/${classId}/notes/${teacherView.data.members[0].studentId}`, { body: 'Cần hỗ trợ thêm.' }, teacher.cookie)).status, 200);
  assert.equal((await request(`/classes/${classId}/invite`, { studentId: student.data.user.publicId }, teacher.cookie)).status, 409);
  assert.equal((await request(`/classes/${classId}/invite`, { studentId: another.data.user.publicId }, teacher.cookie)).status, 201);
});

test('review snapshots are private, stable and only identical choice paths are replaced', async t => {
  const { request, register, db } = await fixture(t);
  const alice = await register('review_alice');
  const bob = await register('review_bob');
  async function finish(cookie, choices) {
    const start = await request('/attempts', { lessonId: 'lua-dao' }, cookie);
    assert.equal((await request(`/history/${start.data.id}`, undefined, cookie)).status, 404);
    let node = start.data.node;
    let result;
    let index = 0;
    while (node) {
      const response = await request(`/attempts/${start.data.id}/${node.kind === 'question' ? 'choices' : 'advance'}`, node.kind === 'question' ? { nodeId: node.id, choiceId: choices[index++] } : { nodeId: node.id }, cookie);
      assert.equal(response.status, 200);
      node = response.data.nextNode; result = response.data.result;
    }
    return result;
  }
  const first = await finish(alice.cookie, ['1.4']);
  const second = await finish(alice.cookie, ['1.4']);
  assert.notEqual(first.id, second.id);
  assert.equal((await request(`/history/${first.id}`, undefined, alice.cookie)).status, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM attempts WHERE user_id=? AND completed_at IS NOT NULL').get(alice.data.user.id).n, 1);
  assert.equal((await request(`/history/${second.id}`, undefined, bob.cookie)).status, 404);
  assert.equal((await request(`/history/${second.id}`)).status, 401);
  // Both paths receive the same rating but contain different decisions: keep both.
  const third = await finish(alice.cookie, ['1.2', '4.1']);
  const fourth = await finish(alice.cookie, ['1.1', '2A.1']);
  assert.equal(third.evaluation.level, fourth.evaluation.level);
  assert.equal((await request('/history', undefined, alice.cookie)).data.attempts.length, 3);
  await finish(bob.cookie, ['1.4']);
  assert.equal((await request('/history', undefined, alice.cookie)).data.attempts.length, 3);
  const oldText = lessons[0].nodes['Scene 1'].choices[3].text;
  lessons[0].nodes['Scene 1'].choices[3].text = 'Changed after completion';
  try {
    const review = await request(`/history/${second.id}`, undefined, alice.cookie);
    assert.equal(review.data.result.choices[0].choiceText, oldText);
    assert.equal(review.data.result.analysis, second.analysis);
    assert.doesNotMatch(JSON.stringify(review.data), /"(?:score|points|maxPoints)":/);
  } finally { lessons[0].nodes['Scene 1'].choices[3].text = oldText; }
});

test('legacy results migrate once, deduplicate by exact path and keep unrelated users and versions', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kidguard-migration-'));
  const databasePath = path.join(directory, 'test.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = await createApp({ databasePath });
  for (const id of ['alice', 'bob']) first.db.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,full_name,role,public_id) VALUES (?,?,?,?,?,?,?,?)').run(id, id, id, 'hash', 1, id, 'student', `S00000000${id === 'alice' ? '1' : '2'}`);
  const insert = first.db.prepare('INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,answers,score,created_at,completed_at) VALUES (?,?,?,?,?,0,?,?,1,?)');
  const answers = JSON.stringify([{ nodeId: 'Scene 1', choiceId: '1.4', points: 2, maxPoints: 2 }]);
  insert.run('older', 'alice', 'lua-dao', lessons[0].version, 'Lừa đảo', answers, 100, 1000);
  insert.run('latest', 'alice', 'lua-dao', lessons[0].version, 'Lừa đảo', answers, 100, 2000);
  insert.run('different-version', 'alice', 'lua-dao', 1, 'Lừa đảo', answers, 50, 3000);
  insert.run('other-user', 'bob', 'lua-dao', lessons[0].version, 'Lừa đảo', answers, 100, 2000);
  first.close();
  for (let i = 0; i < 2; i++) {
    const current = await createApp({ databasePath });
    try {
      assert.equal(current.db.prepare('SELECT COUNT(*) AS n FROM attempts').get().n, 3);
      assert.equal(current.db.prepare('SELECT * FROM attempts WHERE id=?').get('older'), undefined);
      const row = current.db.prepare('SELECT * FROM attempts WHERE id=?').get('latest');
      const review = JSON.parse(row.review_json);
      assert.equal(row.score, null);
      assert.equal(review.evaluation.message, 'Em xử lý rất tốt!');
      assert.equal(review.choices[0].choiceText, lessons[0].nodes['Scene 1'].choices[3].text);
      assert.equal(review.analysis, lessons[0].nodes['Scene 7'].analysis);
      const archived = JSON.parse(current.db.prepare('SELECT review_json FROM attempts WHERE id=?').get('different-version').review_json);
      assert.match(archived.choices[0].choiceText, /nội dung cũ không còn khả dụng/);
      assert.equal(current.db.prepare('SELECT COUNT(*) AS n FROM users').get().n, 2);
    } finally { current.close(); }
  }
});

test('evaluation messages cover boundary scores without exposing numbers', () => {
  for (const [score, level] of [[0, 'practice'], [49, 'practice'], [50, 'growing'], [79, 'growing'], [80, 'confident'], [100, 'confident']]) {
    assert.equal(evaluationFor(score).level, level);
    assert.doesNotMatch(evaluationFor(score).message, /\d/);
  }
});

test('updated lesson versions reject old attempts on choices and advance', async t => {
  const official = { ...lessons[0], id: 'published-test' };
  lessons.push(official);
  t.after(() => lessons.splice(lessons.indexOf(official), 1));
  const { request, register } = await fixture(t);
  const account = await register();
  const first = await request('/attempts', { lessonId: official.id }, account.cookie);
  const second = await request('/attempts', { lessonId: official.id }, account.cookie);
  await request(`/attempts/${second.data.id}/choices`, { nodeId: 'Scene 1', choiceId: '1.4' }, account.cookie);
  official.version++;
  assert.equal((await request(`/attempts/${first.data.id}/choices`, { nodeId: 'Scene 1', choiceId: '1.4' }, account.cookie)).status, 409);
  assert.equal((await request(`/attempts/${second.data.id}/advance`, { nodeId: 'Scene 7' }, account.cookie)).status, 409);
});

test('production uses HTTPS-only cookies and security headers', async t => {
  await assert.rejects(() => createApp({ databasePath: ':memory:', production: true, origin }), /HTTPS/);
  const { request } = await fixture(t, { production: true, origin: 'https://kidguard.example' });
  const result = await request('/auth/register', { username: 'secure_hero', nickname: 'Nhí', fullName: 'Bạn Nhí', password: 'long-password-123' }, null, { origin: 'https://kidguard.example' });
  assert.equal(result.status, 201);
  assert.match(result.headers.get('set-cookie'), /Secure/);
  assert.match(result.headers.get('content-security-policy'), /frame-ancestors 'none'/);
  assert.match(result.headers.get('strict-transport-security'), /max-age=/);
  assert.equal(result.headers.get('cache-control'), 'no-store');
  assert.equal(result.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(result.headers.get('x-powered-by'), null);
});

test('stored users and history survive a database reopen', async t => {
  const directory = mkdtempSync(path.join(tmpdir(), 'kidguard-test-'));
  const databasePath = path.join(directory, 'test.sqlite');
  t.after(() => rmSync(directory, { recursive: true, force: true }));
  const first = await createApp({ databasePath });
  first.db.prepare('INSERT INTO users(id,username,nickname,password_hash,created_at,full_name,role,public_id) VALUES (?,?,?,?,?,?,?,?)').run('id1', 'persisted_hero', 'Nhí', 'hash', Date.now(), 'Bạn Nhí', 'student', 'S000000001');
  first.db.prepare('INSERT INTO attempts(id,user_id,lesson_id,lesson_version,lesson_title,is_demo,score,created_at,completed_at) VALUES (?,?,?,?,?,?,?,?,?)').run('a1', 'id1', 'demo', 1, 'Demo', 1, 67, Date.now(), Date.now());
  first.close();
  const second = await createApp({ databasePath });
  assert.equal(second.db.prepare('SELECT username FROM users').get().username, 'persisted_hero');
  assert.equal(second.db.prepare('SELECT score FROM attempts').get().score, 67);
  second.close();
});

test('all official nodes are reachable, terminate and reference existing media', () => {
  for (const lesson of lessons) {
    const reached = new Set();
    function visit(id, visited = new Set()) {
      assert.ok(lesson.nodes[id], `Missing node ${id}`);
      assert.ok(!visited.has(id), `Cycle at ${id}`);
      reached.add(id);
      const node = lesson.nodes[id];
      if (node.video) {
        for (const url of [node.video.src, node.video.poster]) {
          assert.match(url, /^\/(?!\/)/);
          assert.ok(existsSync(path.join('public', url)), `Missing media: ${url}`);
        }
      }
      if (lesson.id === 'lua-dao') assert.ok(node.video, `Missing fraud video: ${id}`);
      if (lesson.id === 'bao-luc-hoc-duong') assert.ok(node.video, `Missing bullying video: ${id}`);
      if (node.kind === 'ending') { assert.equal(node.next, null); assert.ok(node.analysis); return; }
      const nextVisited = new Set([...visited, id]);
      if (node.kind === 'narrative') { visit(node.next, nextVisited); return; }
      assert.ok(node.choices.length >= 2);
      assert.equal(new Set(node.choices.map(c => c.id)).size, node.choices.length);
      assert.ok(node.choices.every(c => Number.isFinite(c.points) && c.points >= 0));
      for (const choice of node.choices) visit(choice.next, nextVisited);
    }
    visit(lesson.startNode);
    assert.equal(reached.size, Object.keys(lesson.nodes).length);
  }
  assert.match(lessons[0].nodes['Scene 4'].text, /tin nhắn thoại/);
  assert.doesNotMatch(lessons[0].nodes['Scene 4'].text, /mua quần áo|thẻ game/);
  assert.doesNotMatch(lessons[0].nodes['Scene 1'].text, /Ông cụ:/);
  assert.doesNotMatch(lessons[0].nodes['Scene 2A'].text, /Người gọi \(Số lạ\):/);
  assert.doesNotMatch(lessons[1].nodes['C_03'].text, /^X:/m);
});
