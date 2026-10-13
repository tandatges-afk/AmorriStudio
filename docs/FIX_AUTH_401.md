# Amorri Studio VNext 2.0 — Fix xác thực Firebase Admin (401)

## Nguyên nhân

Ở Beta 2, `/api/dashboard` gộp cả lỗi token và lỗi khởi tạo Firebase Admin thành HTTP 401. Đặc biệt, backend dùng `DRIVE_SERVICE_ACCOUNT_JSON` để xác minh Firebase ID token. Nếu service account dành cho Google Drive có `project_id` khác Firebase project của web, xác minh token có thể thất bại dù UID quản trị đúng.

Bản hotfix này:

- Ưu tiên **`FIREBASE_SERVICE_ACCOUNT_JSON`** cho Firebase Admin; chỉ dự phòng bằng `DRIVE_SERVICE_ACCOUNT_JSON` nếu chưa thiết lập biến riêng.
- Kiểm tra `project_id` trong service account với `FIREBASE_PROJECT_ID` và `NEXT_PUBLIC_FIREBASE_PROJECT_ID`.
- Trả mã HTTP **401** nếu token không hợp lệ / hết hạn; **403** nếu token hợp lệ nhưng UID không được phép; **503** nếu cấu hình Firebase Admin sai hoặc không thể kết nối xác minh.
- Frontend tự lấy ID token mới và thử lại **một lần** khi gặp HTTP 401; lỗi trả về hiển thị mã `AUTH_*` dễ chẩn đoán.
- Không thay đổi dữ liệu Firebase hoặc schema `studioPlanner_v1`.

## Kiểm tra biến Vercel

| Tên | Ví dụ / yêu cầu | Visibility |
| --- | --- | --- |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `ammori-c4905` (đúng Firebase client) | Config |
| `FIREBASE_PROJECT_ID` | `ammori-c4905` (trùng frontend) | Config |
| `FIREBASE_DATABASE_URL` | Địa chỉ Realtime Database hiện có, chính xác | Server-only; Config |
| `AMORRI_ADMIN_UIDS` | UID được *copy* từ Authentication > Users; nhiều UID cách nhau dấu phẩy | Server-only; Config |
| `FIREBASE_SERVICE_ACCOUNT_JSON` | **Toàn bộ** JSON private key của service account được tạo từ **đúng** dự án Firebase | **Secret** |
| `DRIVE_SERVICE_ACCOUNT_JSON` | Credential Google Drive đang dùng (giữ nguyên để API video hoạt động) | **Secret** |

**Cách lấy `FIREBASE_SERVICE_ACCOUNT_JSON`:** Firebase Console → chọn project `ammori-c4905` → Project settings (biểu tượng bánh răng) → **Service accounts** → **Firebase Admin SDK** → **Generate new private key**. Mở file JSON nhận được ở máy, sao chép **toàn bộ nội dung** vào Value của biến trên Vercel. Không đặt ở `NEXT_PUBLIC_*`, không thêm vào GitHub, không gửi JSON hay private key qua chat, ảnh hoặc email.

Nếu `DRIVE_SERVICE_ACCOUNT_JSON` đã thuộc đúng `ammori-c4905` và được cấp quyền Firebase Auth, bạn *có thể* dùng chung, nhưng một credential Firebase riêng sẽ dễ kiểm soát hơn.

**Sau khi lưu**: Vercel → Deployments → Redeploy Production. Sau đó đăng xuất website và đăng nhập lại.

## Đọc lỗi mới

Mở trình duyệt → F12 → Network → request `api/dashboard` → Response (không chia sẻ header `Authorization` hay ID token):

- `401 AUTH_TOKEN_MISSING`, `AUTH_TOKEN_INVALID`, `AUTH_TOKEN_EXPIRED`, `AUTH_TOKEN_REVOKED`: kiểm tra phiên, đăng nhập lại và dự án Firebase frontend.
- `403`: UID đăng nhập thực tế không nằm trong `AMORRI_ADMIN_UIDS`, hoặc tài khoản thiếu custom claim `admin: true`. Kiểm tra UID của **đúng tài khoản đang đăng nhập**.
- `503 AUTH_CONFIG_MISSING`: biến credential server hoặc database URL chưa có ở deployment hiện tại.
- `503 AUTH_CONFIG_INVALID`: JSON service account sai định dạng, thiếu trường hoặc private key không hợp lệ.
- `503 AUTH_PROJECT_MISMATCH`: `project_id` credential khác Firebase Project ID frontend/backend.
- `503 AUTH_SERVICE_UNAVAILABLE`: xem **Vercel → Logs → /api/dashboard**; kiểm tra kết nối, quyền Firebase Admin SDK, Google APIs.

Nếu chỉ có lỗi sau **GET /api/dashboard**, đừng thay đổi UID một cách ngẫu nhiên. `401` khác `403`.

## Giới hạn kiểm chứng

Code đã được kiểm thử cấu trúc và bộ test Node. Môi trường đóng gói không có Firebase production credential và không có `node_modules` để chạy Next build, Vitest/Playwright hoặc xác minh phiên đăng nhập thực; hãy deploy **Preview** và kiểm tra trên Vercel trước Production nếu có thể.
