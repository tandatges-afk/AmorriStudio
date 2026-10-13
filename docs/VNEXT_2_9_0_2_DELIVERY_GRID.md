# VNext 2.9.0.2 — Delivery Compact Grid

## Đã thay đổi

- **Bỏ** `delivery-event-group-heading`. Không còn nhãn ngày và số sản phẩm ở đầu mỗi nhóm lịch, cũng bỏ chữ “1 SẢN PHẨM” lặp lại trên thumbnail. Thông tin **Lịch: tên khách/dự án** vẫn hiển thị trong mỗi thẻ, được làm rõ bằng nền trung tính.
- Sửa nguyên nhân gây một hàng cho mỗi lịch: CSS cũ `.delivery-grid{display:flex!important;flex-direction:column}` được thay bằng **grid nhiều cột**, nhưng mỗi nhóm lịch chỉ chiếm số cột theo số sản phẩm đang mở.
- Giữ sản phẩm cùng một lịch trong cùng nhóm (`delivery-event-group`). Ví dụ, lịch có **1 ảnh và 1 clip** chiếm 2 ô liền nhau; lịch tiếp theo có thể được xếp chung hàng nếu còn đủ không gian.
- Số cột responsive: `>=1500px: 4`, `1100–1499px: 3`, `761–1099px: 2`, `<=760px: 1`. Nhóm có nhiều sản phẩm tự xuống dòng *bên trong chính nhóm đó* ở màn hình hẹp.
- Ô tìm kiếm theo tên lịch, dự án, dịch vụ hoặc tên sản phẩm của **tháng đang xem**.
- Không sửa cơ chế cấp link sản phẩm, chọn ảnh, góp ý video hay ghi dữ liệu Firebase.

## Lưu ý thiết kế

Để những sản phẩm thuộc cùng lịch nằm cạnh nhau, grid cố tình không cắt nhóm giữa hai hàng. Với một số tổ hợp nhóm 2–3 sản phẩm có thể để trống một ô cuối hàng; đây là đánh đổi để giữ nhóm dễ nhận biết và đúng thứ tự thời gian.

## Kiểm thử Vercel Preview

1. Mở `/api/health`, xác nhận release `delivery-packed-grid-20261013-r1`.
2. Kiểm tra với 30–40 lịch có một sản phẩm: ở desktop phải hiển thị nhiều cột, **không còn 30–40 hàng đơn lẻ**.
3. Kiểm tra lịch có 2, 3 và >=4 sản phẩm: các sản phẩm vẫn liền nhau, không bị tách bởi lịch khác.
4. Thử ở desktop, tablet và điện thoại, kiểm tra chữ trên nút Copy link/Hoàn thành không chồng lên nhau.
5. Kiểm tra thumbnail chỉ tải khi cuộn tới gần các thẻ và link vẫn tách quyền theo từng sản phẩm.
6. Thử tìm theo tên khách hàng và tên sản phẩm.
7. Trước Production, chạy `npm install && npm run typecheck && npm run build` và kiểm thử trình duyệt thực tế. Bản này chưa kiểm tra trên Firebase Production.

Không yêu cầu thay đổi Environment Variables, Firebase Security Rules hoặc Google Drive.
