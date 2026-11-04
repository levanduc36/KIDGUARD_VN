import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const [command, label = 'Giáo viên', suppliedSecret] = process.argv.slice(2);
const expectedSecret = process.env.ADMIN_SETUP_SECRET;
if (!expectedSecret || !suppliedSecret || suppliedSecret !== expectedSecret) {
  console.error('Dùng: npm run teacher-code -- create "Tên giáo viên" <ADMIN_SETUP_SECRET> [số-ngày-hết-hạn]');
  process.exit(1);
}
if (command !== 'create') { console.error('Lệnh hiện hỗ trợ: create'); process.exit(1); }
const databasePath = process.env.DATABASE_PATH ?? './data/kidguard.sqlite';
if (!existsSync(databasePath)) { console.error('Chưa có cơ sở dữ liệu. Hãy chạy ứng dụng một lần trước.'); process.exit(1); }
const db = new DatabaseSync(path.resolve(databasePath));
const hash = value => createHash('sha256').update(value).digest('hex');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code = 'TEACH-';
for (let index = 0; index < 10; index++) code += alphabet[randomBytes(1)[0] % alphabet.length];
const days = Number(process.argv[5] ?? 90);
if (!Number.isFinite(days) || days < 1 || days > 365) { console.error('Số ngày hiệu lực phải từ 1 đến 365.'); process.exit(1); }
db.prepare('INSERT INTO teacher_access_codes(code_hash,label,created_at,expires_at) VALUES (?,?,?,?)').run(hash(code), label.slice(0, 120), Date.now(), Date.now() + days * 24 * 60 * 60 * 1000);
db.close();
console.log(`Mã giáo viên cho ${label}: ${code}`);
console.log(`Hiệu lực ${days} ngày, dùng đúng một lần. Hãy gửi mã này qua kênh riêng tư.`);
