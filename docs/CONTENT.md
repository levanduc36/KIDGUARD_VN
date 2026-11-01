# Kịch bản và video chính thức

Nguồn: `[KIDGUARD VN] KỊCH BẢN PROTOTYPE.xlsx` bản cung cấp ngày 31/10/2026. Chỉ nhập hai sheet `Lừa đảo (revised)` và `Bạo lực học đường (Revised)`; bỏ sheet `Lừa đảo` cũ. Bài mẫu và sáu khung chờ trước đây đã được bỏ khỏi danh mục.

## Danh mục hiện tại

| Bài | ID | Nội dung | Video |
| --- | --- | --- | --- |
| Lừa đảo | `lua-dao` | 6 cảnh lựa chọn, 1 cảnh chuyển tiếp, 11 kết cục | Đủ 18/18 |
| Bạo lực học đường | `bao-luc-hoc-duong` | 6 cảnh lựa chọn, 5 kết cục | Có 4/11 |

Scene 4 của bài Lừa đảo đã thay nội dung thẻ game bằng tin nhắn giả giọng bạn thân nhờ chuyển tiền mua quần áo. Video `sau option 1.1.mp4` chỉ phát sau lựa chọn 1.1, trước Scene 2A. Lựa chọn 6.1 đi thẳng Scene 2A. Tất cả video kết cục đều có màn hình riêng trước bước lưu kết quả.

Bạo lực học đường thiếu video `C_04b`, `C_05`, `END_BAD_1`, `END_BAD_2`, `END_BAD_3`, `END_BAD_4`, `END_GOOD`. Các cảnh vẫn có đầy đủ văn bản, lựa chọn và phân tích theo Excel, không chặn hoàn thành bài.

Các ghi chú điều hướng trong ngoặc của Excel không hiển thị như nội dung dành cho người học. Tham chiếu “xem END_2A.1” được mở rộng thành diễn biến tương ứng, bỏ nhãn kỹ thuật “Node Kết thúc”. Sửa một lỗi chủ ngữ rõ ràng ở END_4.1: người gửi tin **nhận được tiền** rồi chặn bạn. Các lời thoại, đường đi và phân tích còn lại lấy từ sheet revised; nhóm cần duyệt đồng bộ nội dung hình/âm thanh của video với bản chữ. Thời lượng 5–10 phút là ước lượng gồm cả đọc và chọn, không lấy các timeline dàn dựng trong Excel.

Khung mô tả trước video chỉ hiển thị phần **Bối cảnh** của Excel. Cột **Lời thoại nhân vật/Nội dung hiển thị** không xuất hiện ở khung này; lời thoại vẫn thuộc video và kịch bản nguồn. Các phương án lựa chọn giữ nguyên nội dung đã duyệt.

## Cập nhật nội dung

`server/lessons.json` chứa nội dung, điểm và liên kết nhánh. `server/content.mjs` chỉ xuất danh mục và trường công khai; điểm và liên kết không gửi xuống trước khi người học chọn.

Có thể nhập lại Excel bằng Python 3 (không cần thư viện Excel):

```powershell
python -X utf8 scripts/import-content.py 'C:\duong-dan\kich-ban.xlsx'
```

Importer dành cho cấu trúc hai sheet hiện tại; khi thêm cảnh/lựa chọn mới cần cập nhật bảng tên, mapping điểm và video trong script. Import sẽ ghi đè `server/lessons.json`, vì vậy các sửa đổi nội dung cần đưa về Excel hoặc importer để giữ khi nhập lại.

Giữ nguyên ID bài để lịch sử liên kết ổn định. Tăng `version` khi sửa kịch bản, điểm hoặc liên kết nhánh (cả trong importer nếu dùng). Lượt đang làm ở phiên bản cũ phải bắt đầu lại; nội dung lựa chọn, nhận xét và phân tích của lượt đã hoàn thành được lưu riêng, không thay đổi theo nội dung mới.

## Video

`public/videos/manifest.json` đối chiếu tên gốc với file web. File gốc không bị sửa. Bản dùng trên web: MP4 H.264/AAC, 1280×720, `yuv420p`, faststart; poster WebP. Khung hình giữ tỷ lệ, đệm viền khi cần. Tổng dung lượng 22 video khoảng 48 MB. Chỉ mở trình phát sau khi người học nhấn xem video; không tải trước toàn bộ bài.

Mỗi cảnh trong `src/Story.tsx` có ba màn hình tách biệt: đọc mô tả → video lớn căn giữa → lựa chọn. Khi nhận sự kiện `ended`, trình phát được gỡ khỏi giao diện và thay bằng màn hình đáp án/nút tiếp tục. Màn hình này không có video hay mô tả, có nút **Xem lại video** để quay về video từ đầu và giữ đáp án đang chọn. Khi xem lại xong, tự chuyển trở lại màn hình đáp án. Nhấn **Chọn cách xử lý này** sẽ gửi lựa chọn rồi chuyển thẳng sang cảnh tiếp theo, không hiện thông báo ghi nhận hay yêu cầu nhấn thêm nút tiếp tục. Nếu gửi lỗi, giữ đáp án và cho thử lại. Mỗi lần chuyển màn hình đều cuộn về đầu, đặt focus vào tiêu đề; đáp án xếp hai cột trên desktop và một cột trên điện thoại. Số lựa chọn vẫn theo từng cảnh trong kịch bản, không thêm đáp án giả để đủ bốn. Sang cảnh mới luôn trở lại phần mô tả. Nếu trình duyệt chặn tự phát sau khi nhấn xem, người học dùng nút phát trên video. Đây là điều khiển luồng giao diện, không phải cơ chế chứng nhận đã xem từng giây; tính năng tua của trình duyệt vẫn sử dụng được.

