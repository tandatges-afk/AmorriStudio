# Kiểm tra production 401 — Amorri Studio VNext 2.0

## Chẩn đoán chắc chắn từ mã nguồn

Beta 2 trả HTTP 401 và chỉ có `{"error":"Không thể xác thực. Kiểm tra phiên đăng nhập/cấu hình Firebase."}`.
Bản Auth Fix trả `code:"AUTH_*"` với HTTP 401 (token) hoặc 503 (server), và 403 cho UID không có quyền.
Vì vậy, **chính xác chuỗi JSON cũ** là bằng chứng request vẫn đi vào API Beta 2, không chứng minh UID sai.

## Triển khai bản này

1. Giải nén ZIP và đưa **nội dung** thư mục `Amorri_Studio_VNext_2_0_Auth_Verified/` vào root của repository có `package.json` (không lồng sai Root Directory). Commit/push toàn bộ thay đổi lên branch production của Vercel.
2. Vercel > Project > Settings > Build and Deployment: Framework = `Next.js`, Root Directory trỏ đúng thư mục có `package.json`. Không override Output Directory thành `public`.
3. Environment Variables áp dụng cho **Production**: `FIREBASE_SERVICE_ACCOUNT_JSON`, `FIREBASE_PROJECT_ID`, `FIREBASE_DATABASE_URL`, `AMORRI_ADMIN_UIDS` và `NEXT_PUBLIC_FIREBASE_*`. Biến server không thêm tiền tố `NEXT_PUBLIC_`.
4. Vercel > Deployments: chọn deployment **Production mới nhất** sau commit và đợi **Ready**. Dùng menu `...` > Visit để mở **chính URL deployment đó**, không dùng URL Preview cũ.
5. Mở `https://<deployment-host>/api/health`. Phản hồi bắt buộc phải có `"release":"auth-verified-20261012-r1"`. Nếu thiếu, bạn đang mở deployment cũ hoặc Root Directory/branch sai.
6. Đăng nhập website và kiểm tra F12 > Network > `/api/dashboard?...` > Response (chỉ gửi status/JSON; KHÔNG gửi `Authorization` header, ID token, private key hay service account).
   * `401 AUTH_TOKEN_MISSING` — không có Bearer token: kiểm tra đăng nhập frontend.
   * `401 AUTH_TOKEN_INVALID` / `AUTH_TOKEN_EXPIRED` — sai hoặc hết hạn token.
   * `403` — UID không trong allowlist hoặc chưa có custom claim admin.
   * `503 AUTH_CONFIG_INVALID` / `AUTH_PROJECT_MISMATCH` / `AUTH_CONFIG_MISSING` — lỗi server credentials.
   * `503 AUTH_SERVICE_UNAVAILABLE` — xem Vercel Function logs tại `/api/dashboard`.

**Lưu ý:** Vercel `Redeploy` của deployment cũ có thể build lại chính source/commit cũ. Muốn áp dụng Auth Fix phải push mã nguồn mới trước và redeploy bản mới. Không thay đổi UID hoặc tạo thêm private key khi chưa biết status/mã `AUTH_*`.
