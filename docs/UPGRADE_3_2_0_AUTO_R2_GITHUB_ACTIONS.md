# Amorri Studio VNext 3.2.0 — Drive → Private R2 worker

## Thành phần mới

- `scripts/auto-drive-to-r2.mjs`: đọc link sản phẩm từ `studioPlanner_v1/events` trong Firebase (lịch 120 ngày gần đây đến 60 ngày tới), tìm file video trong Drive/file/folder, kiểm tra R2 và chỉ xử lý những video chưa có bản 1080p của **revision hiện tại**.
- `.github/workflows/r2-video-sync.yml`: worker GitHub Actions (không chạy FFmpeg trên Vercel hoặc trong trình duyệt). Có chế độ chạy tay (`workflow_dispatch`) và chạy theo lịch **2 lần/ngày** chỉ khi bật biến `AMORRI_ENABLE_AUTO_R2_SYNC=true`.
- `app/api/system/video-sync/route.ts` và `components/VideoSyncMonitor.tsx`: báo cáo Admin trong **Hệ thống → Video R2**, không gửi khóa bí mật đến trình duyệt.
- Giới hạn mặc định `1` video mới/lượt, tối đa 5 qua `--max`. **Không tự xóa video**. Giới hạn dung lượng mềm dựa trên số byte các video worker đã ghi vào Firebase; KHÔNG phải quota thực/đảm bảo 10GB của Cloudflare.

## 1. KHÔNG commit bí mật

Các file sau phải ở ngoài repo hoặc chỉ trong secret manager:

- `/home/codespace/.config/amorri/drive-sa.json`
- `/home/codespace/.config/rclone/rclone.conf`
- `.env`, `.env.local`, Google/Firebase Service Account JSON, R2 Access/Secret Key
- `.mp4`, file transcode, `node_modules`, `.next`

**Nếu credential từng xuất hiện trong chat, ảnh, commit hoặc log**, revoke/rotate khóa rồi thay trên Vercel/Codespaces/GitHub Secrets. Đừng dán khóa vào lệnh hiện ra trên terminal/history.

Chỉ commit các tệp mã nguồn, `.github/workflows/`, tài liệu, test và cấu hình **mẫu không có khóa**.

## 2. Cài patch lên GitHub Codespaces

Tại `/workspaces/AmorriStudio` giải nén ZIP patch đè đúng đường dẫn, hoặc dùng ZIP toàn bộ dự án nếu muốn cập nhật đủ website.

```bash
cd /workspaces/AmorriStudio
unzip -o AmorriStudio_3.2.0_Auto_R2_PATCH.zip
npm ci
npm run typecheck
npm test
```

Trước khi commit:

```bash
git status --short
git ls-files | grep -Ei 'drive-sa|rclone\.conf|\.env|secret|private.*key' || true
```

`git ls-files` cho biết file đã theo dõi. Nếu từng commit secrets, **.gitignore không xóa lịch sử**, cần thu hồi secrets ngay và xử lý lịch sử theo quy trình riêng.

Để tránh push cả ZIP:

```bash
git add .gitignore .github/workflows/r2-video-sync.yml scripts/auto-drive-to-r2.mjs \
  lib/server/video-sync-utils.mjs components/VideoSyncMonitor.tsx \
  components/Dashboard.tsx app/api/health/route.ts app/api/system/video-sync/route.ts \
  docs/UPGRADE_3_2_0_AUTO_R2_GITHUB_ACTIONS.md tests/video-sync-utils.test.mjs

git diff --cached --stat
# Nếu thấy file bị lộ khóa, dừng lại!
git commit -m 'Add private Drive-to-R2 auto sync and admin monitor'
git push origin main
```

## 3. Github Actions → Settings → Secrets and variables → Actions

Tạo **Secrets** sau (đặt tên chính xác):

| Secret | Giá trị |
| --- | --- |
| `AMORRI_DRIVE_SERVICE_ACCOUNT_JSON` | Toàn bộ Service Account JSON có quyền đọc video Drive |
| `AMORRI_FIREBASE_SERVICE_ACCOUNT_JSON` | Toàn bộ Firebase Admin JSON có quyền đọc events và ghi `videoSync_v1/status` |
| `AMORRI_FIREBASE_DATABASE_URL` | Firebase Realtime Database URL, ví dụ `https://PROJECT-default-rtdb.REGION.firebasedatabase.app` |
| `AMORRI_R2_UPLOAD_ACCESS_KEY_ID` | R2 Access Key có quyền Object Read & Write vào bucket video |
| `AMORRI_R2_UPLOAD_SECRET_ACCESS_KEY` | R2 Secret Access Key tương ứng |

