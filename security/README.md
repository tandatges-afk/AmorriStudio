# Realtime Database Security Rules — đề xuất an toàn cho staging, không tự triển khai

Không có snapshot rules production trong bộ source: **không thể biết chính xác quyền hiện tại**. Vì vậy công cụ này chỉ đọc một bản rules đã được export và tạo file đề xuất mới; tuyệt đối không gọi Firebase CLI để `deploy`.

1. Xuất rules đang hoạt động ở Firebase Console → Realtime Database → Rules, lưu thành `current-rtdb-rules.json` (không commit khi có thông tin nhạy cảm).
2. Chạy `node scripts/prepare-rtdb-rules.mjs current-rtdb-rules.json proposed-rtdb-rules.json --ack-breaks-legacy-writes`.
3. Công cụ sẽ **từ chối** export có `.read`/`.write` permissive ở root. Đề xuất đặt `.write: false` tại `studioPlanner_v1` và xóa các `.write` con, bảo toàn `.read`, `.indexOn` và nhánh `videoReviews_v1` hiện tại. Kho archive bị chặn read/write qua SDK (Admin SDK backend vẫn có thể truy cập).
4. So sánh diff, thử Firebase Emulator Rules Unit Testing, kiểm tra album ảnh và comment video, rồi mới thảo luận migration. **KHÔNG áp dụng đề xuất này ngay vào Production**: khách vẫn ghi lựa chọn ảnh trong `studioPlanner_v1`; nhân sự/admin nâng cao còn ghi trực tiếp.
5. Việc giữ `.read` chỉ tương thích, **không đồng nghĩa đã bảo vệ thông tin**. Cần thiết kế quyền đọc có token cho delivery và phép xem lương/thông tin khách trong một đợt migration tiếp theo.

Không cấu hình một giá trị `AMORRI_LEGACY_ADMIN_WRITES` nào có thể thay thế Security Rules. Tham khảo `docs/SECURITY_CUTOVER_2_4.md`.
