# Amorri Studio VNext 2.8.4.4 — Product Delivery & Video Review

## Giao diện quản trị

- Mỗi sản phẩm thuộc một lịch được hiển thị bằng **một thẻ riêng**; các thẻ của cùng lịch nằm trong cùng một nhóm liên tiếp.
- Thumbnail, loại media, số ảnh đã chọn, tên clip và góp ý timeline được lấy theo **từng sản phẩm**, không gộp nhiều sản phẩm vào một thẻ.
- Copy link sản phẩm tạo hoặc dùng lại token **riêng cho sản phẩm đó**. Link sản phẩm ảnh không mở được clip của cùng lịch trong API mới.
- Hoàn thành ẩn đúng sản phẩm trong danh sách bàn giao. Muốn hiện lại: vào Quản lý lịch → Chỉnh sửa → Sản phẩm bàn giao → **Hiện lại**.
- Trong Quản lý lịch: loại media tự phân biệt theo MIME Google Drive; ẩn dropdown thủ công. Có **Xóa link** với xác nhận. Xóa bản ghi sản phẩm ra khỏi lịch nhưng không xóa file Google Drive, các ảnh đã chọn hoặc bình luận lịch sử trong Firebase.

## Bàn giao video cho khách

- Ẩn “Mở file gốc trên Drive” và thông báo “Nguồn Drive gốc”.
- Mốc góp ý hiển thị `00:00` đến `59:59`; khi từ 1 giờ trở lên dùng `01:00:00`. Nhập tay theo cùng định dạng; backend tiếp tục lưu **số giây** để bảo toàn tương thích.
- Tên người góp ý lưu trong **localStorage trình duyệt hiện tại**. Nhấn F5 vẫn giữ tên; dữ liệu không đồng bộ giữa các thiết bị và có thể biến mất khi xóa dữ liệu trình duyệt.
- Tài khoản Admin vẫn đăng nhập bằng Firebase; người nhận link chỉ sử dụng token bàn giao.

## Cấu hình và bảo mật

- Không thêm biến môi trường mới. Giữ nguyên Firebase Admin, Drive credentials, `DRIVE_VIDEO_SIGNING_SECRET` hoặc `AMORRI_DELIVERY_LINK_KEY` đã dùng để copy lại token.
- Tạo các link **mới** từ từng thẻ sản phẩm. Link cũ cấp theo cả lịch vẫn được giữ hoạt động để tránh gián đoạn khách hàng.
- Các API mới xác minh `productId` trong link trước khi xem ảnh, chọn ảnh, gửi bình luận và xin ticket phát video. API legacy vẫn cần di trú và siết quy tắc trên môi trường staging trước khi thay đổi Security Rules Production.
- Không xóa nguyên tệp Google Drive và không tự xóa dữ liệu chọn ảnh hoặc góp ý lịch sử khi xóa sản phẩm. Tránh tái sử dụng ID sản phẩm đã xóa cho sản phẩm khác.

## Kiểm thử trên Vercel Preview / Firebase staging

1. Đảm bảo `/api/health` có release `product-delivery-20261013-r1`.
2. Tạo một lịch có một sản phẩm ảnh và một clip. Vào Bàn giao sản phẩm; xác nhận hai thẻ nằm cạnh nhau trong cùng nhóm lịch.
3. Copy mỗi link, thử mở. Link ảnh chỉ trả một sản phẩm ảnh, link clip chỉ trả clip. Thử gọi API media/selection/review sản phẩm còn lại: phải trả `DELIVERY_PRODUCT_DENIED` (403).
4. Chọn ảnh trên link ảnh; tại thẻ ảnh Admin phải xem được số lượng và copy tên. Với clip chỉ có tên video và góp ý timeline.
5. Thử gửi bình luận 00:43 và 01:00:01; F5 vẫn giữ tên. Thử thao tác seek và bình luận sau khi đổi video.
6. Đánh dấu Hoàn thành một thẻ; thẻ kia vẫn hiển thị. F5 và vào Quản lý lịch để lấy link hoặc chọn Hiện lại.
7. Xóa một sản phẩm có xác nhận; chỉ sản phẩm đó biến mất. Kiểm tra ảnh khách chọn và bình luận lịch sử vẫn còn trong Firebase staging.
8. Kiểm tra giao diện desktop 4 cột khi đủ rộng, tablet 2–3 cột, mobile 1 cột. Xác minh card và panel góp ý không chèn lên nhau.
9. Chạy `npm install`, `npm run typecheck`, `npm test`, `npm run build` trên môi trường có npm registry trước Production.

### Những gì chưa được xác minh tại môi trường phát triển

Chưa chạy được `next build` đầy đủ hoặc thử với Google Drive/Firebase Production. Đã chạy Node tests, TypeScript parser cho TS/TSX, typecheck các module nghiệp vụ độc lập và kiểm tra cấu trúc.
