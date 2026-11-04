# KIDGUARD VN · Khiên chắn nhí

Website giáo dục bằng tiếng Việt, xây dựng dựa trên PDF và hai ảnh nhận diện của nhóm. Đây là mã nguồn chạy độc lập trên máy, **chưa triển khai lên Internet**.

## Chạy trên máy

Cần **Node.js 24.x** và npm. Backend dùng SQLite tích hợp trong Node 24, không cần cài phần mềm cơ sở dữ liệu riêng.

```powershell
npm install
npm run dev
```

Mở **http://localhost:5173**. Frontend ở cổng 5173, API ở 3001. Nhấn `Ctrl+C` để dừng. Tạo tài khoản trực tiếp trên giao diện; không có tài khoản hoặc mật khẩu mặc định.

Nếu cần đổi cấu hình, sao chép `.env.example` thành `.env`, sau đó chỉnh các biến. Để chạy bản đã tối ưu:

```powershell
npm run build
npm start
```

Mở **http://localhost:3001**. Không đặt `NODE_ENV=production` khi dùng HTTP trên máy; chế độ production yêu cầu HTTPS và cookie Secure.

### Cấp mã giáo viên

Đặt `ADMIN_SETUP_SECRET` dài, ngẫu nhiên trong `.env` (không đưa file này lên Git). Sau khi đã chạy ứng dụng ít nhất một lần để tạo database, tạo một mã dùng một lần bằng PowerShell:

```powershell
npm run teacher-code -- create "Tên giáo viên" "giá-trị-ADMIN_SETUP_SECRET" 90
```

Lệnh in ra mã `TEACH-...`, có hiệu lực 90 ngày trong ví dụ. Gửi mã qua một kênh riêng tư; mã chỉ được lưu dạng băm và tự trở thành không dùng được sau khi một giáo viên đăng ký thành công.

## Đã có

- Đăng ký chọn vai trò **học sinh** hoặc **giáo viên**, yêu cầu họ tên và tự tạo ID công khai `S`/`T` kèm 9 chữ số. Giáo viên cần mã xác minh dùng một lần do người vận hành cấp.
- Mục **Lớp học**: giáo viên tạo/xóa nhiều lớp, có mã lớp cố định, mời học sinh theo ID, duyệt yêu cầu tham gia, xem tiến độ tốt nhất của từng bài và lưu ghi chú riêng theo lớp. Học sinh gửi yêu cầu bằng mã lớp, phản hồi lời mời, rời lớp và chỉ thấy họ tên bạn cùng lớp.

- Trang chào, đăng ký, đăng nhập, đăng xuất; hỗ trợ điện thoại và bàn phím.
- Tài khoản thật, mật khẩu băm và phiên đăng nhập có hạn 7 ngày; dữ liệu tồn tại sau khi khởi động lại.
- Thư viện chỉ còn hai bài chính thức: **Lừa đảo** và **Bạo lực học đường**, theo hai sheet revised trong Excel cập nhật ngày 31/10/2026. Đã bỏ bài mẫu, bộ lọc và khung khẩu hiệu ở thanh bên.
- Lừa đảo có đủ 18 video, gồm video chuyển cảnh và các kết cục. Bạo lực học đường có 4 video; 7 cảnh còn thiếu hiển thị nội dung chữ để vẫn học trọn bài.
- Video được tạo bản H.264/AAC 720p có faststart và ảnh poster, tổng khoảng 48 MB cho 22 video; file gốc được giữ nguyên.
- Mỗi cảnh có ba màn hình riêng: mô tả → video → lựa chọn. Video kết thúc tự chuyển sang màn hình đáp án, không còn trình phát hoặc khung mô tả. Nút **Xem lại video** mở lại màn hình video từ đầu và giữ lựa chọn đang chọn. Mỗi lần chuyển màn hình đều về đầu trang; đáp án xếp hai cột trên desktop, một cột trên điện thoại. Cảnh chưa có video cho đọc mô tả rồi tiếp tục chọn đáp án.
- Sau cảnh kết thúc, nhấn **Hoàn thành và nhìn lại** để mở phần “Điều em có thể mang theo”. Không hiển thị điểm số. Máy chủ dùng quy tắc nội bộ để lưu nhận xét ngắn theo ba mức, xem [CONTENT.md](docs/CONTENT.md).
- Thành tựu chỉ hiển thị bài chính thức, lần mới nhất trước. Nhấn bài học rồi nhấn một lần làm để xem nhận xét, tình huống, từng lựa chọn đã chọn và phần nhìn lại. Cùng một chuỗi lựa chọn trong cùng bài/phiên bản chỉ giữ lần hoàn thành mới nhất; cùng nhận xét nhưng khác lựa chọn vẫn giữ riêng.
- Lịch sử cũ tự chuyển sang nhận xét và gộp lượt trùng khi máy chủ khởi động. Dữ liệu bài minh họa cũ được giữ trong DB nhưng không xuất hiện trên giao diện/API lịch sử.
- Nếu bỏ dở bài học, lượt đó không xuất hiện trong Thành tựu; lần sau bắt đầu lượt mới. Giao diện có xác nhận khi rời bài.

## Cấu trúc

