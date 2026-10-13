# Amorri Studio VNext 3.0.1 — Encrypted Delivery Cache / Unified System / Legacy Cutover

## Phạm vi

Nâng cấp từ VNext 3.0.0. Giữ nguyên schema booking Firebase `studioPlanner_v1`, link cấp mới qua `amorriDeliveryAccess_v1`, Google Drive service account, API video `pages/api/drive-video.js`, các API quản lý lịch/nhân sự/bình luận. **Không chuyển video gốc vào Firebase** và không thay khóa bí mật tự động.

### A. Tránh tải lại toàn bộ metadata sau F5

Trước đây bộ nhớ đệm Drive nằm trong RAM của một serverless function và hết hạn sau 30 giây. Sau F5 hoặc cold start, Google Drive có thể phải liệt kê lại toàn bộ folder. Trong V3.0.1:

- `listDeliveryMedia()` đọc cache chia sẻ tại `amorriDriveMetadataCache_v1/{sha256(folder|file ID)}`. Metadata được gzip + mã hóa AES-256-GCM. Khóa dẫn xuất từ `DRIVE_SERVICE_ACCOUNT_JSON` **phía server**, không lưu ENV, token, mật khẩu hay file video trong Firebase.
- Cache sống 15 phút, dùng chung giữa các serverless invocation. Ảnh/clip trong thư mục lớn (tối đa ~1.500 file và giới hạn 750 KB metadata gốc) cũng được hỗ trợ; nếu quá lớn hoặc RTDB lỗi thì tự quay về Drive.
- Dù có cache, API vẫn xác thực Admin/token bàn giao trên **mỗi request**. Khi gửi lựa chọn ảnh, backend vẫn bắt buộc `listDeliveryMedia(product,true)` để đọc lại Google Drive thật và kiểm tra file ID.
- Thumbnail Admin có browser CacheStorage (6 giờ, tối đa 100 mục) với namespace riêng theo Firebase `user.uid`. Nút **Làm mới Drive** xóa cache thumbnail và yêu cầu cập nhật Drive. Khi đăng xuất chủ động, cache thumbnail được xóa.
- Góp ý timeline, chọn ảnh đã lưu và dữ liệu quyền truy cập tiếp tục được lấy mới từ Firebase; **không dùng cache cũ để quyết định quyền truy cập hoặc kết quả lưu ảnh**.

Lần truy cập đầu tiên, sau TTL hoặc khi cache bị browser/RTDB thu hồi sẽ vẫn phải tải lại. Đây là cache *metadata*, không phải CDN/video cache; không làm Google Drive bớt giới hạn API/download video.

### B. Workspace cũ

- Đã gỡ `public/legacy`, `public/assets`, rewrite `/studio → /legacy/index.html` và endpoint ảnh cũ chỉ phục vụ legacy.
- `/studio` hiện chuyển về app chính. Các bookmark cũ dạng `/?client_gallery=ID` / `/studio?client_gallery=ID` và `?staff=ID` được chuyển hướng sang `/delivery/ID` và `/staff?staff=ID`.
- **Cảnh báo tương thích:** bookmark cũ chỉ tự hoạt động nếu có token hợp lệ theo cơ chế mới. Token legacy hoặc các link trên hostname Vercel cũ có thể cần cấp lại. Hãy kiểm tra các link đã gửi cho khách và thợ **trước** khi triển khai Production. Không xóa dữ liệu `studioPlanner_v1`, `videoReviews_v1`, `amorriDeliveryAccess_v1` hay các bản dự phòng.
- Không tự ý thay Security Rules Firebase chỉ vì giao diện cũ đã gỡ. Các link legacy và công cụ bên ngoài vẫn cần được kiểm tra.

### C. Nút Hệ thống

Sidebar chỉ còn mục **Hệ thống** thay cho 3 nút riêng. Bên trong gồm **Sức khỏe**, **Hoạt động**, **Kiểm tra dữ liệu**. Hệ thống vẫn mở được khi bảng lịch bị lỗi, giúp xem lại status các khóa và kết nối Admin/Drive/RTDB.

### D. `DRIVE_VIDEO_SIGNING_SECRET` và `AMORRI_DELIVERY_LINK_KEY`

**Không bắt buộc phải thêm khóa mới nếu hệ thống hiện tại đã hoạt động.** Cách thiết lập dựa vào tình trạng link đã phát hành:

**Trường hợp 1 — Đã có link khách đang dùng:**

