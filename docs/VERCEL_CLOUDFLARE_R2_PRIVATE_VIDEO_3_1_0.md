# Amorri Studio VNext 3.1.0 — Vercel + Cloudflare R2 Private Video

## 1. Mục tiêu

**Vấn đề đã xác nhận:** Request `GET /api/drive-video` hiện trả `206 Partial Content`, `X-Amorri-Stream: vnext-stage1`, đoạn 16 MiB. Đây là proxy video từ Google Drive qua Vercel Function; dung lượng video có thể tính vào Fast Origin Transfer.

**Giải pháp:** Google Drive tiếp tục lưu video gốc; đồng bộ một bản video **MP4 1080p H.264/AAC** vào bucket **Cloudflare R2 private**; API Vercel xác thực `deliveryToken`, file ID và sản phẩm theo Firebase/Drive; chỉ trả **presigned R2 URL có thời hạn**. Thẻ `<video>` trên trình duyệt lấy dữ liệu, tua bằng HTTP Range trực tiếp tại R2, không đi qua Vercel Functions.

Không cần công khai Google Drive; không cần nhập Drive File ID vào Environment Variables. Cần **đồng bộ file vào R2 trước khi phát**: chỉ đổi biến môi trường không di chuyển được 5,77 GiB video.

## 2. Mở R2 trên Cloudflare

1. Vào <https://dash.cloudflare.com/> → **R2 Object Storage** → nếu cần, bật thanh toán R2.
2. Tạo bucket `amorri-private-videos` (Storage Class **Standard**). Giữ **Public Development URL OFF**, không gắn public custom domain.
3. Lấy `Account ID` từ trang Cloudflare.
4. Tạo **R2 API token**. Dùng **Object Read** với scope chỉ bucket này cho Vercel. Tạo token khác có **Object Read & Write** cho máy tính chạy `rclone` (không đưa token write vào Vercel).
5. Ghi lại `Access Key ID`, `Secret Access Key`. Không đăng chúng lên GitHub, gửi vào chat hoặc chụp ảnh không che.

### R2 CORS (đề xuất cho player trên các trình duyệt)

Bucket → Settings → CORS Policy. Thêm chính xác origin của web (đổi theo domain production). Nếu Cloudflare hiển thị editor JSON, cấu hình dạng:

```json
[
  {
    "AllowedOrigins": ["https://amorri.vercel.app"],
    "AllowedMethods": ["GET", "HEAD"],
    "AllowedHeaders": ["Range"],
    "ExposeHeaders": ["Accept-Ranges", "Content-Range", "Content-Length", "Content-Type", "ETag"],
    "MaxAgeSeconds": 3600
  }
]
```

Không cho phép mọi origin nếu không cần; không cần PUT của browser. Signed URL của R2 **chỉ hợp lệ trên S3 endpoint** `*.r2.cloudflarestorage.com`, không phải public bucket/custom domain. R2 presigned URL là bearer token: người giữ URL có thể truy cập cho đến khi hết hạn.

## 3. Cấu hình Vercel

**Vercel → Project Amorri Studio → Settings → Environment Variables → Production:**

```dotenv
AMORRI_VIDEO_DELIVERY_MODE=r2-prefer
R2_ACCOUNT_ID=<Account ID, 32 hex chars>
R2_BUCKET=amorri-private-videos
R2_ACCESS_KEY_ID=<R2 Object Read token access key id>
R2_SECRET_ACCESS_KEY=<R2 Object Read token secret key>
R2_PLAYBACK_TTL_SECONDS=3600
```

Cách triển khai an toàn:

- **Đầu tiên** chọn `r2-prefer` để video đã đồng bộ phát qua R2; video chưa đồng bộ vẫn có thể phát proxy (vẫn có Fast Origin Transfer cho trường hợp này).
- **Sau khi đồng bộ tất cả video cần bàn giao**, chuyển `AMORRI_VIDEO_DELIVERY_MODE=r2-only` và Redeploy. Chế độ này tuyệt đối không dùng proxy trong API video, kể cả đối với ticket proxy phát hành cũ. Nếu chưa đồng bộ, POST trả `409 VIDEO_NOT_MIRRORED` thay vì trả proxy. API còn truyền JSON nhỏ phục vụ xác thực.
- **Rollback**: đổi mode thành `drive` hoặc xóa biến và Redeploy; video dùng lại luồng cũ.

