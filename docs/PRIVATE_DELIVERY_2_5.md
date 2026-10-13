# Amorri Studio VNext 2.5 — Private Client Delivery

## Điểm mới

- Admin → **Bàn giao sản phẩm → Link an toàn 2.5**: tạo mã truy cập ngẫu nhiên **256-bit**, thời hạn 1–90 ngày, chế độ **chỉ xem** hoặc **xem + góp ý/chọn ảnh**; xem các grant cũ và thu hồi.
- Link dạng `/delivery/<eventId>#token=<grantId>.<secret>`. Token nằm trong URL fragment (không được trình duyệt gửi tới server khi GET HTML). JavaScript xóa fragment khỏi thanh địa chỉ, giữ trong `sessionStorage` của tab và chỉ gửi qua header `x-amorri-delivery-token` đến API. Người có link vẫn có thể chuyển tiếp; đây là *bearer link*, chưa phải đăng nhập danh tính khách.
- Firebase chỉ lưu SHA-256 của phần bí mật; so sánh bằng `timingSafeEqual`, có kiểm tra hạn dùng/revoked. Nhánh `amorriDeliveryAccess_v1` dành riêng cho backend.
- `/api/delivery/[eventId]`: trả danh sách trắng tên lịch, ngày và sản phẩm, không trả giá tiền, số điện thoại, nhân sự, nội dung lịch và quyền hệ thống.
- `/api/delivery/[eventId]/media`: lấy file hợp lệ từ Drive Service Account theo URL sản phẩm đã lưu; chặn duyệt thư mục tùy ý. Hỗ trợ file hoặc thư mục + shortcuts. Nếu Drive từ chối đọc hoặc quá 1.500 file, **dừng an toàn** thay vì gửi danh sách không đầy đủ.
- `/api/delivery/[eventId]/selections` (PUT): chỉ ghi khi token có quyền `review`, kiểm tra lại mọi ID ảnh dựa trên listing Drive, cập nhật `favoritePhotoItems` và `favoritePhotos` vào đúng Firebase record (kể cả record có khóa số), transaction giữ nguyên tất cả trường legacy khác. Mỗi lần lưu chỉ thay thế ảnh của đúng sản phẩm + nguồn hiện tại. Những lựa chọn nguồn cũ thiếu metadata được giữ để tránh mất lịch sử.
- `/api/delivery/[eventId]/reviews` (GET/POST): đúng vị trí `videoReviews_v1/<legacyReviewKey(eventId)>/<legacyReviewKey(productId::mediaId)>`. Lưu comment tên, nội dung và `seconds`. Rate limit cơ bản 3 giây / lần, tối đa 200 bình luận một grant. Admin có API PATCH/DELETE comment. Khách không có quyền tự đánh dấu Fix hoặc xóa comment.
- `/api/drive-video` vẫn cấp ticket sau khi đã xác minh liên kết event / product / file. Với 2.5, POST phải có `deliveryToken` hợp lệ; ticket video mới chỉ 15 phút (legacy giữ TTL cũ). Thu hồi grant ngăn cấp ticket mới, **không thu hồi ticket đang có ngay lập tức**.
- CSS/client React mới trong `components/ClientDelivery.tsx`; video native 1080p *nếu file codec/bitrate/browser hỗ trợ*, có fallback Google Drive iframe; bình luận đúng theo `currentTime` của player native. Nếu fallback iframe thì mốc thời gian phải nhập tay.

## Những gì không thay đổi

- Lịch, lương, nhân sự, báo nghỉ, dashboard, lịch sắp tới: vẫn từ 2.4.
- Trang `/studio` và các link `?client_gallery` cũ vẫn chạy. Chúng **vẫn dùng browser Firebase SDK**. Không coi các link cũ an toàn chỉ vì link mới đã có token.
- `videoReviews_v1` và `studioPlanner_v1` không đổi dữ liệu/sơ đồ, ngoại trừ ghi mới của API 2.5 khi người dùng thao tác.
- Không tự đổi Firebase Security Rules, không chạy migration dữ liệu tự động.

## QUAN TRỌNG: Chưa phải chuyển đổi bảo mật hoàn toàn

