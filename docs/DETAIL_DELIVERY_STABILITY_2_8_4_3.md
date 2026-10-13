# Amorri Studio VNext 2.8.4.3 — Chi tiết lịch, xóa an toàn, phản hồi và chọn ảnh

## Những thay đổi

1. **Chi tiết lịch trên web React:** tải riêng bản ghi mới nhất qua API Admin và trình bày thông tin dịch vụ, liên hệ, giờ và địa điểm, rước dâu hai nhà, phân công (vai trò/công việc/chi phí), link Source, hợp đồng/đã cọc, ghi chú, danh sách sản phẩm và copy link bàn giao. Bỏ nút "Mở nghiệp vụ nâng cao" ở cửa sổ chi tiết.
2. **Xóa lịch:** nút nằm góc trái trong thanh dưới màn hình chỉnh sửa lịch. Bấm nút mới xuất hiện popup; phải gõ tên lịch chính xác. Backend lưu bản dự phòng được mã hóa **trước khi** xóa. Xóa chính xác bản ghi phiên bản đang xem bằng REST ETag `If-Match`; nếu thay đổi đồng thời hoặc không thể xác thực kết quả, từ chối/giữ backup.
3. **Mã hóa bản dự phòng:** ưu tiên `AMORRI_ARCHIVE_ENCRYPTION_KEY` gồm 64 ký tự hex. Nếu chưa có biến này nhưng `DRIVE_VIDEO_SIGNING_SECRET` hiện tại có ít nhất 32 ký tự, backend tạo một khóa độc lập bằng SHA-256 có phân tách mục đích, và lưu `keySource=signing-derived-v1` trong bản dự phòng. Nếu thiếu cả hai, tính năng xóa **vẫn khóa** thay vì lưu bản rõ.
4. **Góp ý timeline:** không còn giới hạn vĩnh viễn tổng 200 bình luận trên một link. Sử dụng giới hạn tối đa 120 lượt mỗi giờ và tối thiểu 1 giây giữa hai lần gửi. Góp ý vẫn được lưu đúng nhánh `videoReviews_v1`.
5. **Chọn ảnh:** xác minh ảnh vẫn thuộc thư mục Google Drive, rồi ghi có điều kiện ETag. Firebase HTTP `412` có thể được đọc lại và thử tối đa 4 lượt; không tự ghi đè thay đổi khác trên cùng lịch. Nếu Admin thực sự thay đổi thư mục ảnh, trả `SELECTION_SOURCE_CHANGED` để khách tải lại bộ ảnh. Nếu mạng mất sau khi gửi PUT, báo kết quả chưa xác định thay vì tự phát lại và có nguy cơ ghi lặp.

## Thiết lập khóa mã hóa trên Vercel

Khuyến nghị sử dụng **khóa riêng** để việc thay đổi cấu hình video không ảnh hưởng khả năng khôi phục các bản dự phòng.

- Mở Settings → Environment Variables trên dự án Vercel.
- Tạo biến `AMORRI_ARCHIVE_ENCRYPTION_KEY`, đặt là **Secret**, áp dụng cho môi trường triển khai tương ứng.
- Tạo giá trị mới **một lần duy nhất** trên máy cá nhân bằng lệnh:

  `node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"`

- Giữ giá trị an toàn và ổn định; **không dán vào GitHub, ảnh chụp hoặc chat**.
- Redeploy sau khi cập nhật môi trường, bởi Vercel deployment hiện tại không tự lấy giá trị mới.

Nếu trước khi thêm khóa riêng, studio từng xóa lịch bằng khóa dẫn xuất từ `DRIVE_VIDEO_SIGNING_SECRET`, bạn **phải giữ lại secret gốc** để có thể giải mã những bản dự phòng có `keySource=signing-derived-v1`. Bản dự phòng cũ không có `keySource` vẫn dùng khóa chuyên dụng như trước.

## Checklist kiểm thử trên Vercel Preview + Firebase staging

- [ ] Đăng nhập Admin → mở Chi tiết lịch → đầy đủ thông tin, không còn nút `/studio`.
- [ ] Chỉnh sửa lịch → nút Xóa lịch ở cuối bên trái → popup xác nhận → chỉ xóa khi nhập tên đúng.
- [ ] Không cấu hình khóa hợp lệ → xác nhận DELETE bị chặn, lịch vẫn còn.
- [ ] Cấu hình khóa hợp lệ → xóa lịch mẫu → kiểm tra có ciphertext trong `amorriStudioAdminArchive_v1/events/{eventId}` và bản ghi lịch biến mất.
- [ ] Hai Admin sửa/xóa đồng thời: một thao tác nhận xung đột; không có silent overwrite.
- [ ] Khách gửi hai bình luận cách nhau hơn 1 giây → cả hai được ghi; gửi quá sát → có thông báo đợi, không mất link.
- [ ] Với một link trước đây đã có 200 góp ý, thử gửi mới: không còn bị khóa vĩnh viễn vì tổng lượt cũ.
- [ ] Khách chọn nhiều ảnh và gửi → F5 → danh sách được giữ; thử trong lúc Admin sửa ghi chú lịch.
- [ ] Admin đổi link Drive ngay lúc khách gửi ảnh → trả `SELECTION_SOURCE_CHANGED` và yêu cầu tải lại, không lưu nhầm file.

## Hạn chế cần biết

Không thể xác nhận các thao tác với Firebase Production hoặc Next.js build đầy đủ trong môi trường tạo mã nguồn do dependencies npm chưa được cài. Các thao tác hiện tại đã qua unit test/kiểm tra cấu trúc/cú pháp; cần kiểm thử các luồng staging ở trên trước khi đưa lên Production.

`/studio` legacy vẫn có các thao tác ghi Firebase trực tiếp không đi qua cơ chế ETag của VNext. Không chỉnh sửa cùng một lịch đồng thời ở hai giao diện; tiếp tục di trú các đường ghi đó trước khi siết Security Rules.
