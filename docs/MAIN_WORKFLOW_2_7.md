# Amorri Studio VNext 2.7 — Main Workflow & Staff Share

> Bản nâng cấp dựa trên VNext 2.6.2 Drive Only. Không tự thay đổi dữ liệu Firebase hay áp Security Rules production.

## 1. Tính năng mới trên web chính (React + TypeScript)

- **Tạo lịch và phân công ngay:** Dashboard → `+ Tạo lịch` → đánh dấu nhân sự trong danh sách, nhập nhiệm vụ, chi phí, khu vực. API POST /api/events xác thực Admin, kiểm tra staff active, lịch nghỉ và trùng giờ trong scheduling lock.
- **Rước dâu hai nhà:** Form tạo và Form sửa lịch hỗ trợ hai giờ, hai địa điểm, số điện thoại nhà trai/nhà gái. Đây là các trường `startTrai`, `startGai`, `locTrai`, `locGai`, `phoneTrai`, `phoneGai` cũ, không tạo cấu trúc Firebase mới. Không chỉnh các trường này trên lịch không phải rước dâu.
- **Thêm/sửa sản phẩm từ web chính:** Mở một lịch → `Chỉnh sửa / phân công / xóa lịch` → `Sản phẩm bàn giao / Google Drive` → điền tên, loại, link folder/file. Backend kiểm tra link Drive và `expectedVersion`, giữ ID sản phẩm cũ, ảnh đã chọn, bình luận và metadata phụ. Thay URL đã có cần xác nhận. **Không thêm nút xóa sản phẩm** vì xóa không kiểm soát có thể làm mồ côi dữ liệu khách chọn.
- **Góp ý video ở Dashboard:** tại thẻ **Bàn giao sản phẩm**, Admin có nút **Góp ý timeline** để xem các phản hồi từ link bàn giao mới, đánh dấu đã xử lý/mở lại/xóa. API đọc yêu cầu Admin token; chỉ đọc các review có key theo chuẩn `videoReviews_v1` mới.
- **Copy tên ảnh:** Khách có thể copy danh sách tên ảnh đã chọn từ trang bàn giao React (không phải ID), phục vụ editor đối chiếu RAW.
- Các tính năng React đã có trước: xem lịch tháng, sửa/hủy/xóa có dự phòng, đội ngũ, ngày nghỉ, lương Admin, link bàn giao riêng tư, chọn ảnh và review timeline trên `/delivery`.

## 2. Link nhân sự — không cần Firebase Auth UID

1. Admin đăng nhập Dashboard như cũ.
2. Vào **Đội ngũ** → **Thêm nhân sự** (chỉ nhập tên, vai trò). Các hồ sơ cũ giữ nguyên Staff ID để không đứt lịch và lương.
3. Chọn nhân sự → **Copy link** → chọn 7/30/60/90 ngày → **Tạo link nhân sự** → **Copy link để gửi**.
4. Thợ chỉ cần mở link `https://domain/staff?staff=<ID>#token=<RANDOM>`; không cần tài khoản Firebase.
5. Admin có thể **Thu hồi**; trang của thợ hiện lịch 90 ngày và ngày nghỉ của đúng nhân sự, **chỉ xem**, không chỉnh sửa/báo nghỉ/xem lương. Admin quản lý lịch nghỉ trong Dashboard.

**Bảo mật:** Link là bearer capability; ai sở hữu link đều có thể xem. Chỉ gửi trực tiếp người nhận, không công khai, có thời hạn và thu hồi được. Trong Firebase, backend lưu hash SHA-256 của bí mật ngẫu nhiên 32 byte, không lưu token gốc. Token nằm trong URL fragment và được truyền về API bằng header, không phải query. Dữ liệu trả về loại bỏ số điện thoại, giá hợp đồng, chi phí/lương, URL nguồn và người khác trong ê-kíp.

**Các link nhân sự cũ** `/?staff=...` và `/studio?staff=...` tiếp tục tồn tại để bảo toàn đường dẫn cũ, nhưng **không được coi là liên kết riêng tư an toàn** cho đến khi chốt migration và Security Rules. Không tự áp dụng Firebase Rules mới lên Production khi `/studio` còn các luồng ghi cũ.

## 3. Vì sao hiển thị “Trình duyệt không phát được MP4”?

