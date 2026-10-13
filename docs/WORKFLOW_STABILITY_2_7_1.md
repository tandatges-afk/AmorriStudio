# Amorri Studio VNext 2.7.1 — Workflow Stability (Preview)

## Mục tiêu và các thay đổi được kiểm tra bằng mã nguồn

Đây là bản nâng cấp từ VNext 2.7 dựa trên code đang có, không phải migration dữ liệu. Không chỉnh Firebase Security Rules, không xóa bản ghi trong `studioPlanner_v1`, không vô hiệu hóa link `/studio` legacy đang phát hành.

### 1. Quản lý lịch và lỗi Firebase

- Form `EventEditor` chỉ gửi **các trường thực sự thay đổi**. Trước đây mỗi lần bấm lưu lại gửi cả `date/start/end/status/assignments`; lịch cũ thiếu giờ có thể bị từ chối và hệ thống kiểm tra trùng ca không cần thiết.
- API PATCH chỉ lấy `withScheduleLock()` khi thay đổi lịch, giờ, trạng thái hoặc phân công; sửa ghi chú/giá tiền không cần khóa lịch.
- API nhận biết `ScheduleError` để trả đúng HTTP 409 khi bị khóa/trùng ca thay vì đổi thành 503 không rõ nguyên nhân.
- `findBooking` ưu tiên đường dẫn `events/<id>` cho record mới và kiểm tra fallback `orderByChild('id')` cho dữ liệu key số; nếu có 2 bản ghi trùng ID thì từ chối sửa, không chọn bừa.
- Lỗi backend chưa xác định trả mã `BOOKING_WRITE_FAILED`, `FIREBASE_PERMISSION_DENIED`, `FIREBASE_CONNECTION_FAILED` hoặc `FIREBASE_TIMEOUT` và ghi chi tiết giới hạn vào Function Logs. Lỗi tìm lịch trả `BOOKING_READ_FAILED`.
- Admin có thể lưu link Source từng nhân sự ở màn hình chỉnh sửa lịch qua `PUT /api/events/<id>/source`. Giữ các trường phân công cũ và kiểm tra phiên bản trước khi ghi.

**Nếu còn lỗi sửa lịch 503**, cần mở Vercel Functions Logs và kiểm tra `backendCode`, `details` từ `[booking-manager]` hoặc `[booking-lookup]`. Không có quyền truy cập Firebase production trong môi trường đóng gói nên không thể khẳng định nguyên nhân production đã được khắc phục hoàn toàn.

### 2. Link bàn giao có thể copy lại

- Khi tạo link mới, hệ thống **tiếp tục lưu SHA-256 hash** để xác thực và thêm một bản mã hóa AES-256-GCM phục vụ duy nhất cho API GET Admin.
- `GET /api/delivery/grants` yêu cầu Firebase Admin token, trả `shareUrl` cho link còn hiệu lực đã được mã hóa. Sau F5, Admin vào **Bàn giao sản phẩm → Link an toàn → Copy link** để copy lại; không phải phát hành link mới.
- **Link đã tạo bằng bản 2.7 trở về trước không thể khôi phục** vì server trước đó chỉ lưu hash một chiều. Phải tạo link mới một lần để bật khả năng copy lại; chỉ thu hồi link cũ khi đã gửi link mới tới khách.
- Dùng `AMORRI_DELIVERY_LINK_KEY` (tùy chọn, giá trị bí mật mạnh >=32 ký tự) hoặc `DRIVE_VIDEO_SIGNING_SECRET` hiện có nếu >=32 ký tự. **Không được đổi khóa khi còn link đã phát hành**, nếu không sẽ không thể giải mã để copy lại (việc mở link cũ vẫn được xác minh bằng hash).
- Không gửi token vào audit log. Chỉ Admin đã xác thực có thể gọi API danh sách.

### 3. Bàn giao ảnh và clip

