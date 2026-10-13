# Amorri Studio VNext 3.0.3 — staff availability, thousands-VND inputs, automatic public Drive redirect

## Hướng dẫn triển khai Vercel

1. Sao lưu repository và Firebase RTDB trước khi triển khai. Thay mã nguồn bằng bản ZIP, commit và push lên nhánh triển khai Vercel.
2. Vào Vercel → Deployments. Kiểm tra build và chức năng `/api/health`. Trường `upgradeRelease` phải bằng `availability-money-302-auto-20261013-r1`. Trường `release` cũ được giữ để các công cụ giám sát tương thích.
3. Không cần sửa `GOOGLE_MAPS_API_KEY` nếu gợi ý địa điểm đã chạy tốt.
4. Kiểm tra tạo lịch, chỉnh lịch và khung phân công nhân sự: khi đổi ngày, giờ bắt đầu/kết thúc, danh sách tự lấy tình trạng bận từ `GET /api/scheduling/availability` (yêu cầu Firebase Admin JWT). Nhân sự đang bận hiển thị nhãn và checkbox bị khóa khi chưa được phân công; Admin có thể bật "Ẩn người đã bận". Nếu nhân sự đã được chọn và Admin đổi giờ sang khung xung đột, Admin có thể bỏ chọn hoặc sửa giờ. **Server vẫn kiểm tra lịch mới nhất và có thể trả HTTP 409** nếu người khác vừa tạo lịch sau khi trang tải.
5. Ô tiền trong React nhận **đơn vị nghìn đồng**: nhập `1000` hiển thị `1.000.000đ`; nhập `2000` hiển thị `2.000.000đ`; giá trị lưu Firebase là **VND nguyên**, không nhân thêm khi đọc lại. Các số tiền cũ không chia hết 1.000 được hiển thị nguyên trạng và không bị âm thầm làm tròn. Giao diện `/studio` cũ vốn có CSS hậu tố `.000 đ` và hệ số 1.000, không thay luồng này.

## HTTP 302 — nhận diện Drive ID tự động

**Chế độ mới (tùy chọn)**: trong Vercel → Project → Settings → Environment Variables → Production, đặt duy nhất:

```
AMORRI_VIDEO_REDIRECT_MODE=verified-public-auto
```

Không cần `AMORRI_VIDEO_REDIRECT_TEST_IDS`. Có thể xóa biến allowlist cũ. Lưu rồi Redeploy. Drive file ID được lấy từ yêu cầu play và xác minh thuộc gallery/sản phẩm khách trong Firebase/Drive; API xác thực deliveryToken và **kiểm tra GET Range 1 byte không đăng nhập** tới URL public do Google Drive trả về. Chỉ khi đạt cả các điều kiện thì POST cấp ticket `{transport:'redirect'}` và GET trả HTTP 302. Nếu file riêng tư, Google trả HTML, không có `webContentLink`, thiếu HTTP 206, metadata không khớp, timeout hoặc lỗi bất kỳ, API giữ nguyên streaming proxy và player có fallback.

**Chế độ thử nghiệm với ID thủ công (giữ tương thích):**

```
AMORRI_VIDEO_REDIRECT_MODE=verified-public
AMORRI_VIDEO_REDIRECT_TEST_IDS=ID_VIDEO_PUBLIC_1,ID_VIDEO_PUBLIC_2
```

**Tắt 302**: xóa `AMORRI_VIDEO_REDIRECT_MODE` hoặc đặt giá trị khác rồi Redeploy. Không dùng `*`, không tự ý đổi file khách hàng sang public chỉ để lấy 302. Các video riêng tư không thể phát trực tiếp qua anonymous 302 nếu không có URL public an toàn. Google Drive cũng không cam kết cung cấp một URL media công khai hỗ trợ Range; 302 không bảo đảm video 1080p mượt.

## Kiểm thử thực tế

- Test nhân sự A có lịch 08:00–12:00: đặt lịch khác 10:00–11:00 sẽ hiện "Đã có lịch"; 12:00–14:00 không đánh dấu trùng; ngày nghỉ hiện "Đã báo nghỉ"; sửa lịch không trùng chính bản ghi đang chỉnh.
- Test nhập 1000, 2000, xóa tiền, dán `2.000.000đ`, F5 và sửa lịch: số tiền VND lưu không tăng thêm 1.000 lần.
- F12 → Network phát một video test công khai đủ điều kiện: POST `/api/drive-video` trả `transport:redirect`, GET `/api/drive-video` trả `302` và Google trả media 206. Thử video riêng tư, hệ thống phải fallback `transport:proxy`. Không gửi video khách hàng công khai để test.

## Giới hạn chưa xác minh

Chưa chạy được `npm ci`/build production trong môi trường tạo gói vì kết nối registry npm lỗi `EAI_AGAIN`; đã kiểm tra cú pháp TypeScript/TSX và chạy Node tests. Kiểm tra Vercel build logs sau deploy và thử trình duyệt/Firebase thật. Các tests legacy bị lỗi sẵn trong bản ZIP trước chưa được xử lý trong bản này.