Thông báo trong 2.6.2 bị gán cho **bất kỳ sự kiện `video.onError` nào**, nên không cho biết lỗi thật. Google Drive qua Vercel Range Proxy có thể thất bại vì:
- POST `/api/drive-video` không cấp được playback ticket (403/401/503);
- GET/HEAD byte range trả lỗi/timeout/206 không nhất quán (đọc Network trong DevTools);
- Google Drive video đang được lưu bằng HEVC/H.265 hoặc MOV/codec mà trình duyệt không hỗ trợ dù đuôi file là MP4;
- Mạng không ổn định, Function truyền Range bị gián đoạn, tài khoản Drive không có quyền tải.

Ở 2.7 player **thử cấp lại playback ticket một lần**, giữ lại thời gian phát để tua lại khi có thể, và khi lỗi tiếp sẽ dùng iframe Google Drive Preview. Thông báo mới phân biệt HTTP, lỗi giải mã và lỗi mạng hơn nhưng **không phải chẩn đoán xác quyết**. Khi chạy iframe cross-origin, trang không được đọc `currentTime` của Drive, nên mốc giây bình luận phải nhập thủ công; API bình luận và dữ liệu cũ vẫn giữ nguyên.

### Cách kiểm tra nếu video vẫn không chạy

- Mở F12 → Network trên trang `/delivery/...`, lọc `drive-video`.
- Kiểm tra `POST /api/drive-video` phải thành công `200`, trả signed URL.
- Kiểm tra `GET /api/drive-video?...` trả `206`, `Content-Range`, `Content-Type` tương ứng; nếu lỗi, xem Vercel Function Logs ở cùng thời điểm.
- Nếu HTTP đều thành công mà video vẫn `MediaError 3/4`, kiểm tra codec file gốc bằng MediaInfo/ffprobe. MP4 + H.264/AAC tương thích tốt với các trình duyệt phổ biến; **không có gì đảm bảo Vercel có thể tự ép video gốc về 1080p**.
- Kiểm tra quyền chia sẻ Drive, mức sử dụng Fast Origin Transfer, và chất lượng mạng thực tế. Không gửi token playback hoặc private key qua chat.

## 4. Triển khai / rollback

1. Sao lưu branch và rules Firebase hiện hành. Dùng Vercel Preview trước; chưa xóa production source.
2. Thay toàn bộ mã nguồn bằng bản 2.7, giữ nguyên các biến Firebase/Drive đang chạy; **không cần biến Cloudflare, không cần UID Firebase cho nhân sự**.
3. Khi build trên GitHub/Vercel thành công, mở `/api/health`, cần `release: main-workflow-20261013-r1`.
4. Kiểm thử: tạo nhân sự mới → tạo link → thử quyền người nhận → thu hồi → xác nhận HTTP 410; tạo lịch có một thợ → lưu → thử tạo lịch trùng giờ (409) → kiểm tra ngày nghỉ trùng.
5. Thử tạo lịch rước dâu hai nhà; thêm/sửa sản phẩm Drive; mở link bàn giao khách mới và chọn ảnh; phát/tua video, góp ý timeline.
6. Kiểm thử đối chiếu bảng lương, ảnh đã chọn và lịch cũ trên staging. Chỉ chuyển Production sau khi QA đạt.
7. Rollback: triển khai lại commit 2.6.2, **không xóa** `amorriStaffShares_v1` nếu còn người đang dùng link mới. Các trường sự kiện vẫn thuộc schema cũ nên không bắt buộc migration.

## 5. Những phần chưa chuyển toàn bộ khỏi `/studio`

Một số form và workflow lâu năm vẫn ở `/studio`, ví dụ nộp source, điều khiển bàn giao nâng cao, chỉnh sửa/chốt ảnh đặc biệt, và các tùy chọn nghiệp vụ khác. Phiên bản 2.7 chuyển thêm phân công ở bước tạo, lịch hai nhà và link sản phẩm; **không tuyên bố đã chuyển 100% các tính năng**. Quan trọng: legacy trực tiếp ghi Firebase nên lớp lock TypeScript không thể ngăn đồng thời tất cả các thao tác legacy. Tiếp tục di trú trước khi khóa Security Rules.

## 6. Mức độ kiểm thử thực tế

- Node regression tests và kiểm tra cấu trúc, cú pháp TypeScript/TSX đã chạy trong môi trường đóng gói.
- **Chưa thể xác nhận `next build`, Playwright browser E2E, Firebase production hay codec/video thật** do thiếu npm dependencies và quyền truy cập dự án. CI phải chạy typecheck/build/e2e trước deploy Production.
