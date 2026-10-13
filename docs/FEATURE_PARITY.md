# Feature parity: old app to VNext 2.0

**Source:** user-supplied index(20261012-131916).html and the two accompanying Drive APIs. The old logic is retained through Stage 1 extracted assets, not reimplemented wholesale in React.

| Existing feature | Next.js TypeScript screen | Preserved operational path | State |
|---|---|---|---|
| Calendar month, type/status filter | React calendar + selection/search | `/studio` calendar & advanced filters | Usable legacy; React interactive |
| Create/edit/delete event, multiple locations, assignment | React tạo/sửa/hủy/xóa lịch cơ bản + phân công; lưu dự phòng khi xóa | `/studio` booking modal | Native create/edit/delete basic; special two-location and delivery remain legacy |
| Staff roster and staff-specific URL | React team listing | `/studio` staff screen | Legacy retained; staff URL is NOT secure authentication |
| Blackout / leave reporting | -- | `/studio?staff=...` | Legacy retained |
| Upcoming staff schedule | -- | `/studio?staff=...` | Legacy retained |
| Payroll, advances, paid and carried balance | React *current-month* total | `/studio` advanced payroll | Legacy retained |
| Gallery / Google Drive folder shortcuts | React linked delivery list | `/studio?client_gallery=...` | Legacy retained |
| Client photo selection, favorite, copying selected file names | -- | `/studio?client_gallery=...` | Legacy retained |
| Video timeline review comments, playback, seeking, dark panels | -- | `/studio?client_gallery=...` | Legacy retained |
| System audit / staff activity | React recent activity | `/studio` audit | Legacy retained |
| Download/video Range API | Existing Node Vercel API (Pages API) | `/api/drive-video` | Preserved |
| Drive photo/image API | Existing Node Vercel API (Pages API) | `/api/get-drive-images` | Preserved |
| Firebase RTDB | Admin-side Node TypeScript reads + legacy compat SDK | `studioPlanner_v1` | Preserved schema |

## Important limitations

- This is a **migration foundation**, not an honest claim that all 9,000+ lines are rewritten in React. The original operational flows are still JavaScript, available through a Next.js rewrite.
- New `/api/dashboard` checks Firebase ID tokens and admin claims/UID allowlist on the **server**. Legacy staff and gallery links remain ID-based and cannot be considered safe for private client content without a security migration and Firebase RTDB rules audit.
- Existing Firebase RTDB key names/record shapes are not modified. No automatic migration, data deletion or production mutation is performed.
- Monthly payroll in React excludes carried debts from earlier months; for authoritative balances use legacy payroll view until the service is ported with reconciliation tests.
- Actual assets `logo.png`, `BG.png`, panda sprites are missing from the submitted three files. Copy from the original repository into `/public` before deployment.
- Google Drive Range streaming is retained for compatibility; it is not a 1080p transcoding or CDN service.

## VNext 2.1
- Booking update/cancel/delete now has native React flow with server-side ID-token admin check. Original Firebase shape is preserved; products, comments and staff metadata are not replaced.
- When deleting, encrypted archive lives at `/amorriStudioAdminArchive_v1/events/<id>` outside the app subscription; requires a separately generated 256-bit key.
- Old offline writes may still recreate deleted items if the legacy client is open; do not assume deletion is globally final until legacy sync is migrated and RTDB rules audited.
- Check `.indexOn: ["id"]` for events to keep ID-based lookups efficient.

## VNext 2.2–2.4 (cập nhật)

- **2.2**: nhân sự UID-linked, báo nghỉ và lịch 90 ngày `/staff` được port sang TypeScript + backend, có kiểm tra conflict. Link cũ `?staff` vẫn có thể truy cập dữ liệu theo rules hiện tại, nhưng từ 2.4 chỉ cho vai trò UI `staff` sau khi kiểm tra Firebase UID trên server.
- **2.3**: payroll lũy kế nợ đầu kỳ, tạm ứng và thanh toán qua TypeScript trên React và API; cột lương của thợ chỉ trả về bản ghi của UID liên kết, thay vì bảng chỉ đọc 2.0. Công thức lương đã có unit tests nhưng chưa đối chiếu production.
- **2.4**: `/studio` không tự coi Firebase login là admin; xóa event và blackout đi qua server API. `/migration` cung cấp thống kê read-only chuẩn bị migration. Bản nháp offline quản trị cũ bị chặn tự replay, có thể export từ cùng browser. Chế độ `AMORRI_LEGACY_ADMIN_WRITES=compat` mặc định giữ các form nâng cao; `read-only` chỉ dùng để thử chuyển dần.
- Gallery ảnh khách, bình luận timeline, rước dâu hai địa điểm và nhiều form nâng cao **chưa** được port hoàn toàn. **Chưa triển khai** RTDB Rules nghiêm ngặt cho Production, vì sẽ làm ngừng các luồng ghi legacy này. Các ví dụ rules là bản xuất đề xuất, chưa dùng để xác định quyền truy cập thực tế.