1. Giữ **nguyên từng ký tự** `DRIVE_VIDEO_SIGNING_SECRET` (ít nhất 32 ký tự). Đây là khóa ký playback ticket và có thể đã được dùng để mã hóa token link theo cơ chế fallback.
2. Nếu từ trước đã đặt `AMORRI_DELIVERY_LINK_KEY`, giữ nguyên giá trị ấy (ít nhất 32 ký tự). Không đổi khóa khi chuyển Vercel.
3. Nếu trước đây **chưa đặt** `AMORRI_DELIVERY_LINK_KEY`, hãy **tiếp tục để trống** và dùng `DRIVE_VIDEO_SIGNING_SECRET` gốc làm fallback. Việc thêm một khóa riêng khác ở thời điểm này có thể khiến Admin không copy lại được token đã mã hóa bằng khóa cũ.
4. V3.0.1 trả `DELIVERY_RECOPY_KEY_MISMATCH` khi khóa khác khóa gốc và không tự thu hồi các link còn hiệu lực. Link hash-only quá cũ cũng không bị tự thu hồi: `DELIVERY_LEGACY_LINK_ACTIVE` yêu cầu quyết định thu hồi thủ công nếu muốn cấp lại.

**Trường hợp 2 — Chưa từng phát hành link, bắt đầu từ sạch:**

Chạy hai lần để có hai chuỗi *khác nhau*:

```bash
node -e "console.log(require('node:crypto').randomBytes(32).toString('hex'))"
```

Lưu mỗi chuỗi dưới dạng **Secret** trong `Vercel → Project → Settings → Environment Variables`:

- `DRIVE_VIDEO_SIGNING_SECRET` = chuỗi thứ nhất (64 ký tự hex).
- `AMORRI_DELIVERY_LINK_KEY` = chuỗi thứ hai (64 ký tự hex).

Không đặt `NEXT_PUBLIC_` cho hai biến. Không commit file `.env`. Nếu Preview dùng **cùng Firebase Production**, các khóa của Preview cần tương thích với những token đã lưu trong database. Ưu tiên tách Preview sang Firebase staging.

Sau khi sửa ENV: **Save → Redeploy**. Mở sidebar **Hệ thống → Sức khỏe** để kiểm tra định dạng; thử tạo/copy link sản phẩm, F5 rồi copy lại. Health chỉ kiểm tra định dạng, không thể xác nhận một token cũ giải mã được nếu không kiểm tra chính token đó.

**Khóa cần bảo quản an toàn:** không xoay `DRIVE_VIDEO_SIGNING_SECRET`, `AMORRI_DELIVERY_LINK_KEY`, `AMORRI_STAFF_LINK_KEY` hoặc `AMORRI_ARCHIVE_ENCRYPTION_KEY` tùy tiện. Archive mã hóa cũ có thể phụ thuộc khóa đã sử dụng trước đây.

### E. Cách triển khai trên Vercel / GitHub Codespaces

**Khuyến nghị bản PATCH** vì bạn đã có `package-lock.json` được `npm ci` + `next build` thành công trên Codespaces:

1. Tạo commit hoặc branch backup. Giải nén bản PATCH vào root repository, ghi đè các file được liệt kê.
2. Chạy `bash APPLY_V301.sh` để xóa **chỉ** các file giao diện legacy. Script không xóa bất cứ Firebase data/ENV/package-lock nào.
3. Chạy `npm ci --no-audit --no-fund`, `npm test`, `npm run check:static`, `npm run build`.
4. `git status` → xem diff (đảm bảo `package-lock.json` giữ nguyên nếu `package.json` không đổi dependencies) → `git add -A`, `git commit`, `git pull --rebase origin main` nếu cần, `git push origin main`.
5. Vercel Preview → `/api/health` phải có release `studio-os-3-0-1-20261013-r1`.
6. Thử Dashboard, link ảnh/clip ở trình duyệt mới, F5 nhiều lần, bấm **Làm mới Drive**, chọn ảnh, góp ý timeline, link thợ và link khách cũ.

**Chưa kiểm chứng Next.js production build trong môi trường tạo ZIP vì không có dependencies của dự án**, chỉ có Node tests và kiểm tra cú pháp độc lập. `npm run build` trên Codespaces/Vercel phải thành công trước khi đổi Production.

### F. Rollback

Giữ commit V3.0.0, bản sao ENV hiện tại và không xóa dữ liệu Firebase. Nếu link legacy không thể chuyển tự động, có thể rollback deployment cũ trong lúc cấp lại link cho khách. Cache mới có namespace riêng và chỉ chứa dữ liệu mã hóa; rollback không làm thay đổi bản ghi lịch, ảnh đã chọn hoặc góp ý.
