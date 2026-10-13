# Amorri Studio VNext 2.8.2 — Scheduling & Delivery Fix

Bản nâng cấp đầy đủ trên nền **2.8.1**, tập trung xử lý lỗi `SCHEDULE_BUSY` và tối giản Dashboard **Bàn giao sản phẩm**. Giữ nguyên Firebase, Google Drive, dữ liệu `studioPlanner_v1`, gallery khách và `/studio` tương thích. **Không áp dụng lại Security Rules production hoặc migrate dữ liệu.**

## Thay đổi chính

1. **SCHEDULE_BUSY**: Chuyển khóa ghi lịch từ một khóa toàn studio `schedulingWriteLock_v2` có thể treo 60 giây sang khóa theo ngày `schedulingWriteLocks_v3/YYYY-MM-DD`, lease 30 giây gia hạn mỗi 8 giây và chỉ giải phóng khi đúng owner. Các thao tác khác ngày không phải chờ nhau. Khi trùng lịch hoặc ngày nghỉ thật, vẫn trả `SCHEDULE_CONFLICT`.
2. **Lịch rước dâu**: khi thay `startTrai`/`startGai`, API sửa lịch kiểm tra lại trùng phân công; truy vấn lịch nghỉ chỉ lọc đúng ngày thay vì tải toàn bộ collection. Hai đường tạo/sửa lịch cùng kiểm tra nhân sự, trùng lịch và phiên bản dữ liệu trên server.
3. **Thumbnail**: gỡ lớp `admin-thumbnail-type` đang đè lên hình; ảnh bìa 16:9 vẫn lấy từ Drive, không phát sinh giải mã MP4 trên Vercel.
4. **Link an toàn**: chỉ còn **Copy link an toàn**. Nhấn một lần là copy: API transaction dùng lại một link có hiệu lực hoặc tạo một link mới nếu chưa có. Không tạo thêm mỗi lần copy/F5. Các link cũ chỉ lưu hash **không thể giải mã** sẽ bị thu hồi khi Admin nhấn nút lần đầu để tạo link mới; khách cũ cần nhận lại link đó. Token lưu hash để xác thực và bản mã hóa AES-GCM để Admin copy lại. Mặc định hiệu lực 30 ngày.
5. **Bàn giao ảnh**: hiện `Khách đã chọn N ảnh` ngay trong chi tiết cùng nút **Copy tên ảnh** cho Admin; không hiện nút này với bộ chỉ có clip. Xóa panel **Kiểm tra ảnh / clip & ảnh đã chọn** dài dòng.
6. **Bàn giao clip**: chỉ hiện **Góp ý timeline** với bộ được API Admin xác minh có file video. Bộ có cả ảnh và video hiển thị hai chức năng tương ứng. Phân loại dựa trên MIME thực từ Drive, không dựa đơn thuần vào tên.
7. **delivery-details**: loại bỏ danh sách sản phẩm dài, giảm padding và nút phụ. Xóa badge đè thumbnail. Trang bàn giao khách và nút chọn ảnh của khách được giữ nguyên.

## Cấu hình Vercel

Không cần biến môi trường mới. Giữ nguyên `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, `DRIVE_SERVICE_ACCOUNT_JSON`, `DRIVE_VIDEO_SIGNING_SECRET`, `AMORRI_ADMIN_UIDS`… đang hoạt động.

Nếu dùng `AMORRI_DELIVERY_LINK_KEY`, cần giữ nguyên khóa đủ mạnh (>=32 ký tự) để có thể lấy lại link đã tạo; nếu không có, code dùng `DRIVE_VIDEO_SIGNING_SECRET` đã đủ mạnh. **Đừng xoay khóa tùy tiện** nếu không muốn link cũ không copy lại được. Không gửi keys/tokens cho bất cứ ai ngoài đối tượng được phép.

1. Giải nén và cập nhật repository, deploy **Vercel Preview**.
2. Mở `/api/health`, xác nhận `release` = `schedule-delivery-20261013-r1`.
3. Staging: tạo lịch A và B ở *hai ngày khác nhau* đồng thời; sửa lịch, cập nhật giờ rước dâu và thử xếp hai ca trùng thật; kiểm tra trả `SCHEDULE_CONFLICT` thay vì `SCHEDULE_BUSY` do khóa toàn studio.
4. Kiểm tra link: click Copy hai lần, F5 rồi Copy, phải là **cùng URL**; lưu ý link hash-only từ bản cũ bị thay thế khi click đầu tiên.
5. Kiểm tra card có **chỉ ảnh**, **chỉ video** và **cả hai**; so sánh số ảnh đã chọn với Firebase; thử copy tên ảnh, xử lý comment video và hình thumbnail.
6. Kiểm tra `/studio` có thể tiếp tục dùng và việc ghi trực tiếp từ legacy **chưa được đồng bộ khóa mới**, vì thế chưa thể đảm bảo chống trùng giờ tuyệt đối giữa API mới và `/studio`.

## Kiểm thử và giới hạn

- `npm test` (Node tests), `npm run check:static`, TypeScript AST parse được thực hiện trong môi trường tạo source; xem log kết quả đi kèm nếu cần.
- Chưa xác nhận **`next build`, Playwright và RTDB production integration**, do môi trường này không truy cập được npm registry. Bắt buộc chạy `npm install && npm run typecheck && npm run build && npm test` trên CI/Vercel.
- Cần xác minh tài khoản service account có quyền transaction tại các nhánh `studioPlanner_v1/schedulingWriteLocks_v3` và `amorriDeliveryAccess_v1`. Firebase Admin SDK đúng cấu hình sẽ vượt qua client RTDB Rules.
- Nếu truy cập Google Drive thất bại, không tự coi nguồn là ảnh hay clip; cần khắc phục quyền/metadata trước. Link cũ vẫn còn quyền nếu Admin chưa bấm tạo/copy lại; sau đó chỉ một link còn hiệu lực trên API mới.
