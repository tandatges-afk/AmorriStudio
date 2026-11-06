# Amorri R10.2 — chuyển toàn bộ nghiệp vụ, KHÔNG nhập video R2

Đích: VPS `180.93.43.162`; website `https://amorri.io.vn`; PostgreSQL + local authentication; S3 local **rỗng** để nhận media MỚI; Google Drive nguồn ảnh giữ nguyên.

## Chuyển dữ liệu

- Xuất **toàn bộ** Firebase RTDB dưới dạng file backup riêng tư. Import không bỏ sót nhánh dữ liệu: lịch, booking, thợ, lịch nghỉ, lương, đặt cọc, sản phẩm, link/grant bàn giao, ảnh đã chọn, bình luận, lịch sử. Giữ nguyên khóa/mã gốc.
- Chuyển UID/email từ Firebase Auth. Mật khẩu Firebase KHÔNG được tái sử dụng; đặt lại mật khẩu local cho từng người cần đăng nhập.
- Không đụng tới video/ảnh concept cũ trên R2; không yêu cầu credentials R2; không chạy rclone copy/check/delete R2. Link lịch sử vẫn được bảo toàn ở DB nhưng media gốc R2 không phát trên VPS.
- Ảnh gốc và thư mục album qua Google Drive tiếp tục hoạt động nếu cấp đúng Drive credentials.
- Tạo bucket rỗng `amorri-video` và `amorri-concept` cho dữ liệu mới. Worker video lịch sử bị vô hiệu hóa khi cắt chuyển để không chiếm đầy disk. Chỉ bật lại worker sau khi lọc dữ liệu mới và kiểm tra dung lượng.

## Thực thi trong một đợt

1. Cập nhật nguồn R10.2 trên GitHub, rồi chuyển nguyên thư mục `vps` mới lên VPS (`/opt/amorri`).
2. Tạo `/etc/amorri/prod.env` từ `vps/live/prod.env.example`. Điền bí mật Firebase/Drive, khóa bàn giao cũ, khóa mới DB/phiên, và đặt `AMORRI_LEGACY_R2_MEDIA=skip`. **Không điền R2 credentials**.
3. Ngừng ghi dữ liệu từ Vercel/Firebase cũ trước lúc xuất cuối cùng (bao gồm lịch/nhân sự/lương/bình luận/ảnh đã chọn).
4. Chạy `bash /opt/amorri/live/one-shot-cutover.sh`. Script sẽ nhập toàn bộ RTDB vào PostgreSQL trong transaction, xác minh từng tài liệu, nhập UID, tạo tài khoản quản trị local và dựng website.
5. Đến điểm cắt chuyển DNS, cập nhật A record `amorri.io.vn` và `media.amorri.io.vn` -> `180.93.43.162`; script cấp HTTPS sau khi DNS xác thực.
6. Kiểm thử login/lịch/phân quyền/bàn giao ảnh/lương/thợ/nhật ký và restore backup ngoại VPS. Chỉ sau đó mới tắt Vercel và Firebase. Không xóa R2 trước khi quyết định hoàn toàn không cần video cũ nữa.

**Lưu ý:** Script không thể tự đọc dữ liệu production nếu thiếu service account hợp lệ, và không có quyền đổi DNS của bạn. Không dùng lệnh xóa dữ liệu cũ hoặc `npm audit fix --force`.
