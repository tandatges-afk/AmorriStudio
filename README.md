# Amorri Studio VNext 3.0.1 — System & Encrypted Delivery Cache

Bản 3.0.1: metadata Google Drive được cache mã hóa trên RTDB tối đa 15 phút để giảm việc liệt kê lại folder sau F5; thumbnail Admin có cache trình duyệt tối đa 6 giờ; sidebar có một mục **Hệ thống** gồm Sức khỏe, Hoạt động, Kiểm tra dữ liệu. Giao diện `/studio` cũ được gỡ, giữ redirect cho bookmark cũ. Cơ chế cấp lại link chặn việc tự thu hồi link còn hiệu lực khi secret không khớp.

**Tài liệu bắt buộc trước khi deploy:** [`docs/VNEXT_3_0_1_CACHE_CUTOVER.md`](docs/VNEXT_3_0_1_CACHE_CUTOVER.md). Cần giữ nguyên secret cũ khi đã có link khách; không tự tạo khóa khác rồi ghi đè. Bản ZIP full không có `package-lock.json` của repository bạn; ưu tiên PATCH và giữ lockfile đã build thành công trên Codespaces. Kiểm thử Node đạt 218/218, chưa xác nhận production build trong môi trường đóng gói.

---

# Amorri Studio VNext 3.0.0 — Studio OS / Stability Foundation

**Current rollout target:** Vercel (Next.js 16) + Firebase Spark + Google Drive. This is a complete **code** archive, not a pre-deployed app. It preserves customer links, data paths, the `/studio` compatibility workspace, and all existing media APIs.

**New:** Admin-only System Health hub, safe Firebase/Drive/key configuration checks, RTDB read probe, editor timeline review filters/export, calendar-view preference, last-successful-sync timestamp. `/api/health` release: `studio-os-3-0-0-20261013-r1`.

**Start here:** [`docs/VNEXT_3_0_RELEASE.md`](docs/VNEXT_3_0_RELEASE.md).

**Important for current Codespaces/Vercel migration:** The source ZIP does not contain your GitHub `package-lock.json` or secrets. Apply the accompanying **patch ZIP** over your currently working GitHub repository, preserving the lockfile you already committed. Run `npm ci && npm test && npm run build` and deploy on Vercel Preview first.

---

# Amorri Studio VNext 2.9.0.3 — Firebase App Hosting migration

**Hosting đã đổi từ Vercel sang Firebase App Hosting (Next.js server on Cloud Run).** Đây là bộ mã nguồn đầy đủ để cấu hình/triển khai, **không phải bản đã được triển khai trực tuyến**.

- Xem hướng dẫn bắt buộc: [`docs/FIREBASE_APP_HOSTING_MIGRATION_2_9_0_3.md`](docs/FIREBASE_APP_HOSTING_MIGRATION_2_9_0_3.md).
- File cấu hình mới: [`apphosting.yaml`](apphosting.yaml). Không chứa private key.
- **Bắt buộc tạo và commit `package-lock.json`** bằng lệnh `npm install --package-lock-only` tại máy có internet trước khi thiết lập rollout. Môi trường xây dựng bộ ZIP này không có kết nối npm registry nên không thể sinh lockfile đáng tin cậy.
- Firebase App Hosting **yêu cầu gói Blaze có billing**. Kiểm tra chi phí bandwidth video proxy trước khi Production.
- Không đổi Firebase project/database, video Google Drive, legacy `/studio`, hay các đường dẫn `/api/...`.
- Chuyển đủ ENV và Secret Manager. Giữ nguyên các khóa mã hóa đang dùng để tránh làm hỏng link/backup cũ.
- `/api/health` trên host mới phải trả `firebase-apphosting-20261013-r1`.

---

# Amorri Studio VNext 2.9.0.2 — Delivery Packed Grid

**Base:** VNext 2.9.0.1; full source code, no migration or changes to customer links and Firebase values.

- Removed `delivery-event-group-heading` (repeated event date/product count). Each delivery card still identifies its originating booking.
- Replaced one-booking-per-row `flex-direction:column` with a responsive **4 / 3 / 2 / 1 column CSS grid**.
- Booking groups reserve only the number of columns needed by their unfinished products. Two products from one booking stay side by side, with other bookings filling available grid slots.
- A booking with one product takes a single grid cell. This avoids 30–40 forced rows for 30–40 single-product bookings.
- Preserved lazy Drive discovery by keeping the visible booking wrapper as a real DOM element.
- Added search by booking/customer/product title to locate deliveries quickly in a busy month.
- Existing per-product share links, video timeline review, selected photo filename copy, complete/restore, and legacy `/studio` remain unchanged.