```text
src/App.tsx             Các màn hình và luồng tương tác
src/Story.tsx           Luồng mô tả → video → lựa chọn theo từng cảnh
src/styles.css          Giao diện responsive
src/api.ts              Kiểu dữ liệu và gọi API
server/app.mjs          Auth, phiên đăng nhập, cơ sở dữ liệu, bài làm
server/results.mjs      Nhận xét, lưu lựa chọn, chuyển lịch sử cũ và gộp lượt trùng
src/Results.tsx         Màn hình hoàn thành và xem lại lựa chọn
server/content.mjs      Xuất danh mục và câu hỏi công khai
server/lessons.json     Hai cây kịch bản chính thức và quy tắc điểm
public/videos/         Video, poster và manifest đối chiếu tên file
scripts/import-content.py  Nhập hai sheet revised từ Excel
scripts/prepare-videos.py  Tạo bản video tương thích trình duyệt
server/index.mjs        Khởi động máy chủ
public/assets/         Logo, nhân vật và ảnh tình huống từ tài liệu đã cung cấp
data/kidguard.sqlite    Dữ liệu tài khoản và lịch sử (tự tạo, không đưa vào Git)
tests/                 Kiểm thử API/bảo mật và hành trình trình duyệt
docs/CONTENT.md         Hướng dẫn thêm kịch bản, video và phụ đề
docs/DEPLOYMENT.md      Hướng dẫn đưa lên máy chủ có HTTPS
```

## Dữ liệu và bảo mật

Yêu cầu họ tên, tên đăng nhập, biệt danh và mật khẩu; không yêu cầu ngày sinh, email, địa chỉ hay số điện thoại. Họ tên chỉ hiển thị cho giáo viên của lớp và các học sinh đã cùng tham gia lớp. Không có tracker hoặc tải tài nguyên từ máy chủ bên thứ ba khi người học sử dụng website.

Mật khẩu dùng `scrypt` với salt ngẫu nhiên; session token ngẫu nhiên chỉ lưu bản băm trong SQLite. Cookie có `HttpOnly`, `SameSite=Strict`, và `Secure` ở production. Các API thay đổi dữ liệu kiểm tra Origin, header riêng và JSON; không bật CORS. API có giới hạn tốc độ, đăng nhập sai có giới hạn theo IP và tên tài khoản. Truy vấn SQL dùng tham số; lịch sử và bài làm luôn kiểm tra chủ tài khoản. Các header CSP, chống nhúng iframe và chống đoán MIME được cấu hình bằng Helmet. Cách cấu hình tham khảo [Express Security](https://expressjs.com/en/advanced/best-practice-security/) và [Node Crypto](https://nodejs.org/docs/latest-v24.x/api/crypto.html).

Ảnh được chuyển WebP; font tiếng Việt phục vụ từ chính website; thẻ bài dùng lazy loading; Vite tối ưu bản build. Nội dung API không cache, tài nguyên tĩnh cache một ngày. SQLite có index, WAL, và dọn phiên hết hạn/lượt bỏ dở quá 7 ngày.

**Giới hạn cần biết:** chưa có khôi phục mật khẩu, xác minh email, giao diện quản trị nội dung, đồng bộ nhiều máy chủ hay tự sao lưu. Không thu email nên chưa thể gửi liên kết đặt lại mật khẩu. Phiên bản này phù hợp thử nghiệm và triển khai một máy chủ; trước khi mở cho người dùng thật, cần quyết định quy trình hỗ trợ tài khoản, xóa dữ liệu, thông báo quyền riêng tư và nội dung đã được nhóm duyệt.

## Kiểm thử

```powershell
npm test
npm run build
npm run test:e2e
```

Kiểm thử API dùng database độc lập. Kiểm thử trình duyệt cần Microsoft Edge, tự mở máy chủ tại cổng 4173 và dùng `.artifacts/e2e.sqlite`; không tác động dữ liệu tài khoản tại `data/`. Kiểm tra trên desktop và kích thước điện thoại. Nếu dùng hệ điều hành khác không có Edge, cài trình duyệt Playwright rồi đổi `channel: 'msedge'` trong `playwright.config.ts` sang trình duyệt tương ứng.

Kiểm chứng cập nhật ngày 01/11/2026: build thành công; 12 kiểm thử API/nội dung đã đạt ở lần cập nhật lịch sử. Luồng video mới đạt 4 kiểm thử desktop/mobile: mô tả trước video, ẩn lựa chọn đến hết video, phát lại, chuyển cảnh, tải lại video lỗi, cảnh thiếu video và toàn bộ hành trình học/xem lịch sử. Kiểm tra phát/tua/byte ranges cả 22 video đã đạt ngày 31/10; lần cập nhật này không đổi video hoặc API. Chưa kiểm thử triển khai Docker/VPS.

## Ghi chú thiết kế

Giữ logo khiên, cặp nhân vật nhí, phong cách thư viện từ tài liệu; danh mục đã thay bằng hai kịch bản chính thức của nhóm. Điều chỉnh tông xanh ngọc, xanh lá dịu và vàng để giao diện thống nhất, dễ dùng. Các mục yêu thích và Premium trong PDF không triển khai vì nằm ngoài luồng được yêu cầu. Phông Be Vietnam Pro được phân phối kèm gói Fontsource theo giấy phép SIL Open Font License.
