# Security Review (VNext 2.0)

## Đã thêm
- `GET /api/dashboard` và `POST /api/events`: Firebase Admin xác minh Bearer ID token, yêu cầu UID nằm trong `AMORRI_ADMIN_UIDS` hoặc token có custom claim `admin=true`.
- Giới hạn và chuẩn hóa dữ liệu tạo lịch; dùng RTDB transaction `existing===null` để không ghi đè event cùng ID. ID do client tạo làm idempotency key.
- Vercel secrets dùng biến môi trường server-only. Không cấp service account trong `NEXT_PUBLIC_*`.

## Chưa thể đảm bảo khi chưa có cấu hình production
- `?staff=<id>` là chọn vai trò UI kiểu cũ, **không phải authentication**; cần Firebase Auth staff, UID→staffId trên server và RTDB rules tương ứng.
- `?client_gallery=<id>` kiểu link truy cập cũ có thể bị chuyển tiếp; chưa có expiry/revocation. Cần backend delivery token, quyền product, record ownership, và scope đọc review.
- Nếu RTDB rules đang mở quyền đọc/ghi rộng, cấu trúc mới không thể tự ngăn truy cập trực tiếp Firebase từ SDK cũ.
- Chỉ áp dụng security rules sau khi có emulator suite và mapping quyền chính xác; bật rules cứng ngay lúc này có thể làm vỡ bàn giao và công cụ nhân sự.
- Rate limiting API, abuse monitoring, audit transactional outbox, review storage protection cần được bổ sung cho production.

## Recommended controls
1. Backup DB, xuất RTDB rules hiện hành, lập quyền admin/staff/client riêng.
2. Mỗi nhân viên có Firebase Auth riêng, claims gắn staffId/role, cấm ghi payroll và lịch không liên quan.
3. Delivery links ký và expire, người xem chỉ được xem event/product được cấp phép.
4. Không đưa thông tin cá nhân hay video gốc ra URL không có bảo vệ.
5. Server logging với redaction email/số điện thoại, retention policy, test revoke, access denied và link guess.


## Cập nhật 2.4

Xem [`SECURITY_CUTOVER_2_4.md`](SECURITY_CUTOVER_2_4.md) và [`../security/README.md`](../security/README.md) để hiểu các lớp xác thực legacy đã cải thiện, các giới hạn guest delivery và quy trình review rules. **Không coi UI guard là thay thế cho RTDB Rules.**