Tạo lại các bản chuyển đổi (cần Python và imageio-ffmpeg):

```powershell
python -m pip install --target .tools imageio-ffmpeg
python -X utf8 scripts/prepare-videos.py 'C:\duong-dan\video'
```

Script bỏ qua MP4 đích đã tồn tại. Nếu thay một video gốc, xóa **đúng bản tương ứng** trong `public/videos/` rồi chạy lại. Thêm các video Bạo lực còn thiếu bằng tên ID; đổi `video: null` thành `{ "src": "/videos/...mp4", "poster": "/videos/...webp" }` trong bài và cập nhật importer. Có thể bổ sung `captions` trỏ đến file WebVTT tiếng Việt khi nhóm có phụ đề; hiện chưa có file phụ đề.

Không đưa đường dẫn ổ C: vào nội dung chạy trên web. Vite sao chép thư mục `public/videos` vào `dist`; Express hỗ trợ byte ranges để tua video. Khi đưa lên hosting phải gửi kèm video.

## Điểm tạm để nhóm duyệt

Excel chưa có thang điểm. Điểm hiện tại chỉ phản ánh **hành động lựa chọn**, không chấm cảm xúc, và do phần mềm đề xuất để luồng thành tựu hoạt động. Không coi đây là thang đánh giá tâm lý đã được kiểm định.

| Cảnh | Điểm các lựa chọn theo thứ tự |
| --- | --- |
| Lừa đảo 1 | 0, 1, 1, 2 |
| Lừa đảo 2A | 0, 1, 2 |
| Lừa đảo 2B | 0, 2 |
| Lừa đảo 2C | 0, 2 |
| Lừa đảo 4 | 0, 2 |
| Lừa đảo 6 | 0, 0, 1, 2 |
| Bạo lực C_01, C_02 | 0, 0 (không tính vào mẫu số) |
| Bạo lực C_03, C_04a, C_04b | 0, 2 |
| Bạo lực C_05 | 0, 1, 2 |

Giá trị nội bộ = làm tròn 100 × tổng điểm đạt / tổng điểm tối đa của những cảnh lựa chọn đã đi qua. Cảnh chuyển tiếp và kết cục không cộng điểm. Không hiển thị hoặc trả số điểm trong API lịch sử/kết quả. Khi hoàn thành, máy chủ chuyển giá trị này thành nhận xét và lưu nội dung nhận xét; cột `score` để NULL. Điểm từng đáp án vẫn nằm trong dữ liệu xử lý nội bộ.

| Mức nội bộ | Nhận xét được lưu |
| --- | --- |
| 80–100 | Em xử lý rất tốt! |
| 50–79 | Em đang tiến bộ, hãy chú ý thêm nhé. |
| 0–49 | Cùng luyện thêm để chọn cách an toàn hơn nhé. |

Quy tắc nằm trong `server/results.mjs`. Sau video kết thúc, nút **Hoàn thành và nhìn lại** lưu kết quả và mở “Điều em có thể mang theo”, thay màn hình điểm cũ. Cảnh chuyển tiếp và kết thúc cũng chờ video kết thúc trước khi hiện nút tiếp tục.

## Lịch sử và xem lại

Thành tựu sắp xếp theo thời gian mới nhất trước. Chọn bài rồi chọn một lượt để xem lại nguyên văn tình huống, đáp án đã chọn, phản hồi và phần nhìn lại. API `/api/history/:id` chỉ cho chủ tài khoản đọc lượt đã hoàn thành; không trả điểm hoặc đáp án chưa chọn.

Lượt trùng được xác định bằng tài khoản + bài + phiên bản + chuỗi `(nodeId, choiceId)` theo thứ tự. Chỉ giữ lượt hoàn thành cuối; chưa hoàn thành không thay thế lượt cũ. Cùng nhận xét hoặc cùng kết cục nhưng khác lựa chọn vẫn giữ riêng. Gộp lượt trùng và lưu lượt mới diễn ra trong cùng giao dịch SQLite, có unique index bảo vệ.

Khi khởi động, lịch sử cũ được chuyển từ điểm sang nhận xét và gộp trùng. Lượt cũ cùng phiên bản được khôi phục văn bản từ kịch bản. Nếu phiên bản không còn, vẫn giữ các ID lựa chọn và thông báo thiếu nội dung cũ, không gán văn bản phiên bản mới. Các lượt mới lưu bản sao nội dung ngay lúc chọn, cùng phân tích khi hoàn thành. Tài khoản không bị thay đổi; bài demo tiếp tục ẩn khỏi giao diện.

## Cấu trúc node và kiểm tra

- `kind: question`: có từ hai lựa chọn, mỗi lựa chọn có `id`, `text`, `points`, `feedback`, `next`.
- `kind: narrative`: không có lựa chọn, `next` trỏ đến cảnh tiếp theo. Endpoint `/advance` không cộng lượt chọn.
- `kind: ending`: không có lựa chọn, `next: null`, có `analysis` và lời nhắc tìm hỗ trợ. `/advance` lưu kết quả đúng một lần.
- `video: null`: đọc mô tả rồi nhấn chọn cách xử lý/tiếp tục, không phải chờ video. Với cảnh đã gắn video nhưng tải lỗi, có nút tải lại và vẫn đọc được mô tả; đáp án chưa mở cho tới khi phát xong.

Chạy `npm test`, `npm run build`, `npm run test:e2e` sau thay đổi. Tests kiểm tra mọi đường đi, quyền chủ tài khoản, chống sửa điểm/gửi lặp, chuyển lịch sử cũ, gộp đúng các lượt trùng, xem lại nội dung đã lưu, video và giao diện desktop/mobile.
