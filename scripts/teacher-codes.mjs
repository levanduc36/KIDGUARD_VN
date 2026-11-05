import { DatabaseSync } from 'node:sqlite';
import { createHash, randomBytes } from 'node:crypto';
import { existsSync } from 'node:fs';
import path from 'node:path';
import { emitKeypressEvents } from 'node:readline';

const [command, label = 'Giáo viên', secretOrOption, daysArgument] = process.argv.slice(2);
const expectedSecret = process.env.ADMIN_SETUP_SECRET;
if (!expectedSecret) {
  console.error('Chưa cấu hình ADMIN_SETUP_SECRET cho môi trường đang chạy.');
  process.exit(1);
}
if (command !== 'create') { console.error('Lệnh hiện hỗ trợ: create'); process.exit(1); }
const days = Number(daysArgument ?? 90);
if (!Number.isInteger(days) || days < 1 || days > 365) { console.error('Số ngày hiệu lực phải là số nguyên từ 1 đến 365.'); process.exit(1); }
async function readSecret() {
  if (!process.stdin.isTTY) throw new Error('Cần terminal tương tác để nhập mã quản trị. Với Docker, dùng docker compose exec -it app …');
  process.stdout.write('Nhập ADMIN_SETUP_SECRET (nội dung được ẩn): ');
  emitKeypressEvents(process.stdin);
  const wasRaw = process.stdin.isRaw;
  process.stdin.setRawMode(true); process.stdin.resume();
  return new Promise((resolve, reject) => {
    let value = '';
    const finish = () => { process.stdin.off('keypress', keypress); process.stdin.setRawMode(Boolean(wasRaw)); process.stdin.pause(); process.stdout.write('\n'); };
    const keypress = (text, key) => {
      if (key?.ctrl && key.name === 'c') { finish(); reject(new Error('Đã hủy tạo mã.')); }
      else if (key?.name === 'return' || key?.name === 'enter') { finish(); resolve(value); }
      else if (key?.name === 'backspace') value = value.slice(0, -1);
      else if (text && !key?.ctrl && !key?.meta) value += text;
    };
    process.stdin.on('keypress', keypress);
  });
}
// Keep the previous positional invocation compatible; prefer the hidden prompt
// so a secret does not have to be typed into shell history or process arguments.
let suppliedSecret;
try { suppliedSecret = !secretOrOption || secretOrOption === '--days' ? await readSecret() : secretOrOption; }
catch (error) { console.error(error.message); process.exit(1); }
if (suppliedSecret !== expectedSecret) { console.error('Mã quản trị không đúng.'); process.exit(1); }
const databasePath = process.env.DATABASE_PATH ?? './data/kidguard.sqlite';
if (!existsSync(databasePath)) { console.error('Chưa có cơ sở dữ liệu. Hãy chạy ứng dụng một lần trước.'); process.exit(1); }
const db = new DatabaseSync(path.resolve(databasePath));
const hash = value => createHash('sha256').update(value).digest('hex');
const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
let code = 'TEACH-';
for (let index = 0; index < 10; index++) code += alphabet[randomBytes(1)[0] % alphabet.length];
db.prepare('INSERT INTO teacher_access_codes(code_hash,label,created_at,expires_at) VALUES (?,?,?,?)').run(hash(code), label.slice(0, 120), Date.now(), Date.now() + days * 24 * 60 * 60 * 1000);
db.close();
console.log(`Mã giáo viên cho ${label}: ${code}`);
console.log(`Hiệu lực ${days} ngày, dùng đúng một lần. Hãy gửi mã này qua kênh riêng tư.`);
