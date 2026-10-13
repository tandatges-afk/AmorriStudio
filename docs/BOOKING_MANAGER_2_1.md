# VNext 2.1 — Booking Manager migration / handoff

## Đã nâng cấp

- Truy cập dashboard, chọn **Lịch quay & chụp**, chọn một booking trên calendar hoặc nút chi tiết của bảng.
- Trong drawer chọn **Chỉnh sửa / phân công / xóa lịch**. Form React/TypeScript hỗ trợ tên, ngày, giờ, dịch vụ, địa điểm, số điện thoại, ghi chú, giá và cọc (VND), trạng thái, nhân sự, công việc, chi phí, khu vực.
- API `/api/events/[id]` cung cấp `GET`, `PATCH`, `DELETE` và **bắt buộc Firebase ID token Admin trên server**.
- Server truy vấn `events.orderByChild('id')` để tương thích với record legacy nằm ở key số. ID trùng -> 409, không ghi mù vào `events/id`.
- PATCH ghi bằng transaction có fingerprint SHA256 của bản ghi đầu vào: khi một tab khác cập nhật -> trả 409, không âm thầm ghi đè.
- PATCH **merge** thay vì replace toàn bộ; giữ `products`, `favoritePhotos`, `favoritePhotoItems`, `isRuocDau`, địa điểm nhà trai/gái, các trường review trong record, và metadata `link` của phân công.
- Xóa yêu cầu gõ lại chính xác tên lịch và tạo bản dự phòng mã hóa AES-256-GCM trước khi xóa khỏi `studioPlanner_v1/events/<storageKey>`.

## Biến Vercel mới (chỉ cần khi thực hiện xóa)

`AMORRI_ARCHIVE_ENCRYPTION_KEY`: 64 ký tự hex bất kỳ được sinh ngẫu nhiên, **Visibility: Secret** (không đặt `NEXT_PUBLIC_`).

Tạo khóa **trên máy của bạn**, không gửi khóa cho chatbot hoặc repo:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Lưu khóa ở nơi bảo mật (password manager). Nếu mất khóa, bản dự phòng đã mã hóa không thể giải mã được. Khi chưa cấu hình, CREATE/PATCH vẫn hoạt động nhưng DELETE trả `ARCHIVE_CONFIG_MISSING`.

## Backup / restore

- Database archive riêng: `/amorriStudioAdminArchive_v1/events/<booking id>`; **không phải** `/studioPlanner_v1` đang được client legacy subscribe.
- Thiết lập Firebase RTDB Rules khóa nhánh archive để client không được đọc/ghi trực tiếp. Admin SDK vẫn có thể đọc/ghi qua server.
- Để kiểm tra bản lưu: sao chép 1 record JSON đã mã hóa qua Firebase Console về máy quản trị (không đưa file lên GitHub), chạy:

```bash
node --experimental-strip-types scripts/decrypt-archive.mjs archived-record.json > restored.json
```

Trước khi chạy, đưa `AMORRI_ARCHIVE_ENCRYPTION_KEY` vào biến môi trường **trên máy quản trị**. `restored.json` chứa dữ liệu khách hàng nhạy cảm, cần bảo vệ. Không có chức năng tự khôi phục lên Firebase trong bản beta này; khôi phục chỉ thực hiện sau khi có quy trình đối chiếu backup.

## Các giới hạn còn tồn tại

- Các booking `isRuocDau=true` có giờ/địa điểm hai nhà riêng: form mới **không cho chỉnh** 3 trường giờ/địa điểm/số điện thoại tổng; dùng `/studio` cho các mục đặc biệt.
- Chưa tự động kiểm tra trùng giờ/đơn nghỉ phép theo quy tắc nghiệp vụ server; cần bổ sung trong mốc tiếp theo.
- **Quan trọng:** app legacy có cơ chế queue ghi offline có thể phát lại bản ghi đã xóa. Cần kiểm tra và khóa phát lại trên staging trước khi cho dùng xóa trên production. Không quảng cáo tính năng này như xóa vĩnh viễn cho đến khi đồng bộ đa phiên bản đã được di trú.
- Lương lũy kế, blackout, gallery video feedback và hệ thống client/staff links vẫn nằm ở `/studio` (chưa bảo vệ đầy đủ link share cũ).
- Google Drive Range video tiếp tục chạy qua Vercel Function như cũ; bản này **chưa** giải quyết hạn mức Fast Origin Transfer hoặc chuyển sang HLS/1080p CDN.
- API đọc 1 event theo `id` nên khuyến nghị RTDB `.indexOn` cho `studioPlanner_v1/events` chứa `id`. Chỉ sửa Security Rules sau khi đã xuất backup và kiểm tra quyền truy cập production.

## QA theo đúng hành vi người dùng

1. Tạo booking ở React, F5, mở chi tiết, chỉnh trạng thái, tải lại.
2. Chỉnh booking được tạo trong phiên legacy, kể cả key dạng 0/1; bảo đảm không có bản ghi trùng.
3. Giao phân công có link nộp source cũ, chỉnh cost; xác nhận link vẫn giữ nguyên.
4. Hai phiên Admin cùng mở booking: phiên A lưu trước, phiên B phải thấy HTTP 409.
5. Đổi ngày giữa 2 tháng; xác nhận booking xuất hiện tháng mới và biến mất khỏi tháng cũ.
6. Lịch cưới hai nhà: đổi trạng thái, không đổi giờ/địa điểm đặc biệt.
7. Xóa thử trên **staging**, kiểm tra backup ciphertext, UI sau F5 và thử giải mã thủ công.
8. Không có token / token nhân sự lạ: GET/PATCH/DELETE trả 401/403, dữ liệu không đổi.
9. Tất cả phần client gallery, review timestamp, chọn ảnh và bảng lương cũ vẫn hoạt động.

## Deploy

- Sử dụng Vercel Framework **Next.js**, Node.js **22.x**, Output Directory **Automatic**, Build `npm run build`.
- Không ghi đè file `.env.local` đã có; giữ 13 biến trước đó và chỉ thêm `AMORRI_ARCHIVE_ENCRYPTION_KEY` nếu muốn dùng DELETE.
- Sau deploy `GET /api/health` cần chứa `"release":"booking-manager-20261012-r1"`.
- Test trên **Preview với database staging** trước. Không chạy lệnh thay đổi dữ liệu production để kiểm tra.
- Chạy `npm install && npm run typecheck && npm test && npm run test:unit && npm run build` trên máy có npm registry; Playwright là bước QA trình duyệt riêng.
