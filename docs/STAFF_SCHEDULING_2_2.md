# Amorri Studio VNext 2.2 — Staff, Days Off, Upcoming Schedule

## Nghiệp vụ đã chuyển sang TypeScript

- **Admin → Đội ngũ**: tạo nhân sự, sửa tên/vai trò, gắn **Firebase Auth UID**; ngừng hoạt động bằng soft delete để giữ lương và lịch sử; xem lịch nghỉ và lịch tới 90 ngày theo người.
- **Nhân sự → `/staff`**: đăng nhập Firebase Auth (Email/Password), chỉ xem lịch được gán cho UID của mình, đăng ký hoặc xóa **lịch nghỉ của chính mình**. Những ngày không có lịch không thể mở chi tiết hoặc chỉnh sửa.
- **API `GET/POST /api/staff`, `PATCH/DELETE /api/staff/:id`**: xác thực Admin và kiểm tra UID liên kết không trùng. Đã xử lý trường hợp key Firebase là số nhưng `.id` là chuỗi.
- **API `GET/POST /api/blackouts`, `DELETE /api/blackouts/:id`**: xác thực ID token; admin được thao tác mọi người, staff chỉ chính mình. Báo nghỉ bị từ chối nếu đã nhận lịch cùng ngày; không cho nghỉ trùng.
- **API `GET /api/staff/me`, `GET /api/staff/agenda`**: chọn hồ sơ staff qua Firebase token, không tin `?staff=ID`; lọc theo người và ngày, trả tối thiểu dữ liệu cần thiết (không trả số điện thoại, giá tiền, ghi chú riêng, ảnh/video, chi phí đồng nghiệp).
- **API `PATCH /api/events/:id`**: kiểm tra va chạm giờ phân công với lịch khác và ngày nghỉ trước transaction cập nhật. Chỉ áp dụng khi ngày/giờ/phân công/trạng thái thay đổi; các chỉnh sửa mô tả không bị từ chối do xung đột lịch lịch sử.

## Luồng phân quyền

1. Admin tạo nhân viên Firebase Auth riêng trong **Firebase Console → Authentication → Users** (Email/Password).
2. Admin copy **User UID** của người đó (KHÔNG lấy UID admin, KHÔNG lấy Project ID).
3. Admin vào trang web `/` → **Đội ngũ** → chọn nhân viên → dán UID → Lưu.
4. Nhân viên đăng nhập tại **`/staff`**, frontend gửi ID token; backend dùng Firebase Admin verify ID token và đối chiếu với `studioPlanner_v1/staff/*/authUid`.
5. Nếu staff chưa liên kết UID, đã ngưng hoạt động hoặc UID trùng, API trả **403/409** thay vì hiển thị dữ liệu người khác.
6. Admin có quyền đọc/chỉnh sửa toàn đội ngũ qua endpoint riêng; bản thân nhân sự không được đổi `authUid`, lương, vai trò hoặc xem sự kiện không phân công.

## Quy tắc chống trùng lịch

- Bỏ qua booking `status=cancelled`.
- Trong cùng ngày, hai lịch có giao thời gian `[start, end)` của **cùng một thợ** sẽ bị từ chối HTTP **409 `SCHEDULE_CONFLICT`**.
- Có thể nhận 2 ca không chồng nhau nếu cả hai có giờ hợp lệ; thiếu giờ, end <= start hoặc rước dâu hai địa điểm → coi như kín **cả ngày** để không xếp trùng.
- Ngày nghỉ là toàn ngày; một nhân sự không được báo nghỉ vào ngày có bất kỳ lịch phân công nào (kể cả ca không giao nhau), không thể tạo 2 bản báo nghỉ cùng ngày.
- `studioPlanner_v1/schedulingWriteLock_v2`: khóa ghi có thời hạn 60s, phối hợp **các endpoint VNext 2.2** khi ghi lịch/đăng ký/xóa ngày nghỉ. Không lock quá 15 lần chờ; trả 409 `SCHEDULE_BUSY` khi bận.

