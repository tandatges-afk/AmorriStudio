# Amorri Studio VNext 3.0.2 — Pilot HTTP 302 cho video

## Mục tiêu và giới hạn quan trọng

**Không thể dùng HTTP 302 để cho trình duyệt truy cập file Google Drive riêng tư bằng OAuth của server.** `Location` chỉ mang URL; trình duyệt không có Bearer token của service account. Không đặt Google access token/private key trong URL.

Bản 3.0.2 thêm **pilot có kiểm soát**, mặc định **TẮT**:

- Chỉ file **video thử nghiệm riêng, chủ động cấp quyền truy cập công khai** mới đủ điều kiện.
- Chỉ những file ID liệt kê rõ trong ENV mới được thử redirect.
- API POST vẫn xác thực link khách (delivery token), phạm vi sản phẩm và quyền với file trên Drive.
- Thử tải **1 byte không có OAuth** bằng `Range: bytes=0-0`, yêu cầu `206`, `Content-Range` đúng, MIME video và không phải attachment.
- Chỉ khi tất cả đều đúng: GET `/api/drive-video?...` trả **302**; browser tải trực tiếp từ Google Drive. Vercel không truyền các byte video cho lần xem đó.
- Khi bất kỳ bước nào thất bại: tự sử dụng **proxy cũ**. Nếu player không phát được sau 302, client tự xin playback ticket proxy và thử tiếp, giữ vị trí xem khi có thể.
- Video Drive **riêng tư**, clip thật của khách, hoặc nguồn Drive trả HTML/403/200 thay vì 206: **không redirect**.

### Rủi ro bảo mật

**Một file video được công khai sẽ truy cập được ngoài Amorri, kể cả sau khi thu hồi link bàn giao.** Chỉ thực hiện với file thử nghiệm không có dữ liệu khách. Không tự động sửa permissions Drive trong code. File video riêng tư phải giữ proxy hoặc sử dụng dịch vụ media có signed URL ngắn hạn (ví dụ Google Cloud Storage), khi cần triển khai direct streaming thật.

### 1. Deploy bản 3.0.2

Đối với repo GitHub của bạn đã có `package-lock.json` hoạt động, áp dụng ZIP Patch thay vì full source; không ghi đè file lock hoặc `.env`. Trong Codespaces:

```bash
cd /workspaces/AmorriStudio
npm ci --no-audit --no-fund
npm test
npm run build
# Kiểm tra git diff và chỉ commit các thay đổi cần thiết.
git add -A
git commit -m "feat: add safe opt-in Drive 302 redirect pilot"
git pull --rebase origin main
git push origin main
```

> Tránh `git add -A` nếu `node_modules/` hoặc `.next/` chưa nằm trong `.gitignore`; kiểm tra `git status` trước. Đừng force push.

Release marker: `drive-302-pilot-20261013-r1` tại `/api/health`.

### 2. Thử nghiệm một video

1. Chọn **video demo không chứa dữ liệu riêng tư**, tạo thành một sản phẩm bàn giao thử nghiệm.
2. Chỉ với video demo, nếu chấp nhận rủi ro, đặt quyền **Anyone with the link** trên Google Drive. Lưu ID của **file** video, không phải ID thư mục.
3. Vercel → Settings → Environment Variables → Production (hoặc Preview):

   ```dotenv
   AMORRI_VIDEO_REDIRECT_MODE=verified-public
   AMORRI_VIDEO_REDIRECT_TEST_IDS=ID_VIDEO_DEMO
   ```

   Tách nhiều ID bằng dấu phẩy, tối đa 30 ID, không hỗ trợ `*`.
4. **Không thay** `DRIVE_VIDEO_SIGNING_SECRET`, `DRIVE_SERVICE_ACCOUNT_JSON`, `AMORRI_DELIVERY_LINK_KEY`, Firebase ENV.
5. Redeploy, chờ Ready. Mở link bàn giao thử nghiệm ở cửa sổ ẩn danh.
6. F12 → Network, bật **Preserve log**, Play + Seek. Kiểm tra các request `/api/drive-video`:
   - `POST` trả `transport: "redirect"` → ticket có quyền thử Direct; GET tiếp theo trả **302**, `Location` trỏ `drive.google.com`.
   - Request tiếp theo đến Google nên trả **206 Partial Content** với `Content-Type: video/...` và `Content-Range` hợp lệ.
   - `POST` trả `transport: "proxy"` → Google không đáp ứng probe hoặc video không trong allowlist; GET giữ **206 proxy** như cũ.
   - Nếu browser không phát được sau 302, frontend sẽ thử lấy ticket mới với `playbackMode:"proxy"`. Kiểm tra không có loop và playback được sau chuyển.
7. Thử phát toàn bộ, tua qua nhiều đoạn, bình luận timeline, dùng thiết bị di động, Chrome/Safari, mạng di động và Wi-Fi.

**Không thể bảo đảm Google Drive phát inline/range ổn định:** `webContentLink` theo tài liệu chính thức là đường dẫn tải xuống, có thể bị chặn hoặc yêu cầu cookie. Vì vậy nhiều file công khai cũng có thể sẽ vẫn ở proxy.

### 3. Tắt ngay (rollback không sửa code)

Để tắt hoàn toàn việc tạo redirect mới, xóa hai ENV `AMORRI_VIDEO_REDIRECT_MODE`, `AMORRI_VIDEO_REDIRECT_TEST_IDS` hoặc đặt mode rỗng rồi **Redeploy**. Các ticket redirect còn tồn tại sẽ được server xử lý bằng proxy nếu pilot tắt (ticket vẫn được xác thực qua HMAC).

Nếu muốn giữ file khách riêng tư, chuyển video demo về `Restricted` sau thử nghiệm. Nhớ rằng người đã lưu bản sao video công khai không thể bị thu hồi bản sao đó.

### 4. Giới hạn và chi phí

Redirect thành công tiết kiệm **băng thông video chảy qua Vercel**, không xóa chi phí Function POST, xác thực, thumbnail, bình luận hoặc traffic web. Việc giới hạn từ Google Drive (download/API quota), network và encoding 1080p vẫn có thể gây chờ hoặc dừng.

### 5. Bảo đảm kiểm thử

- Chạy bộ Node test + static check; parser TypeScript chỉ xác nhận cú pháp, **không tương đương `next build`**.
- Chưa thử một file Drive thật và chưa chạy Playwright/production network từ môi trường build ZIP.
- Phải chạy `npm run build` trong Codespaces đã cài dependencies trước khi deploy.