- Mặc định `AMORRI_LEGACY_DELIVERY_ACCESS=compat` (hoặc không đặt) để link cũ hoạt động. Đặt `strict` sẽ chặn việc guest không có token xin ticket `/api/drive-video` và gọi `/api/get-drive-images`. Đây **không** phải lá chắn đầy đủ nếu Firebase RTDB Security Rules vẫn cho phép đọc/ghi dữ liệu cũ trực tiếp; phải kiểm toán Rules trước khi bật Production.
- `scripts/prepare-rtdb-rules.mjs` hiện thêm đề xuất deny read/write cho `amorriDeliveryAccess_v1`. Nó chỉ tạo *đề xuất offline*, không tự deploy. Nó không tự siết `videoReviews_v1`; việc này cần thử riêng trên Emulator/staging, xem lại đường ghi admin/staff `/studio`.
- Hình thumbnail Google Drive và link preview bên ngoài vẫn do Google Drive kiểm soát quyền chia sẻ. Nếu file đã được đặt public, revoke link 2.5 **không làm file Drive đó thành private**. Nếu Google Drive không cho xem thumbnail khi không public, giao diện có thể không tải được ảnh. Cần proxy ảnh/CDN riêng cho quyền truy cập end-to-end sau này.
- Video vẫn được stream qua Vercel Function (Drive Range Proxy) và có thể tiếp tục tiêu thụ **Fast Origin Transfer**; chưa có HLS/AV1/transcoding/CDN chuyên dụng. Không khẳng định đã đạt video 1080p mượt trên mọi thiết bị.
- Không có giới hạn chống spam phân tán theo IP hay captcha; giới hạn hiện chỉ theo grant, có thể reset bằng link mới. Cân nhắc Cloudflare WAF/Turnstile và quan trắc trước khi phổ biến rộng.

## Staging rollout & QA bắt buộc

1. Backup RTDB và Security Rules Production, clone database cho staging, tạo Vercel Preview riêng; **không** bật strict trên Production ở bước đầu.
2. Giữ nguyên 13 biến Firebase/Drive và khóa archive từ 2.4; không cần generate private key mới. Nếu muốn thử chặn API legacy, thêm `AMORRI_LEGACY_DELIVERY_ACCESS=strict` **trên Preview thôi**.
3. Deploy Next.js, để Output Directory tự động, mở `/api/health`, xác nhận `private-delivery-20261013-r1`. Chạy `npm run typecheck`, `npm test`, `npm run test:e2e`, `npm run build` trong CI.
4. Admin tạo link 1 ngày → mở từ trình duyệt ẩn danh → xem media đúng lịch, không nhìn thấy số điện thoại/lương; không xem được eventId khác hoặc URL không có token.
5. Test link chỉ xem: GET hợp lệ; gửi comment/chọn ảnh trả 403. Test link review: gửi ảnh đúng folder thành công, ảnh ngoài folder 422; gửi video comment đúng `seconds`.
6. Thu hồi: API GET/link mới từ token cũ trả 410. Link hết hạn trả 410; comment spam trả 429. Video đã được cấp ticket có thể còn phát đến tối đa 15 phút.
7. Test event lưu bằng numeric key, event đã thay URL sản phẩm trong lúc chọn ảnh, các `favoritePhotoItems` cũ và `videoReviews_v1`; mở `/studio` xác nhận cùng lịch không mất lịch sử.
8. Test preview ảnh Drive private và public; video MP4 H.264/AAC và MOV/HEVC trên Safari/Chrome; network throttling, seek forward/back, full-screen, comments ở mốc >1h; kiểm tra Vercel usage Fast Origin Transfer.
9. Chỉ sau khi **Firebase Emulator Rules tests** đạt mới thay thế link cũ và xem xét strict + deny read/write từng nhánh. Mọi thay đổi cần rollback theo từng bước.

## API tóm tắt

| API | Quyền |
|---|---|
| `POST/GET /api/delivery/grants` | Firebase Admin Bearer |
| `DELETE /api/delivery/grants/<grantId>?eventId=<id>` | Firebase Admin Bearer |
| `GET /api/delivery/<eventId>` | X-**Amorri**-Delivery-Token |
| `GET /api/delivery/<eventId>/media?productId=<id>` | Delivery Token |
| `PUT /api/delivery/<eventId>/selections` | Delivery Token + `scope=review` |
| `GET/POST /api/delivery/<eventId>/reviews?productId=...&mediaId=...` | Delivery Token; POST `scope=review` |
| `PATCH/DELETE /api/delivery/<eventId>/reviews/<commentId>?productId=...&mediaId=...` | Firebase Admin Bearer |

**Dữ liệu bí mật:** Không gửi service-account JSON / token truy cập / signing secret vào Git, browser logs hoặc support chat.