**Preview validation:** `/api/health` should return `delivery-packed-grid-20261013-r1`. Test bookings with 1, 2, 3, 4 and 5 products on desktop/tablet/phone and ensure copy links remain product-specific. A few end-of-row gaps are intentional to keep related products together.

**Quality caveat:** Test using `npm run typecheck && npm test && npm run build` with Node >=22.16 and dependencies installed. Production Firebase/Google Drive not accessed during patch. Do not change environment secrets.

---

# Amorri Studio VNext 2.9.0 — Unified Studio Platform

**Base:** VNext 2.8.4.4 Product Delivery & Review, retaining all files, routes and legacy `/studio` compatibility. This is a migration release, **not** a full removal of the legacy workspace.

## What ships

- **Operations Desk:** actionable queue for unassigned bookings, pending confirmations, unfinished product deliveries. Read-only selectors use the selected month; cancelled bookings are excluded from urgent actions.
- **Calendar Planner:** Month / Week / List views, filter bookings by crew member, open booking details without leaving the page. Week navigation is limited to dates overlapping the fetched month; weekends and cross-month week starts display correctly.
- **Analytics:** status and service mix; month-scoped booking contract totals and unpaid-after-deposit estimates (not cash revenue).
- **Error diagnostics:** `X-Amorri-Request-Id` on dashboard and key calendar/product/photo/video APIs; matching sanitized request ID/status in Vercel Function Logs. Never include ID tokens or customer data in support reports.
- **UI design system:** scoped 2.9 CSS for layout, accessible controls and responsive operations views; no modification to legacy `/studio` styles.
- **Migration readiness:** visible parity checklist, reminder not to tighten Firebase Rules before legacy client gallery/review cutover.
- **CI:** checks TypeScript, regression suite, static structure, Next production build and Playwright smoke. Fixed setup-node npm cache configuration that previously assumed a nonexistent lockfile.

## Verify and deploy

1. Deploy to Vercel **Preview** using a staging Firebase project or a protected staging snapshot; do not test delete/edit on Production until validated.
2. `npm install --no-audit --no-fund` with Node >= 22.16.0, then `npm run typecheck`, `npm test`, `node scripts/check-static.mjs`, `npm run build`.
3. Open `/api/health` and verify `unified-studio-20261013-r1`. Check login, calendar filters, unassigned queue, one-per-product delivery, photo selection, review timeline, payroll, staff links, and original client delivery links.
4. Confirm no archive key rotation and keep all Firebase/Google Drive environment values as previously configured.
5. Migrate to Production only after Preview build + QA pass. Keep a rollback deployment.

**Limits:** Dashboard/Analytics fetch only one month (max 1001 events), so numbers are *not* lifetime reports. This environment could not fetch npm packages and therefore cannot certify full `next build`, React typechecking or browser E2E. Legacy `/studio` can still write data outside modern CAS locking; do not edit the same booking in both interfaces at once. **VNext 2.9 does not re-add Cloudflare.**

Details: [`docs/VNEXT_2_9_RELEASE.md`](docs/VNEXT_2_9_RELEASE.md).

---

# Amorri Studio VNext 2.8.4.3 — Detail & Delivery Stability

- Mở rộng Chi tiết lịch trên web chính (thông tin, nhân sự, hợp đồng, source, sản phẩm); bỏ nút nghiệp vụ nâng cao trong popup.
- Di chuyển Xóa lịch sang góc trái thanh nút chỉnh sửa, mở popup xác nhận; backend archive mã hóa + ETag delete.
- Sửa lỗi cấu hình archive: có thể sử dụng khóa dẫn xuất ổn định từ `DRIVE_VIDEO_SIGNING_SECRET` hiện có (tối thiểu 32 ký tự), hoặc tốt nhất cấu hình `AMORRI_ARCHIVE_ENCRYPTION_KEY` riêng 64 ký tự hex. Không xóa nếu không có khóa hợp lệ.
- Sửa `DELIVERY_RATE_LIMIT` (không còn giới hạn 200 lượt suốt đời link; giới hạn 120 lượt/giờ, cách 1 giây).
- Sửa `SELECTION_CONFLICT` giả bằng Firebase REST ETag CAS; bảo vệ ảnh/metadata khi Admin thao tác đồng thời.
- Chi tiết triển khai: [`docs/DETAIL_DELIVERY_STABILITY_2_8_4_3.md`](docs/DETAIL_DELIVERY_STABILITY_2_8_4_3.md).