Tạo **Variables** (không phải secrets; không phải khóa):

| Variable | Giá trị |
| --- | --- |
| `AMORRI_R2_ACCOUNT_ID` | Cloudflare Account ID (32 ký tự hex) |
| `AMORRI_R2_BUCKET` | `amorri-private-videos` |
| `AMORRI_ENABLE_AUTO_R2_SYNC` | Ban đầu **không tạo** hoặc đặt `false` |

*Giữ nguyên các biến R2 Read Only trên Vercel.* GitHub Actions cần khóa upload; Vercel chỉ cần khóa đọc để ký URL playback. Nếu Service Account Drive và Firebase cùng project/đủ quyền, vẫn nên hạn chế quyền riêng khi có thể.

Workflow dùng rclone mới và FFmpeg trên GitHub runner, không sử dụng `rclone.conf` hoặc `drive-sa.json` của Codespaces; runner là máy **mới, tạm thời** sau mỗi lần chạy.

## 4. Test thủ công trước (không chuyển mã)

GitHub repo → **Actions → Amorri Private R2 Video Sync → Run workflow**:

- `drive_file_id`: ID của video đã upload R2 để thử bỏ qua (hoặc để trống để quét link trong Firebase)
- `dry_run`: bật

Chờ job hoàn tất; tìm `SKIP existing` hoặc `WOULD SYNC`. Không đưa File ID bí mật vào log công khai; bảo vệ repo/workflow nếu cần.

Khi đã đúng, chạy lần hai với `dry_run=false` và một **video ngắn** chưa có trên R2. Worker cập nhật trạng thái vào Firebase và mục **Hệ thống → Video R2**.

Bật tự chạy khi đã xác nhận thành công: đặt Repository Variable `AMORRI_ENABLE_AUTO_R2_SYNC=true`. Workflow chạy lúc **01:25 và 13:25 UTC** (08:25 và 20:25 Việt Nam), nhưng GitHub có thể trì hoãn job; thời gian chính xác không được bảo đảm. Scheduler chạy tối đa 1 video mới/lượt, nên backlog lớn cần nhiều ngày.

## 5. Giới hạn vận hành

- GitHub Actions tiêu thụ runner minutes và tài nguyên CPU/disk. Video 4K có thể xử lý hàng chục phút đến vài giờ, phụ thuộc tài nguyên runner/giới hạn GitHub plan. Job hiện có timeout 300 phút.
- Bản này tìm link Drive trong các sản phẩm của lịch có ngày từ **120 ngày trước đến 60 ngày sau**, tối đa 300 lịch gần nhất. Lịch cũ hơn không tự phát hiện; dùng `workflow_dispatch` điền `drive_file_id` hoặc điều chỉnh phạm vi được kiểm soát.
- Nếu service account không có quyền đọc một folder Drive, worker ghi cảnh báo và bỏ qua folder; không tự thay đổi quyền Drive.
- Nếu đã có bản MP4 1080p đúng revision trên R2, worker **bỏ qua chuyển mã**; video mới/được chỉnh sửa sẽ có revision mới và cần dung lượng lưu trữ bổ sung.
- Chỉ trạng thái 100 file cập nhật gần nhất hiển thị trên dashboard. Tổng MB trong dashboard không phải tổng dung lượng bucket/billing. Kiểm tra Cloudflare → R2 → Usage cho mức dùng chính xác.
- Soft cap mặc định 9GB là cơ chế cảnh báo/hạn chế upload mới dựa trên các file đã được worker ghi nhận; có thể vượt mức do các file bên ngoài ledger hoặc file mới. **Không cam kết miễn phí tuyệt đối.**
- Không xóa video cũ hay tự đổi `AMORRI_VIDEO_DELIVERY_MODE` sang `r2-only`. Khi chuyển sang `r2-only`, video chưa đồng bộ sẽ không phát được.

## 6. Kiểm tra Vercel

API `/api/health` vẫn phải có `privateVideoRelease: r2-signed-private-20261013-r1` và `privateVideoMode: r2-prefer` (hoặc `r2-only` khi đủ dữ liệu).

Trang Admin → **Hệ thống → Video R2** chỉ xem dữ liệu status từ Firebase qua API kiểm tra quyền Admin. Không thể khởi động FFmpeg trực tiếp từ Vercel.

Khách xem video, F12 → Network: POST `/api/drive-video` trả `transport: r2`, GET tới `r2.cloudflarestorage.com` trả 206. Video sẽ không đi qua Vercel Function ở luồng này.
