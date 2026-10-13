# Amorri Studio VNext 3.0.2 — Xử lý lỗi Google Places trên Vercel

## Triệu chứng

Trang `/api/health` trả `ok:true`, còn `/api/places?input=...` trả `items:[]` với thông báo Google Places chưa sẵn sàng.

Health endpoint **không** gọi Google Places. Trong phiên bản cũ, lỗi Google (400/403/429/5xx) bị gom thành một thông báo chung, không phân biệt lỗi key/billing/API/quota.

## Cách cài đặt

1. Trong Google Cloud, chọn đúng project chứa API key; bật **Places API (New)** và liên kết Billing hợp lệ.
2. Trong **APIs & Services > Credentials**, chọn key sử dụng từ Next.js server. Đặt **API restrictions = Places API (New)**. Với Vercel outbound IP không cố định mặc định, không đặt HTTP referrers hoặc tùy tiện đặt IP restriction cho key server-side. Để tăng bảo mật, cân nhắc fixed egress IP, quota và cảnh báo chi phí.
3. Trong Vercel **Project > Settings > Environment Variables**, đặt `GOOGLE_MAPS_API_KEY` cho đúng môi trường đang phục vụ domain (thường Production), giá trị key thật, không thêm dấu ngoặc kép, khoảng trắng hoặc `NEXT_PUBLIC_`.
4. Tạo **deployment mới** (`Deployments > Redeploy`). Các deployment cũ không nhận biến mới.
5. Đăng nhập Admin, gõ ít nhất 3 ký tự tại ô địa điểm, mở F12 > Network > request `/api/places?input=...` > Response.
6. Đối chiếu `code`, `googleReason`, `upstreamHttpStatus` với bảng dưới đây. Không gửi API key cho người khác.

| Code | Nguyên nhân/gợi ý |
| --- | --- |
| `PLACES_MISSING_KEY` | Environment variable chưa có tại deployment này |
| `PLACES_INVALID_KEY` | API key không hợp lệ |
| `PLACES_KEY_RESTRICTION` | Key bị chặn do application/API restriction |
| `PLACES_API_DISABLED` | Places API (New) chưa bật trong đúng Google Cloud project |
| `PLACES_BILLING` | Billing chưa bật / có sự cố |
| `PLACES_PERMISSION_DENIED` | HTTP 403, cần xem `googleReason` hoặc kiểm tra quyền |
| `PLACES_QUOTA` | Hết quota hoặc bị rate-limit |
| `PLACES_INVALID_REQUEST` | Google báo HTTP 400, kiểm tra payload/request |
| `PLACES_TIMEOUT`, `PLACES_NETWORK_ERROR` | Kết nối từ server bị lỗi hoặc chậm |

Dữ liệu trả về `googleReason` là mã lỗi kỹ thuật từ Google, không chứa raw Google response body. Server log lưu mã loại lỗi tương ứng, **không log API key**.

## HTTP 302 không liên quan đến Google Places

`/api/health` chỉ báo rằng mã nguồn chứa cơ chế 302 pilot; không chứng minh bất kỳ video nào đã đi qua 302. Xác nhận bằng F12 > Network khi phát video demo (không dùng file riêng tư). Đảm bảo các biến `AMORRI_VIDEO_REDIRECT_MODE=verified-public` và `AMORRI_VIDEO_REDIRECT_TEST_IDS=<id thật>` tồn tại trong deployment. Nếu không vượt qua kiểm tra HTTP Range của Google Drive, hệ thống chủ động fallback proxy như trước.

## An toàn

- Không dán hoặc chụp ảnh lộ API key Google Maps, Firebase service account hay signing secrets.
- Dán link Google Maps thủ công không cần key, chỉ gợi ý tự động cần Places API.
- Nếu API key vô tình bị lộ, hãy rotate key trên Google Cloud và redeploy Vercel.