Giữ nguyên các biến Firebase, Drive, Google Places đang hoạt động. Hai biến `AMORRI_VIDEO_REDIRECT_MODE` và `AMORRI_VIDEO_REDIRECT_TEST_IDS` không liên quan R2 và có thể bỏ khi chạy `r2-only`.

**Quan trọng:** Chỉ commit code, KHÔNG commit `.env*`, JSON Service Account hoặc `rclone.conf`.

## 4. Đồng bộ video Drive → R2 (không đi qua Vercel)

Thực hiện bằng **máy tính, workstation, Codespace đủ disk**, hoặc một máy worker/VPS nhỏ để làm transcoding. Mã nguồn đã có script `scripts/sync-drive-to-r2.mjs`, chỉ cần 2 công cụ ngoài: [`rclone`](https://rclone.org/downloads/) và [`ffmpeg`](https://ffmpeg.org/download.html) nếu muốn tự chuyển 1080p. `rclone` hỗ trợ multipart cho file trên 5 GiB.

### Cấu hình rclone một lần

Chạy `rclone config`:

- Remote **`drive`**: `Storage: drive` (Google Drive), sử dụng Google Service Account JSON được chia sẻ quyền đọc thư mục gốc. Có thể dùng OAuth của chủ Drive nếu cần; tài khoản phải truy cập được video.
- Remote **`r2`**: `Storage: s3`, `provider: Cloudflare`, `region: auto`, `endpoint: https://<R2_ACCOUNT_ID>.r2.cloudflarestorage.com`, API token **read/write riêng**. Cấu hình remote trong máy tính của bạn, không ở repo.

Đặt credential Drive đọc-only **cục bộ**, ví dụ trên Linux/Codespaces:

```bash
export DRIVE_SERVICE_ACCOUNT_JSON="$(cat /home/codespace/.secrets/drive-service-account.json)"
export R2_BUCKET=amorri-private-videos
```

`.secrets/drive-service-account.json` ở ngoài repo; chỉ dẫn đường dẫn ví dụ, thay thành nơi bạn đã lưu an toàn. Với Windows Powershell dùng `$env:DRIVE_SERVICE_ACCOUNT_JSON = Get-Content 'C:\secure\drive-service-account.json' -Raw`.

### Test một video trước

```bash
npm ci
node scripts/sync-drive-to-r2.mjs --id YOUR_DRIVE_FILE_ID --transcode-1080 --dry-run
node scripts/sync-drive-to-r2.mjs --id YOUR_DRIVE_FILE_ID --transcode-1080
```

Script sẽ: lấy metadata Drive bằng Service Account; tự tính version (`size`, `md5Checksum`, `modifiedTime`); tải Drive về máy chạy script; dùng FFmpeg chuyển thành MP4 H.264/AAC <=1080p (CRF21, maxrate 8Mbps, faststart); **rclone multipart upload** đến R2; xóa file tạm sau khi xong. **Không có video bytes qua Vercel.** Máy chạy script cần đủ chỗ trống để giữ đồng thời file gốc (ví dụ 5,77 GiB) và bản 1080p mới, phải có CPU và thời gian chuyển mã.

Nếu không muốn transcode và giữ y nguyên video gốc (ví dụ video đã là MP4 1080p H.264), dùng:

```bash
node scripts/sync-drive-to-r2.mjs --id YOUR_DRIVE_FILE_ID --original
```

Để đưa một file 1080p đã chuyển mã trước vào R2:

```bash
node scripts/sync-drive-to-r2.mjs --id YOUR_DRIVE_FILE_ID --file /path/to/optimized-1080.mp4
```

Để đồng bộ **toàn bộ video trong một folder Drive**, bao gồm thư mục con và shortcut video:

```bash
node scripts/sync-drive-to-r2.mjs --folder YOUR_DRIVE_FOLDER_ID --transcode-1080
```

Hoặc nhiều video bằng danh sách ID, mỗi dòng một ID:

```bash
node scripts/sync-drive-to-r2.mjs --ids-file /tmp/drive-video-ids.txt --transcode-1080
```

Các thao tác trên **không upload video qua website, không tạo Environment Variable cho mỗi ID**, và không tự đồng bộ file mới trừ khi bạn chạy script lại hoặc lập lịch ngoài Vercel. Muốn tự động cho video mới, chạy định kỳ script trên máy worker luôn hoạt động (không chạy transcode nặng trong Vercel Functions hoặc một Codespace đã tắt).

**Tự kiểm tra:**

```bash
rclone lsf r2:amorri-private-videos/videos/ --recursive
```

Tên key sẽ là `videos/<DRIVE_ID>/<REVISION>/1080p.mp4` (ưu tiên) hoặc `/original.mp4`. Nếu Drive file được thay đổi nội dung, revision tự đổi, cần đồng bộ lại để tránh phát nhầm bản cũ.

## 5. Kiểm tra thành công trên web

1. Push bản VNext 3.1.0 lên GitHub → Vercel deploy.
2. Mở `https://amorri.vercel.app/api/health`, tìm `privateVideoRelease: r2-signed-private-20261013-r1` và `privateVideoMode: r2-prefer` hoặc `r2-only`.
3. Mở trang bàn giao, bấm phát video đã đồng bộ; F12 → Network → POST `/api/drive-video` phải có `transport: "r2"`, `quality: "1080p"` (nếu đã upload 1080p).
4. Yêu cầu **GET video** tiếp theo phải có host `<ACCOUNT_ID>.r2.cloudflarestorage.com` và status `206 Partial Content` khi seek. **Không còn GET `/api/drive-video` 16 MiB** cho video này.
5. Vercel → Usage → Fast Origin Transfer: khi xem lại video đã đồng bộ, không tăng theo kích thước video (vẫn có request API/web tốn rất ít bytes). Đối chiếu trong khoảng thời gian tương đồng; số liệu Usage có độ trễ.

Nếu POST trả `409 VIDEO_NOT_MIRRORED`: video chưa nằm ở key khớp revision của Drive; chạy lệnh sync. Nếu trả `503` từ R2: kiểm tra Account ID, bucket, token Read, quyền token, response log, và CORS nếu yêu cầu phát GET thất bại. Nếu POST trả `transport: proxy`: bạn đang ở `r2-prefer` mà file chưa đồng bộ. **Không nên tự chuyển sang `r2-only` trước khi đủ video.**

## 6. Chi phí và bảo mật

- R2 Standard hiện: phí lưu trữ **$0.015/GB-month**, egress ra Internet **không tính phí**, có phí thao tác Class A/B. Hạn mức miễn phí Standard là **10 GB-month, 1 triệu Class A, 10 triệu Class B / tháng** (xem pricing Cloudflare để biết giá mới). Với video 5,77 GiB gốc, lưu trữ gần 6,19 GB (thập phân) đã dùng hơn nửa free tier nếu chứa bản gốc; 1080p nén nhẹ hơn.
- Vercel vẫn có phí request, function invocation, transfer JSON/API, hosting giao diện; **không còn Fast Origin Transfer của payload video** khi tất cả video chạy R2 trực tiếp và mode `r2-only`.
- R2 private bucket + signed URL là **bảo vệ theo thời hạn**, không phải DRM. URL có thể bị sao chép/chia sẻ cho đến hết hạn (mặc định 1 giờ); thu hồi delivery link không lập tức vô hiệu hóa signed URL đã phát hành. Không log URL signed; cân nhắc giảm `R2_PLAYBACK_TTL_SECONDS` nếu dữ liệu nhạy cảm, nhưng cần đánh đổi rủi ro hết hạn giữa lúc xem.
- Video gốc nằm trên Google Drive và R2 chứa một bản chuyển mã riêng; việc chuyển mã có thể làm thay đổi dung lượng/bitrate nhưng không ảnh hưởng file gốc.
- Không bật public bucket hoặc `r2.dev` vì sẽ bỏ qua cơ chế xác thực.
- Rollback có thể làm phát sinh Fast Origin Transfer trở lại; đặt cảnh báo quota và xem Usage thường xuyên.

Nguồn tham khảo: [Cloudflare R2 Pricing](https://developers.cloudflare.com/r2/pricing/), [R2 Presigned URLs](https://developers.cloudflare.com/r2/api/s3/presigned-urls/), [R2 Multipart uploads](https://developers.cloudflare.com/r2/objects/upload-objects/), [Vercel Fast Origin Transfer](https://vercel.com/docs/manage-cdn-usage), [rclone Google Drive copyid](https://rclone.org/drive/).

## 7. Mức độ kiểm chứng

Đã kiểm tra bằng Node.js 22: unit tests mới cho R2 và chạy test suite hiện có. Không thể kiểm thử end-to-end với Cloudflare R2, Google Drive production và Firebase thật khi không có credentials. Môi trường chạy mã tại đây không tải được npm packages nên chưa có xác nhận `npm run build` production. Không tự tuyên bố đã xóa chi phí Vercel trước khi Network xác nhận tải R2 trực tiếp.