### Giới hạn quan trọng — cần xử lý trước production

**Chưa có bảo đảm tuyệt đối khi hai hệ thống cùng ghi:** trang `/studio` **legacy** và client Firebase cũ vẫn có thể ghi thẳng vào RTDB, không dùng khóa VNext. Không thể tuyên bố loại bỏ hoàn toàn tình trạng 2 người cùng nhận lịch khi vẫn cho phép đường ghi cũ. Lease 60 giây cũng là cơ chế best-effort nếu một thao tác kéo dài quá TTL. Để đồng bộ tuyệt đối cần:

1. Di trú **mọi** lệnh ghi lịch/nghỉ còn lại của `/studio` sang API server; khóa hoặc từ chối mọi đường ghi trực tiếp từ trình duyệt qua Firebase Security Rules.
2. Dùng lịch chuẩn hóa (`staffId/date/slot`) với unique reservation hoặc một transaction chung cho tất cả writer. Áp dụng rollback/compensation đúng cách khi tạo/xóa booking; chạy stress test song song.
3. Cập nhật RTDB Security Rules: đường `studioPlanner_v1` nhạy cảm chỉ server service account có quyền write, riêng guest gallery dùng share token có thời hạn và bộ API giới hạn trường đọc. **Không áp quy tắc chặn trực tiếp trước khi nâng cấp toàn bộ `/studio`**, nếu không tính năng cũ sẽ hỏng.
4. RTDB cần index `.indexOn`: `events` (`date`,`id`), `staff` (`id`,`authUid`), `blackouts` (`id`) tại node đúng. Chỉ thêm index vào rules hiện có, không thay thế toàn bộ rules bằng ví dụ chưa được kiểm chứng.
5. Hoàn thiện phân trang cho ngày cực nhiều lịch, theo dõi giới hạn Vercel Fast Origin Transfer (nhất là video API cũ).

## Checklist kiểm thử Preview / staging

- [ ] `/api/health` có `release: staff-scheduling-20261013-r1`.
- [ ] Admin cũ đăng nhập và dashboard, lịch/thanh toán/gallery vẫn hiển thị.
- [ ] Admin tạo nhân sự, gắn UID Firebase đúng, không cho một UID gắn 2 nhân sự.
- [ ] Thợ đăng nhập `/staff` thấy **chỉ** lịch đã phân công; gửi request sửa `staffId` người khác trả **403**.
- [ ] Thợ chưa liên kết UID bị từ chối; logout/ login lại không để lộ dữ liệu người cũ.
- [ ] Staff có lịch ngày D không thể báo nghỉ ngày D; ngày nghỉ trùng trả 409.
- [ ] Admin phân công nhân sự đang nghỉ / bị trùng giờ → 409; ca kết thúc 12:00 và ca tiếp theo 12:00 → chấp nhận.
- [ ] Lịch rước dâu hai nhà hoặc không có giờ không được xếp trùng ngày.
- [ ] Khi đổi tên/ghi chú một booking legacy đã có trùng lịch từ trước, vẫn có thể lưu những trường không liên quan lịch.
- [ ] Dữ liệu staff và blackout dùng key số cũ, event assignments object cũ vẫn được tìm đúng.
- [ ] Kiểm tra song song hai request xếp lịch qua VNext; kiểm tra còn đường ghi trực tiếp `/studio` trước khi đổi rules.
- [ ] Đảm bảo không thao tác xóa dữ liệu thật trên Production trong giai đoạn thử nghiệm.

## Kiểm thử local

```bash
npm install
npm run typecheck
npm test
npm run test:unit
npx playwright install chromium
npm run test:e2e
npm run build
```

Trong môi trường đóng gói ZIP, `npm install` không hoàn tất do không truy cập được npm registry, **chưa thể chứng nhận `next build`/Playwright hoặc RTDB production**. Đã chạy `npm run check:static` và test Node; cần xác nhận kết quả thật trong Vercel Preview.