---

# VNext 2.8.4.2 — Booking & Delivery UI Fix

- Popup chọn 6 loại lịch và 5 loại cưới giống `/studio`. Rước Dâu tự bật chế độ hai nhà.
- Task cưới phân biệt công việc quay/chụp theo vai trò bằng combobox; nhà trai/gái chỉ hiện khi Rước Dâu.
- `delivery-photo-footer` nằm riêng bên dưới ảnh (không overlay), dùng `object-fit:contain` để không cắt mất chân ảnh.
- Thẻ ảnh và clip có chiều cao bố cục và hàng nút thống nhất; bỏ `<small role="status" class="delivery-share-feedback">`, dùng toast nổi.
- Kế thừa bản sửa PRODUCT_CONFLICT (Product CAS) từ VNext 2.8.4.1.

**Hướng dẫn chi tiết:** `docs/BOOKING_UI_2_8_4_2.md`

---

# Amorri Studio VNext 2.8.4.1 — Product CAS Fix

See [`docs/PRODUCT_CAS_2_8_4_1.md`](docs/PRODUCT_CAS_2_8_4_1.md) for this patch, safe deployment steps, testing and remaining caveats.

# Amorri Studio VNext 2.8.3 — Booking CAS & Delivery UI

## Changes
- Fix PATCH of existing bookings using Firebase RTDB REST **ETag + If-Match** conditional PUT (preserves entire original record and legacy key). This replaces the RTDB transaction whose callback could transiently read `null` and abort forever.
- Mismatch yields 409 `BOOKING_CONFLICT`, missing booking yields 404, backend/service errors yield 503 with specific codes, ambiguous network errors never auto-retry a possibly committed request.
- Keep server schedule conflict checks and daily locks for staff operations. Legacy `/studio` direct writes are still not serialized with new API.
- Dashboard delivery: 3 cards/row on wide desktops (2 tablet, 1 mobile), prevent thumbnail zoom/upscale, equal bottom-aligned `Copy link sản phẩm` and timeline buttons.
- Customer selection buttons moved **below** each photo, not overlaying photos.
- No Firebase data or Environment Variables migration.

## Vercel deployment
1. Back up current working project. Deploy ZIP to Preview first.
2. Retain `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_DATABASE_URL`, `AMORRI_ADMIN_UIDS` and current Google Drive variables. The Firebase service account needs Realtime Database read/write REST access.
3. Test `/api/health`, expected release `booking-cas-ui-20261013-r1`.
4. Test editing name/notes, status, assignments and date of a legacy booking; use a staging Firebase project for tests that mutate data. Refresh to verify persistence.
5. Test 2 simultaneous edits to the same booking: the second should receive `BOOKING_CONFLICT` (409), never overwrite the first.
6. Test Vercel Preview on desktop/mobile and check original image/video thumbnails and photo selection.

## Limits
This environment may not have Next.js dependencies installed. Node tests check CAS behavior by mocked fetch; **they do not prove live Firebase REST connectivity**. Full `npm run build` and Playwright on your own deployment are required.

The legacy `/studio` can still write outside the new lock/ETag coordination, and editor updates other than booking PATCH may still use SDK transactions. Do not update the same booking simultaneously from both interfaces.

# Amorri Studio VNext 2.8.2.2 — Booking Recovery (bản vá điều tra lỗi lịch)

## Hai lỗi được xử lý trong mã nguồn

