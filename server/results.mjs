import { createHash } from 'node:crypto';

export function evaluationFor(score) {
  if (score >= 80) return { level: 'confident', message: 'Em xử lý rất tốt!' };
  if (score >= 50) return { level: 'growing', message: 'Em đang tiến bộ, hãy chú ý thêm nhé.' };
  return { level: 'practice', message: 'Cùng luyện thêm để chọn cách an toàn hơn nhé.' };
}

function routeKey(attempt, answers) {
  return createHash('sha256').update(JSON.stringify([attempt.lesson_version, answers.map(a => [a.nodeId, a.choiceId])])).digest('hex');
}

function reviewFor(attempt, answers, lesson, ending, score) {
  const sameVersion = lesson?.version === attempt.lesson_version;
  return {
    evaluation: evaluationFor(score),
    analysis: ending?.analysis ?? '', help: ending?.help ?? '',
    endingTitle: ending?.title ?? 'Câu chuyện đã hoàn thành',
    choices: answers.map(answer => {
      const node = sameVersion ? lesson.nodes[answer.nodeId] : null;
      const choice = node?.choices.find(c => c.id === answer.choiceId);
      return {
        nodeId: answer.nodeId, choiceId: answer.choiceId,
        title: answer.title ?? node?.title ?? 'Tình huống ở phiên bản trước',
        text: answer.text ?? node?.text ?? '',
        choiceText: answer.choiceText ?? choice?.text ?? `Lựa chọn ${answer.choiceId} (nội dung cũ không còn khả dụng)`,
        feedback: answer.feedback ?? choice?.feedback ?? '',
      };
    }),
  };
}

export function resultSummary(row) {
  const review = JSON.parse(row.review_json);
  return { id: row.id, lessonId: row.lesson_id, lessonTitle: row.lesson_title,
    completedAt: row.completed_at, evaluation: review.evaluation };
}

export function resultDetail(row) {
  return { ...resultSummary(row), ...JSON.parse(row.review_json) };
}

// One-time, transactional conversion of old scored results. No accounts are changed.
export function migrateResults(db, lessons) {
  const columns = db.prepare('PRAGMA table_info(attempts)').all().map(c => c.name);
  db.exec('BEGIN IMMEDIATE');
  try {
    if (!columns.includes('review_json')) db.exec('ALTER TABLE attempts ADD COLUMN review_json TEXT');
    if (!columns.includes('route_key')) db.exec('ALTER TABLE attempts ADD COLUMN route_key TEXT');
    // Older app processes may have inserted legacy rows after the first migration.
    // Rebuild the constraint inside this transaction after normalizing those rows.
    db.exec('DROP INDEX IF EXISTS attempts_unique_route');
    for (const row of db.prepare('SELECT * FROM attempts WHERE completed_at IS NOT NULL AND is_demo=0 AND review_json IS NULL').all()) {
      const answers = JSON.parse(row.answers);
      const lesson = lessons.find(l => l.id === row.lesson_id && l.version === row.lesson_version);
      const last = answers.at(-1);
      let endingId = lesson?.nodes[last?.nodeId]?.choices.find(c => c.id === last?.choiceId)?.next;
      const visited = new Set();
      while (endingId && lesson.nodes[endingId]?.kind === 'narrative' && !visited.has(endingId)) {
        visited.add(endingId); endingId = lesson.nodes[endingId].next;
      }
      const ending = lesson?.nodes[endingId];
      const review = reviewFor(row, answers, lesson, ending, row.score ?? 0);
      // Empty legacy answers cannot establish that two histories are identical.
      db.prepare('UPDATE attempts SET review_json=?, route_key=?, score=NULL WHERE id=?').run(JSON.stringify(review), answers.length ? routeKey(row, answers) : null, row.id);
    }
    db.exec(`DELETE FROM attempts WHERE rowid IN (
      SELECT rowid FROM (SELECT rowid, ROW_NUMBER() OVER (
        PARTITION BY user_id, lesson_id, route_key ORDER BY completed_at DESC, rowid DESC
      ) AS position FROM attempts WHERE completed_at IS NOT NULL AND is_demo=0 AND route_key IS NOT NULL)
      WHERE position > 1
    );
    CREATE UNIQUE INDEX IF NOT EXISTS attempts_unique_route ON attempts(user_id, lesson_id, route_key)
      WHERE completed_at IS NOT NULL AND is_demo=0 AND route_key IS NOT NULL;`);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
}

export function completeAttempt(db, attempt, lesson, node, answers) {
  const score = Math.round(100 * answers.reduce((sum, a) => sum + a.points, 0) / Math.max(1, answers.reduce((sum, a) => sum + a.maxPoints, 0)));
  const review = reviewFor(attempt, answers, lesson, node, score);
  const key = routeKey(attempt, answers);
  const completedAt = Date.now();
  db.exec('BEGIN IMMEDIATE');
  try {
    db.prepare('DELETE FROM attempts WHERE user_id=? AND lesson_id=? AND route_key=? AND completed_at IS NOT NULL AND is_demo=0 AND id<>?').run(attempt.user_id, lesson.id, key, attempt.id);
    db.prepare('UPDATE attempts SET current_node=NULL, answers=?, score=NULL, completed_at=?, review_json=?, route_key=? WHERE id=?').run(JSON.stringify(answers), completedAt, JSON.stringify(review), key, attempt.id);
    db.exec('COMMIT');
  } catch (error) { db.exec('ROLLBACK'); throw error; }
  return resultDetail({ ...attempt, completed_at: completedAt, review_json: JSON.stringify(review) });
}
