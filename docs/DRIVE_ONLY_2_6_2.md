# Amorri Studio VNext 2.6.2 — Tạm gỡ Cloudflare HLS/CDN

## Phạm vi
- Xóa nút HLS/CDN 2.6 ở Dashboard bàn giao, giao diện nhập video Stream UID, server API `/api/video-streams/[eventId]`, logic Cloudflare HLS và gói `hls.js`.
- React `/delivery/[eventId]` phát video qua `/api/drive-video`: tạo ticket bằng Google Drive service account, stream HTTP Range. Nếu nguồn không phát qua thẻ video HTML5, tự mở xem trước qua iframe Drive; mốc góp ý trong iframe nhập bằng tay.
- Không thay đổi danh sách ảnh đã chọn, quyền link bàn giao 2.5, bình luận timeline `videoReviews_v1`, bản gốc Drive, booking, bảng lương, nhân sự, Security Rules.
- Để tránh phá client đang dùng bản 2.6 cũ từ cache, POST `/api/delivery/[eventId]/playback` vẫn còn nhưng **chỉ trả `provider: drive`** sau khi xác minh token + quyền truy cập clip; không cấp URL Cloudflare.

## Deploy
1. Backup phiên bản production, cập nhật source từ ZIP mới, deploy **Preview** trước. Giữ nguyên biến Firebase và Google Drive đã chạy tốt.
2. Không cần thêm `CF_STREAM_ACCOUNT_ID`, `CF_STREAM_API_TOKEN`, `CF_STREAM_CUSTOMER_CODE`, `AMORRI_STREAM_TOKEN_TTL_SECONDS`. Có thể xóa các biến Cloudflare khỏi Vercel sau khi xác minh bản mới chạy, nhưng không phải yêu cầu để deploy.
3. Mở `/api/health`: xác nhận release `drive-only-20261013-r1` và `streamingApi: google-drive-only`.
4. Kiểm tra Admin → Bàn giao sản phẩm: không có nút `HLS / CDN 2.6`; có `Link an toàn`.
5. Kiểm tra khách `/delivery/<eventId>#token=...`: ảnh và video tải, dừng/tua và gửi bình luận tại đúng giây, mở Drive iframe fallback khi file không phát trực tiếp.
6. Kiểm tra lại `/studio` (legacy), `/staff`, lương và lịch. Không thay Firebase Security Rules trên Production trong bước này.

## Lưu ý
- Bản này **không** tự chuyển mã hoá MP4 hoặc ép chất lượng video về 1080p. Video Drive phụ thuộc codec/bitrate gốc và băng thông, Vercel Functions tiếp tục trung chuyển video, vì thế vẫn có thể giật và phát sinh Fast Origin Transfer.
- `amorriVideoStreams_v1` đã lưu trên Firebase **không bị xóa**; chỉ ngừng truy cập từ code mới.
- Đừng công khai nội dung service account; không gửi khóa private lên chat hoặc GitHub.
- Chưa thể tuyên bố Next.js production build / Playwright thành công khi không có đầy đủ npm dependency và Firebase/Drive staging.