- `BOOKING_NOT_FOUND`: API trước đây dựa vào biến `vanished` được cập nhật bên trong RTDB transaction, có thể báo nhầm khi transaction bị hủy. Bản sửa đọc lại đúng khóa bản ghi **sau** transaction, phân biệt `BOOKING_NOT_FOUND`, `BOOKING_CONFLICT`, `BOOKING_MOVED` và `BOOKING_TRANSACTION_RETRY`. Không tạo lại lịch đã bị xóa và không ghi đè phiên bản mới.
- `SCHEDULE_BUSY`: lease mỗi ngày giảm từ 30 còn 12 giây, được gia hạn mỗi 2,5 giây; chờ tối đa ~15 giây để khóa mồ côi hết hạn. Nhật ký audit không còn chạy khi giữ khóa. Giảm dùng khóa cho lịch không phân công nhân sự. **Nếu có nhiều thao tác thực sự chạy cùng ngày, vẫn có thể trả `SCHEDULE_BUSY`**: đây là biện pháp bảo vệ tránh ghi đồng thời.

## Kiểm tra lỗi ngay trong Vercel

1. Triển khai vào **Preview** trước. `/api/health` cần trả `booking-recovery-20261013-r2`.
2. Đăng nhập Admin, mở lịch trước khi sửa. Nếu vẫn lỗi, dùng Developer Tools → Network tìm `/api/events/<id>` để xem **Response JSON**.
3. Để kiểm tra tình trạng khóa, gửi GET tới `/api/scheduling/diagnostics?date=2026-10-13&eventId=<eventId>` kèm `Authorization: Bearer <Firebase ID token của Admin>`; API không trả thông tin khách hay chủ sở hữu khóa. Có thể dùng `fetch` từ phiên Admin với token do web đang quản lý. **Không dán token vào chat và không gắn token vào URL.**
4. Kiểm tra Vercel Function Logs (`[scheduling] lease contention`, `[booking-manager]`). Đối chiếu với thời điểm API gọi và dữ liệu staging.
5. Nếu `/studio` cũ vẫn ghi trực tiếp lên `studioPlanner_v1/events`, các luồng ghi legacy vẫn chưa được bảo vệ bằng khóa mới. Không thử sửa đồng thời từ hai tab/web trong production cho tới khi hoàn tất cutover.

## An toàn dữ liệu

Không thay đổi database schema, Firebase Rules hay Environment Variables. Không xóa hoặc tự động migrate lịch. Bản vá không thể xác nhận lịch production có thật sự bị xóa khi không có quyền truy cập Firebase của bạn. Luôn sao lưu RTDB trước khi deploy, test chỉnh sửa và xóa trên dữ liệu staging.

## Kiểm thử

`npm test` chạy hồi quy Node trên các module nghiệp vụ. `npm run typecheck && npm run build` vẫn cần chạy đầy đủ trên Vercel/CI; kiểm thử Node không thay thế kiểm thử Firebase production.

---

# Hotfix VNext 2.8.2.1 — Build lỗi Copy link an toàn

Sửa lỗi biên dịch ở `components/DeliveryGrantManager.tsx`:
`body` và `url` từng khai báo bằng `const` nhưng bị gán lại bên trong nhánh retry.

Bản vá dùng **một POST idempotent** để lấy link bàn giao, chỉ gửi lại request nếu cần làm mới Firebase ID token sau lỗi 401. Nếu API không trả `shareUrl`, giao diện hiển thị lỗi thay vì âm thầm gọi lại lần thứ hai. Vẫn hỗ trợ copy thủ công khi trình duyệt từ chối Clipboard API.

Không yêu cầu thay đổi Firebase, Vercel Environment Variables hoặc link khách hàng hiện có. Chỉ cập nhật mã nguồn lên GitHub và triển khai lại. Bản build đầy đủ `npm run build` cần xác nhận trên Vercel nếu máy không có đủ npm dependencies.

---

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

## VNext 2.8.4.4 — Product Delivery & Review

Mỗi sản phẩm là một thẻ / một link riêng, liên tiếp theo cùng một lịch; có nút Xóa link sản phẩm (giữ lịch sử), bảng góp ý clip riêng, nút copy tên ảnh riêng, thời gian bình luận `mm:ss` / `hh:mm:ss` và nhớ tên khách trên trình duyệt. Xem [hướng dẫn triển khai](docs/PRODUCT_DELIVERY_2_8_4_4.md).


## v2.9.0.4 — Vercel Dashboard RTDB diagnostics

The dashboard now returns safe details for a failed read branch and identifies mismatched RTDB URLs; it does not delete or migrate data. See `docs/DASHBOARD_FIREBASE_2_9_0_4.md`.