- Trong Dashboard, danh sách sản phẩm được tự nhận diện khi thẻ gần vùng nhìn thấy; chỉ tải media Drive theo nhu cầu để tránh quét mọi album của cả tháng, gây chi phí Vercel.
- Backend Admin đọc loại MIME thật từ Drive, hỗ trợ folder/file/shortcut. Báo rõ trạng thái "Chưa xác định" khi Drive trả lỗi hoặc nguồn chưa hỗ trợ, không tự gắn nhãn ảnh/clip sai.
- Admin có thể mở **Kiểm tra ảnh / clip & ảnh đã chọn** và sao chép **danh sách tên ảnh đã chọn** theo sản phẩm. Dữ liệu lấy từ các mục `favoritePhotoItems` cũ và mới, đối chiếu Drive ID khi có.
- Trang khách không có nút copy tên ảnh; khách vẫn **chọn ảnh / gửi lựa chọn**. Phần video góp ý timeline giữ nguyên.
- Nút **Bàn giao cũ** và **Link cũ** trên thẻ bàn giao ở dashboard chính đã bỏ, đường dẫn legacy **không bị xóa** để tránh ảnh hưởng khách cũ đang sử dụng.
- CSS trang khách: tối đa **4 ảnh/hàng ở desktop lớn**, 3 ảnh/hàng ở máy tính vừa, 2 ảnh/hàng trên màn hình nhỏ.

### 4. So sánh với các tính năng trong `/studio`

| Nhóm nghiệp vụ | VNext chính hiện tại | Ghi chú |
|---|---|---|
| Tạo/sửa/hủy/xóa lịch | Có, React/API | Kiểm thử production cần làm |
| Phân công thợ & kiểm tra trùng ca | Có | Luồng ghi legacy vẫn trực tiếp Firebase |
| Rước dâu hai nhà | Có giờ, địa điểm, điện thoại riêng | Mẫu đặc thù khác cần đối chiếu |
| Thêm/sửa link sản phẩm | Có | Chưa đưa xóa sản phẩm có lưu trữ sang API |
| Link Source của thợ | Admin chỉnh được | Thợ tự nộp Source bằng link chỉ xem chưa hỗ trợ |
| Đội ngũ, link xem của thợ, ngày nghỉ | Có | Link xem chỉ đọc |
| Lương lũy kế / thanh toán | Có | Phải đối chiếu số liệu khi migration |
| Link bàn giao an toàn | Có; copy lại sau F5 cho link mới | Link cũ chỉ hash không thể khôi phục |
| Nhận diện ảnh/clip qua Drive | Có, khi thẻ gần viewport | Phụ thuộc quyền/service account Drive |
| Khách chọn ảnh; Admin copy ảnh đã chọn | Có | Tên ảnh cũ không rõ sản phẩm cần đối chiếu |
| Bình luận video theo timeline và xử lý Admin | Có | Player Google Drive iframe không đọc được currentTime |
| Lịch sử ảnh chọn cũ / đa nguồn non-Drive / YouTube | Chưa di trú hoàn toàn | Dùng `/studio` tạm thời |
| Xem và cập nhật lịch sử Source/notifications nâng cao | Chưa đầy đủ | Dùng `/studio` tạm thời |

**Không xóa `/studio` hoặc áp Security Rules chặn mọi ghi ngay**. Vẫn cần đối chiếu từng trường dữ liệu đặc thù, media non-Drive, bình luận cũ và quyền người dùng trước khi ngưng workspace.

## Triển khai Vercel Preview

1. Sao lưu cấu hình và bản export Firebase RTDB, deploy VNext 2.7.1 lên nhánh Preview.
2. Kiểm tra `/api/health` có release `workflow-stability-20261013-r1`; Framework = Next.js, Output Directory = Automatic.
3. Giữ các biến Firebase và Drive đang hoạt động; `DRIVE_VIDEO_SIGNING_SECRET` phải đủ mạnh để tạo bản mã hóa link hoặc thêm `AMORRI_DELIVERY_LINK_KEY` dạng **Secret**.
4. Test bằng **dữ liệu staging**: tạo lịch; sửa tên/ghi chú riêng lẻ; sửa phân công; thử trùng lịch và ngày nghỉ; tạo link Source; tạo link khách rồi F5 copy lại; kiểm tra ảnh/clip MIME và copy tên ảnh từ Admin.
5. Test video gồm play/seek/error, comment timeline, tải ảnh từng trang; kiểm tra quá trình đọc Drive trong Vercel Function Logs và Fast Origin Transfer.
6. Chỉ chuyển Production sau khi xác nhận không có 401/403/409/503 bất thường, có backup/rollback.

## Kết quả kiểm tra môi trường tạo mã nguồn

- `npm test`: cập nhật 127 bài test Node và pass. `npm run check:static`: pass.
- 73 file TypeScript/TSX: kiểm tra cú pháp bằng TypeScript parser, không có parse diagnostics.
- `next build`/full `tsc`/Playwright: **chưa thực hiện thành công**, vì không cài được dependencies npm ở môi trường này. Phải xác nhận với Vercel Preview/GitHub Actions.
- Không có kết nối Firebase/Google Drive production thực tế để test ghi và phát video.
