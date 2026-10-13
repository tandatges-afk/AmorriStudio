# Amorri Studio — Nâng cấp tiền, Google Maps, lịch nhân sự

## Các thay đổi

- VND: hiển thị theo nhóm ba chữ số, dấu `.` không có dấu cách trước `đ` (ví dụ `2.000.000đ`, zero theo yêu cầu `0.000đ`). Form tiền là text số có dấu phân cách, nhưng gửi lên API vẫn là **số nguyên VND**, không thay đổi schema.
- Địa điểm: admin gõ để tìm trong Google Places (New), bấm kết quả gợi ý; hoặc dán đường dẫn Maps. Cả lịch một địa điểm và lịch rước dâu hai nhà đều hỗ trợ. Ở chi tiết Admin và Staff, vị trí là liên kết Maps mở trong tab mới.
- Giao diện Admin: Source nhân sự và Quản lý link bàn giao khóa đến khi **đúng ngày + giờ kết thúc** theo Asia/Ho_Chi_Minh. Backend `PUT /api/events/{id}/source`, `POST /api/delivery/grants` từ chối trước giờ (403). Giữ nguyên danh sách sản phẩm và dữ liệu cũ.
- Staff: xem số điện thoại khách (gọi/copy), chi phí chỉ của mình, đồng nghiệp cùng lịch (loại chính mình), bảng lương tháng hiện tại (gross/opening/advance/paid/closing), click Maps.
- Staff nộp Source HTTPS sau giờ kết thúc qua `PUT /api/staff/shared/source?staffId=...` với header `x-amorri-staff-token`. Backend xác thực grant chưa hết hạn/thu hồi, đúng staff assignment, đã hết ca; ghi vào assignment.link được trang Admin đọc lại.
- Staff hiện thấy ca trong khoảng 30 ngày trước + 90 ngày sau để nộp Source muộn. Lịch bị hủy được ẩn. Nếu link nhân sự hết hạn cần Admin cấp lại.

## Cấu hình Google Places

Trên Google Cloud Console, bật Places API (New), bật billing, tạo API key chỉ cho Places API (New) và giới hạn server-side theo IP VPS khi thích hợp. Cấu hình `GOOGLE_MAPS_API_KEY` trong môi trường chạy Next.js (**không** dùng `NEXT_PUBLIC_`, không commit key vào repo). Trên Vercel: Project > Settings > Environment Variables > chọn Production, thêm `GOOGLE_MAPS_API_KEY` rồi tạo deployment mới (Redeploy). Trên Coolify/VPS, đặt biến tương ứng trong môi trường server. Chọn input địa điểm thủ công và dán Maps vẫn hoạt động nếu không cấu hình API; danh sách gợi ý thì không.

API server `/api/places?input=...` chỉ chấp nhận Firebase **Admin token**, có debounce 350ms trên UI. Gọi Places Autocomplete (New) (có thể phát sinh phí theo chính sách Google).

## Nghiệm thu

1. Tạo lịch giá 2000000, cọc 500000, chi phí staff 1200000: UI sẽ hiển thị `2.000.000`, `500.000`, `1.200.000` trong input; bảng xem có thêm `đ`.
2. Gõ địa điểm (có key hợp lệ) rồi chọn từ danh sách, kiểm tra click chỉ đường; dán nguyên link Google Maps vào lịch khác, lưu và mở lại.
3. Trước `end`: link Source/Quản lý bàn giao bị khóa ở Admin và Staff; gọi trực tiếp 2 API Admin phải trả 403.
4. Sau `end`: Staff đăng nhập bằng đúng link #token được Admin cấp, nhập và lưu URL Source, tải lại và kiểm tra Admin nhìn thấy link.
5. Mở link nhân sự A: chỉ có chi phí/lương A, không có chi phí/lương B; A nhìn thấy tên B nếu cùng phân công.
6. Kiểm tra ca rước dâu cả hai nhà, hai SĐT và hai địa điểm; kiểm tra trường hợp ca qua nửa đêm.
7. Kiểm tra Firebase Rules production, cấu hình Admin SDK, hệ thống lưu lương theo tháng trước khi public.

## Trạng thái kiểm thử bản ZIP

Đã kiểm thử 229 trường hợp (`node --experimental-strip-types --test tests/*.test.mjs`): **219 pass / 10 fail**. Mười lỗi còn lại cũng có trong bản ZIP gốc (kiểm tra baseline: 214 pass / 10 fail với 224 bài). Đã chạy thêm kiểm tra cú pháp TypeScript/TSX cho 14 file thay đổi: 0 lỗi cú pháp. Chưa có full build `next build`/typecheck vì npm dependencies chưa cài hoàn tất trong môi trường chạy thử. Chưa có thể kiểm tra Firebase thật, API key Google Places, link Coolify hoặc UI trên trình duyệt production.
