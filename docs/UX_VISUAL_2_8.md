# UX & Thumbnail — VNext 2.8

## UI/UX
- Sidebar tối hơn, typography và spacing có nhịp, thông tin rõ hơn ở header và các card.
- Thẻ bàn giao 2 cột desktop với thumbnail tỷ lệ 16:9. Mỗi card có ngày, dịch vụ, tên dự án, tình trạng ảnh/video; sản phẩm bên trong có preview riêng.
- Mobile: 1 cột, thumbnail giữ đúng tỷ lệ, label dễ đọc; khung ảnh không bị co giãn trong lúc tải.
- Placeholder với thông báo rõ khi Drive không cấp thumbnail. `prefers-reduced-motion` được tôn trọng; animation hạn chế biến đổi layout.

## Chọn thumbnail
1. API `admin-media` đọc MIME và `imageMediaMetadata`/`videoMediaMetadata` do Drive cung cấp.
2. Với thư mục video hoặc ảnh lẫn clip: chọn clip đầu tiên có MIME video.
3. Với thư mục ảnh: chọn ảnh đầu tiên có chiều ngang lớn hơn chiều dọc từ metadata; nếu không biết kích thước, dùng ảnh đầu tiên.
4. API không công khai Drive file ID như quyền truy cập: `/thumbnail` yêu cầu Bearer Firebase Admin ID token, kiểm tra event/product và membership thư mục.
5. Truy xuất `thumbnailLink` của file tại Google Drive, xác minh hostname do Google cung cấp, MIME `image/*` cho các định dạng hỗ trợ và tối đa 2 MB. Không chuyển video gốc qua endpoint.
6. React chỉ fetch thumbnail khi card xuất hiện trên viewport, có thể thử làm mới token nếu 401, tạo Blob URL cục bộ và thu hồi khi rời màn hình.

## Kiểm thử trên Vercel Preview
- [ ] JPG landscape và portrait trong cùng folder: chọn landscape
- [ ] Clip MP4 Drive có thumbnail: thumbnail thực, không phải icon
- [ ] Clip chưa được Drive xử lý: placeholder, không crash
- [ ] Sản phẩm không có quyền Drive: vẫn render các card và đưa ra cảnh báo trong panel
- [ ] Folder nhiều file/shortcut: không làm ngừng Dashboard
- [ ] Admin 401/403: thumbnail API không trả nội dung
- [ ] Thử cuộn qua 10 card: trình duyệt không treo, không gọi quá nhiều API cùng lúc
- [ ] Điện thoại iOS/Android: 1 cột, nút copy/review dễ bấm, lưới ảnh khách 2 cột
- [ ] Giữ nguyên lịch, lương, nhân sự, chọn ảnh, timeline comment và link cũ

## Ghi chú vận hành
Không thay đổi Security Rules hay dữ liệu Firebase production. Nếu thấy thumbnail trống, kiểm tra Network request `/api/delivery/<eventId>/thumbnail` và Vercel Function Logs; không sửa bằng cách công khai toàn bộ thư mục Google Drive.
