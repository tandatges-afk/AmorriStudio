# Amorri Studio VNext 2.4 — Security & Safe Cutover

## Trạng thái an toàn hiện tại

**Preview/staging first.** 2.4 sửa các luồng UI cũ, **chưa phải bảo mật production hoàn chỉnh**:

- `/studio` dùng `GET /api/access/me` với Firebase ID token để xác minh `admin` và liên kết `authUid→staffId`. Trước đây chỉ cần đăng nhập Firebase là UI hiện quyền admin; `?staff=<id>` cũng mở vai trò nhân viên. Hai cơ chế nâng quyền ở UI này được thay thế bằng xác minh server; truy cập link cũ không còn cấp quyền ghi cho người chưa liên kết tài khoản.
- Lệnh **xóa lịch** của `/studio` gọi `GET /api/events/[id]` lấy `expectedVersion` rồi gọi `DELETE` (đòi quyền admin + khóa mã hóa archive). Lệnh **xóa nghỉ** gọi `DELETE /api/blackouts/[id]` kiểm tra quyền theo UID.
- Các lệnh ghi **offline cũ** vào `events`, `staff`, `payroll`, `blackouts` nay được cách ly khỏi tự replay để không phục hồi lịch đã xóa; bản nháp vẫn nằm ở localStorage, không còn phủ lên snapshot từ Firebase và có thể xuất JSON tại `/migration` từ đúng trình duyệt đó. Cần đối chiếu thủ công với dữ liệu server, không import tự động.
- UI `/studio` có `AMORRI_LEGACY_ADMIN_WRITES`: `compat` mặc định giữ tính năng admin nâng cao cũ; `read-only` chặn các helper ghi SDK và đồng bộ hàng đợi thao tác cũ. Đây chỉ là **UX guard**, không chặn client xấu cố tình gọi Firebase SDK. Firebase Security Rules mới là lớp bắt buộc.
- `/migration` liệt kê số lượng khóa số cũ, ID trùng, ID thiếu, nhân sự chưa gắn UID. Endpoint `/api/migration/diagnostics` bảo vệ bởi Admin token; chỉ trả số đếm, không trả thông tin khách/nhân sự.
- Trang khách tiếp tục chọn ảnh qua SDK cũ (ghi `studioPlanner_v1/events/...`) và bình luận qua `videoReviews_v1`; **chưa** có mã chia sẻ có hạn dùng. Không bật rules đóng toàn bộ khi hai luồng này chưa được di trú.
- Admin SDK mới ở backend không bị giới hạn bởi Realtime Database Security Rules. Kết quả xác thực backend phụ thuộc `FIREBASE_SERVICE_ACCOUNT_JSON`, `AMORRI_ADMIN_UIDS` và các kiểm tra UID chính xác.

## Lộ trình rollout tối thiểu

1. **Sao lưu:** backup toàn bộ Firebase RTDB (dữ liệu và Security Rules cũ), sao lưu repo Production; giữ rollback deployment; không tạo/xóa lịch thử trên Production.
2. **Preview:** deploy mã 2.4 lên Vercel Preview; sử dụng **Firebase staging riêng**, có admin/staff mẫu và dữ liệu giả. Đối chiếu `/api/health` (`security-cutover-20261013-r1`).
3. **Auth & roles:** admin đăng nhập `/`, `/studio`; người chỉ có Firebase account bình thường **không** thấy Admin. Nhân viên gắn UID xem `/staff` và link `/studio?staff=<id>` của chính họ, link người khác không được quyền sửa/xóa.
4. **Nghiệp vụ xóa:** thử xóa event có bản sao lưu mã hóa, xác minh không xuất hiện lại sau F5; thử quyền 403, xung đột phiên bản 409, xóa ngày nghỉ hợp lệ/không hợp lệ. Không thử với dữ liệu thật.
5. **Diagnostics:** mở `/migration`, kiểm tra khóa số, staff thiếu UID. Nếu có ID trùng, sửa dữ liệu staging bằng migration riêng có audit; không ghi đè tự động.
6. **Chế độ chặn dần:** tùy chọn `AMORRI_LEGACY_ADMIN_WRITES=read-only` *trên staging* để chuyển admin/staff qua React. Trên Production nên giữ `compat` cho đến khi thay thế toàn bộ form nâng cao.
7. **Security Rules:** xuất rules hiện có; dùng script `prepare-rtdb-rules.mjs` tạo *file đề xuất*, xem diff + chạy Firebase Emulator. Rules đề xuất chặn browser ghi `studioPlanner_v1` sẽ làm **mất khả năng chọn ảnh của khách** và form chỉnh sửa studio cũ: chỉ bật sau khi đã có API server cho lựa chọn ảnh. Đồng thời cần kiểm toán quyền `.read` khách, chống lộ lương/số điện thoại, cũng như `videoReviews_v1` và tokens cấp cho khách. Script không áp dụng rules trực tiếp.
8. **Go-live:** Playwright / Vitest / `next build` phải xanh; QA trình duyệt thật, đo video 1080p, có cách rollback khi phát hiện lỗi. Không đổi domain khi chưa hoàn thành.

## Điều kiện an toàn trước khi bật deny-writes trên Production

- Tất cả luồng ghi lịch, payroll, nhân sự, báo nghỉ, album yêu thích và video review chuyển sang backend có xác thực đúng role/capability, kiểm soát dữ liệu đầu vào, giới hạn tần suất và idempotency.
- Legacy JavaScript offline replay bị loại bỏ hoặc có version check với server; không tự ghi lại bản cũ sau khi người khác đã xóa.
- Firebase Rules cấm trực tiếp mọi ghi/đọc không được phép, kiểm thử Firebase Emulator với admin/staff/guest/anonymous. Rules gốc quá mở có thể vô hiệu mọi biện pháp client-side.
- Links gallery phải là capability tokens có thể hết hạn/thu hồi, chỉ xem được đúng event/product; kiểm tra quyền server cho cả API video và danh sách Drive. Không dùng mỗi event ID làm bí mật.
- Sao lưu, giám sát audit, báo lỗi 401/403/409, kiểm thử tương thích dữ liệu numeric key và cấu trúc wedding đầy đủ.

## Kiểm tra thủ công nhanh

| Kịch bản | Kết quả cần có |
|---|---|
| Người chưa đăng nhập mở `/studio` | Không có quyền admin/staff ghi/xóa |
| Firebase user không trong allowlist admin | Không thể nhận role admin; API xóa trả 403 |
| Đăng nhập nhân sự A mở `?staff=B` | Không nhận role nhân sự B |
| Admin xóa event qua `/studio` | Gọi API có lưu archive, không ghi xóa trực tiếp SDK |
| Nhân sự tự xóa lịch nghỉ | Backend kiểm tra UID→staffId |
| Đặt `AMORRI_LEGACY_ADMIN_WRITES=read-only` | Form ghi helper cũ bị chặn, data không tự replay; giao diện mới vẫn hoạt động |
| Gallery gửi danh sách ảnh trên `compat` | Vẫn sử dụng legacy Firebase SDK, chưa có bằng chứng bảo mật end-to-end |
| `/migration` bằng tài khoản guest | API từ chối 401 hoặc 403 |
| Rules đề xuất từ export an toàn | Không thay đổi `videoReviews_v1` hoặc index hiện có; không tự deploy |

> **Ghi chú:** Số lượt kiểm thử Node chỉ chứng minh logic/contract đã lập trình. Chúng không thay thế Firebase Emulator / Vercel Preview / browser tests hoặc chứng minh quyền production.
