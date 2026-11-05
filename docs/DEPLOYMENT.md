# Đưa KIDGUARD lên máy chủ

Ứng dụng cần **backend Node.js và ổ đĩa lưu dữ liệu bền vững**; không thể chỉ tải thư mục `dist` lên hosting tĩnh để có tài khoản và lịch sử thật. Cách dưới đây dùng một VPS Linux, Docker Compose, tên miền và Caddy cấp HTTPS.

## 1. Chuẩn bị

- VPS đã cài Docker Engine và Docker Compose.
- Một tên miền trỏ A/AAAA đến VPS; mở cổng 80 và 443. Không mở cổng API 3001 ra Internet.
- Đưa mã nguồn lên VPS. Không sao chép `.env`, `data/`, `.artifacts/`, `.tools/` hoặc `node_modules/` từ máy phát triển.
- Tạo `.env` cạnh `compose.yaml` với nội dung:

```dotenv
SITE_DOMAIN=hoc.ten-mien-cua-ban.vn
ADMIN_SETUP_SECRET=thay-bang-chuoi-ngau-nhien-dai-cua-ban
```

## 2. Khởi động

```sh
docker compose up -d --build
docker compose logs -f app caddy
```

Mở `https://hoc.ten-mien-cua-ban.vn`. Caddy nhận HTTPS và chuyển request tới ứng dụng trên mạng nội bộ của Docker. Ứng dụng chạy bằng tài khoản `node`, bật cookie Secure và chỉ chấp nhận Origin đã cấu hình.

Database được lưu trong volume `kidguard_data`. `docker compose down` giữ lại dữ liệu; **không chạy `docker compose down -v`** nếu cần giữ tài khoản và lịch sử.

### Tạo mã giáo viên trên hosting

Tạo một secret riêng cho máy chủ, ví dụ bằng `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`, rồi lưu giá trị đó vào `ADMIN_SETUP_SECRET` trong `.env` trên máy chủ. Không dùng nguyên giá trị mẫu. Khi thay secret, chạy lại `docker compose up -d` để container nhận cấu hình mới.

Sau khi ứng dụng khởi động, chạy CLI **bên trong container app** để dùng đúng database trong volume:

```sh
docker compose exec -it app npm run teacher-code -- create "Tên giáo viên" --days 90
```

CLI yêu cầu nhập secret nhưng ẩn nội dung đang nhập. Mã giáo viên được in sau khi tạo thành công, dùng một lần, hết hạn sau 90 ngày; gửi mã đó riêng cho giáo viên. Có thể đổi số ngày từ 1 đến 365. Không cần ghi secret vào lệnh shell. Nếu quên cấu hình secret, ứng dụng vẫn chạy nhưng CLI không cho tạo mã.

Khi chạy trực tiếp bằng Node trên máy local, lệnh tương ứng là `npm run teacher-code -- create "Tên giáo viên" --days 90`. Cách gọi cũ có secret trong đối số vẫn tương thích, nhưng nên dùng cách nhập ẩn mới. Không tạo mã trên database local nếu định dùng cho website trên hosting.

## 3. Cập nhật

Sao lưu trước, cập nhật mã nguồn, chạy kiểm thử trên môi trường thử nghiệm rồi chạy lại:

```sh
docker compose up -d --build
```

Không chạy nhiều bản sao app dùng các tệp SQLite riêng nếu muốn chung tài khoản. Phiên bản hiện tại dành cho một instance. Nếu cần mở rộng, chuyển sang cơ sở dữ liệu dùng chung và kho giới hạn tốc độ dùng chung.

## 4. Sao lưu và phục hồi

Dùng SQLite backup API hoặc dừng app khi sao chép database để tránh ảnh chụp không nhất quán với WAL. Ví dụ sao lưu thủ công khi dừng app:

```sh
docker compose stop app
docker compose cp app:/app/data ./backup-data
docker compose start app
```

Mỗi lần nên dùng thư mục backup riêng có ngày tháng. Lưu bản sao ngoài VPS, giới hạn quyền truy cập và định kỳ thử phục hồi trong môi trường tách biệt. Database chứa dữ liệu riêng và bản băm mật khẩu; không đưa bản sao lưu vào Git hoặc thư mục public.

## Hosting Node khác

Chạy `npm ci`, `npm run build`, sau đó `npm start`. Cấu hình:

```dotenv
NODE_ENV=production
APP_ORIGIN=https://ten-mien-thuc-te.vn
HOST=0.0.0.0
PORT=3001
DATABASE_PATH=/duong-dan-o-dia-ben-vung/kidguard.sqlite
```

Chỉ bật `TRUST_PROXY=1` khi ứng dụng nằm sau đúng một reverse proxy tin cậy; cấu hình mạng để không truy cập thẳng backend. API và frontend nên dùng cùng tên miền. Không đặt cơ sở dữ liệu trên filesystem tạm của nền tảng serverless.

## Trước khi mở sử dụng thật

Nhóm cần hoàn thiện và duyệt kịch bản/video, quyết định quy trình hỗ trợ khi quên mật khẩu, yêu cầu xóa tài khoản, thông báo cách sử dụng dữ liệu và lịch sao lưu. Chưa có thanh toán, email, quảng cáo hoặc hệ thống theo dõi người dùng trong bản hiện tại.

Cấu hình Docker được cung cấp để triển khai sau; chưa được chạy trên VPS trong lần bàn giao này.
