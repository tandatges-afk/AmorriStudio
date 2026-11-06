# Amorri R10.4 — tích hợp Google Places và Desktop Windows/macOS với VPS

## Hiện trạng

- Website: https://amorri.io.vn/ (Next.js local auth, PostgreSQL). Nguồn dữ liệu đã nhập: 470 document, 54 lịch, ba tài khoản (một đã có password).
- Media: https://media.amorri.io.vn/ chỉ dùng S3 mới. Không tự sao chép clip R2 cũ. `403` cho request chưa ký là bình thường.
- Google Drive: service account web đã truy cập được một số file, **chưa xác nhận đủ album**. Ứng dụng Desktop dùng OAuth từng thợ riêng để upload Drive; không dùng Firebase Admin JSON làm OAuth Desktop.

## 1. Google Maps/Places autocomplete

Tính năng này là API `GET /api/places?input=...`, chỉ Admin đã xác thực mới dùng được. Dán URL hoặc địa chỉ vào bản đồ vẫn hoạt động không cần key.

1. Tại [Google Cloud](https://console.cloud.google.com/apis/library/places.googleapis.com), bật **Places API (New)** trong đúng dự án, liên kết Billing, đặt quota và cảnh báo chi phí.
2. Tạo **API key của dịch vụ server**, restrict **API: Places API (New)**, application **IP addresses: 180.93.43.162** (vì VPS gọi Google trực tiếp). Không đặt HTTP referrer cho key server.
3. Copy script `vps/scripts/set-google-places-vps.sh` tới VPS bằng `scp`, chạy `ssh -t root@180.93.43.162 'bash /root/set-google-places-vps.sh'` và nhập key khi Terminal hỏi. Script sẽ backup `prod.env`, cập nhật key server-only, restart `amorri-web` và rollback khi health thất bại.
4. Đăng nhập `minhthien` trên web, nhập >=3 ký tự vào địa điểm. Kiểm tra Developer Tools > Network > `/api/places` -> `items` và mã `code` nếu lỗi. **Không gửi API key lên chat**.

## 2. Windows EXE và macOS DMG

Bản Electron kết nối **https://amorri.io.vn/** và mở tính năng web của VPS; nó không chuyển các thư mục RAW trực tiếp lên PostgreSQL. App Desktop kết nối Drive bằng OAuth của tài khoản Google người sử dụng.

1. Trong Google Cloud → APIs & Services → Credentials tạo **OAuth client ID** loại **Desktop app**, bật Google Drive API, cấu hình OAuth consent screen, thêm test users nếu app ở chế độ Testing. Tải OAuth Client JSON từ Google; dùng `client_id` và `client_secret` của Desktop OAuth, **không dùng Firebase Admin JSON**.
2. Repository GitHub → Settings → Secrets and variables → Actions → **New repository secret** tên `AMORRI_DESKTOP_CONFIG_JSON`. Value là JSON dạng:

   ```json
   {
     "webUrl": "https://amorri.io.vn/",
     "googleOAuthClientId": "<Desktop OAuth client ID>",
     "googleOAuthClientSecret": "<Desktop OAuth client secret>",
     "driveReaderEmail": "firebase-adminsdk-fbsvc@ammori-c4905.iam.gserviceaccount.com"
   }
   ```

   Không commit file `desktop/desktop.config.json` thật (đã được `.gitignore` bỏ qua). **OAuth secret đóng gói trong app desktop không phải secret bảo vệ server**. Chỉ dùng Desktop OAuth public client và PKCE, tuyệt đối không đưa API key server hoặc service-account private key vào app.
3. GitHub → Actions → chọn **Amorri Desktop - Build Windows x64 EXE (VPS)** → Run workflow (nhánh main). Sau khi xong tải artifact `Amorri-Studio-Windows-x64-EXE-VPS`.
4. GitHub → Actions → **Amorri Desktop - Build macOS ARM64 and Intel DMG (VPS)** → Run workflow; tải artifact `Amorri-Studio-macOS-DMG-VPS`. Bộ artifact gồm DMG ARM64 cho Apple Silicon và DMG x64 cho Mac Intel. Bộ cài chưa có Developer ID/Apple notarization nên Gatekeeper có thể cảnh báo.
5. Cài thử trên một máy Windows và một máy Mac; đăng nhập `minhthien`, vào Drive → OAuth thợ → chọn ảnh, nhập thông tin sản phẩm, tải JPG; xác nhận cùng dữ liệu trên web VPS sau F5. **Chưa thể khẳng định app hoạt động ngoài thực tế cho đến khi thử trên máy thật.**

## 3. Tài khoản nhân viên

Trên VPS chạy `bash /root/activate-remaining-accounts.sh` (chuyển script từ `vps/scripts/`), chọn UID nhân viên có sẵn và username mới. Nhập mật khẩu từ 6 ký tự và kiểm tra quyền. **Không tạo UID mới, không cấp nhầm role admin**.

## 4. Trước khi xóa hệ thống cũ

- Đối chiếu 54 lịch, lương, blackout, album bàn giao, chọn ảnh, bình luận, phân quyền nhân viên bằng dữ liệu thực.
- Kiểm tra ghi mới trên VPS (create/edit/F5) không ghi Firebase.
- Test signed S3 upload, video 1080p download + HTTP Range, mobile Safari/Chrome.
- Thiết lập backup PostgreSQL và media S3 ra ngoài VPS, thử phục hồi; 50 GB dung lượng không đủ làm kho video dài hạn nếu không có cleanup.
- Giữ Vercel/Firebase cũ ở chế độ không ghi và R2 chưa xóa. Link mã hóa từ khóa Vercel cũ có thể phải cấp lại.
