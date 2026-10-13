# Amorri Studio VNext 2.8.4.2 — Booking UX + Photo Footer + Delivery Cards

## Mục tiêu

- Bắt đầu Tạo lịch mới bằng popup **Chọn loại lịch**, bám sát `/studio`. Nút Cưới mở 5 lựa chọn Dạm Ngõ / Đám Nối / Vu Quy / Rước Dâu / Xuất Giá. Rước Dâu tự hiện hai nhà, không bắt buộc Admin tick thêm.
- Nhân sự: **lịch cưới** và các lịch legacy `Phóng sự` cung cấp dropdown nhiệm vụ đúng vai trò chụp / quay, mỗi vai trò 2 lựa chọn; ngoài cưới hiển thị phân công và chi phí, không cần nhập công việc tự do. Vị trí Nhà trai / Nhà gái chỉ xuất hiện khi `isRuocDau` đúng. Hồ sơ có nhiệm vụ cũ giữ nguyên khi chỉ mở form.
- Bàn giao ảnh: tách ảnh (khung tỉ lệ 4:5, fit contain) khỏi footer bằng 2 hàng grid, không để nút hoặc tên file đè lên nội dung ảnh. Tiếp tục giữ 4 ảnh / hàng trên desktop.
- Thẻ bàn giao clip/ảnh: thống nhất chiều cao khu vực trạng thái và hành động; nút Copy link sản phẩm, Góp ý timeline (chỉ clip), Hoàn thành nằm ở đáy thẻ. Loại bỏ thẻ `<small role="status" class="delivery-share-feedback">`, phản hồi ngắn dạng toast nổi tự biến mất.
- Giữ cơ chế Product CAS 2.8.4.1, Google Drive, Firebase và cổng nhân sự.

## Triển khai

1. Triển khai nhánh Preview (cấu hình Next.js, không thiết lập `outputDirectory` thủ công).
2. Chạy `npm ci` rồi `npm run build`, `npm test`, `npm run check:static` trong CI.
3. Vào `/api/health`, xác nhận `release=booking-ui-20261013-r1`.
4. Kiểm thử popup 6 loại lịch và 5 nhánh cưới; kiểm tra Rước Dâu bật hai nhà tự động; chọn vai trò quay/chụp. Tạo lịch thử với backend staging.
5. Mở link khách và kiểm tra bộ ảnh chân dung/ngang không bị `delivery-photo-footer` che; thử 4 ảnh/hàng desktop và 2 ảnh/hàng mobile.
6. Kiểm tra hai thẻ bàn giao clip/ảnh cùng hàng, Copy link, Góp ý timeline và Hoàn thành. Đối chiếu dữ liệu Firebase staging và ảnh đã chọn trước Production.

## Giới hạn

- Chưa chạy `next build` đầy đủ nếu môi trường không cài được Next.js/Firebase dependencies.
- Không chỉnh sửa, xóa hoặc di chuyển dữ liệu Firebase Production trong quá trình tạo bản vá.
- Thao tác sửa sản phẩm tiếp tục dùng cơ chế ETag/CAS của VNext 2.8.4.1.
