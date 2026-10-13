# Amorri Studio VNext 2.9.0.3 — Chuyển từ Vercel sang Firebase App Hosting

## 0. Phạm vi và cảnh báo chi phí

- Chuyển **hosting website Next.js + `/api/*`** sang Firebase App Hosting. Không chuyển/xóa Firebase Realtime Database, Firebase Authentication, Google Drive hoặc dữ liệu khách.
- **Firebase App Hosting đòi hỏi Firebase Blaze (liên kết phương thức thanh toán)**. Có hạn mức no-cost nhưng **không phải hosting miễn phí không giới hạn**. Vì website proxy video 1080p qua `/api/drive-video`, outbound traffic lớn có thể phát sinh chi phí. Thiết lập cảnh báo ngân sách/spend caps phù hợp và theo dõi Cloud Run, Cloud CDN, App Hosting. Không tự coi budget alert là giới hạn cứng.
- Vercel `DEPLOYMENT_PAUSED` có thể do billing/spend/quotas/trạng thái account; không khẳng định nguyên nhân do code. Việc chuyển host không tự động xóa nợ hoặc giải quyết bất kỳ vấn đề tài khoản Vercel nào.
- Đây là **source đã chuẩn bị để triển khai**, chưa triển khai Firebase, chưa kiểm thử API với dữ liệu thật.

## 1. Mô hình sau chuyển đổi

```text
Khách / Admin
  -> Firebase App Hosting: Next.js SSR + React, /studio, /api/..., /api/drive-video
      -> Firebase Authentication (project cũ: ammori-c4905)
      -> Firebase Realtime Database (project và database cũ)
      -> Google Drive API (service account hiện tại, không chuyển toàn bộ media)
      -> Google Cloud Secret Manager (đọc khóa server)
```

App Hosting tích hợp GitHub và vận hành Next.js bằng Cloud Run (không dùng Firebase Hosting thuần static). Giữ nguyên toàn bộ URL **path** trong code. Địa chỉ domain/host sẽ thay đổi, trừ khi bạn chuyển custom domain của mình.

## 2. Yêu cầu trước khi deploy — tạo package-lock.json

Bản ZIP chưa có lockfile vì môi trường đóng gói bị chặn truy cập npm registry. Firebase App Hosting **sẽ từ chối build khi không có lockfile**; không nên tạo file giả.

Trên máy Windows có internet, mở PowerShell tại thư mục vừa giải nén:

```powershell
node -v
npm -v
npm install --package-lock-only --no-audit --no-fund
npm ci
npm run typecheck
npm test
npm run build
```

- Dùng **Node.js 22.16.0 hoặc tương thích >=22.16.0**.
- Khi tất cả đạt, `git add package.json package-lock.json` rồi commit và push. **Phải commit `package-lock.json` lên GitHub**.
- Nếu `npm run build` báo TypeScript error, sửa đúng lỗi trước, không bỏ type-check để ép deploy.
- Mặc định GitHub Actions trong repository sẽ chạy `npm install`, `typecheck`, `test`, `build`; Firebase App Hosting dùng adapter Next.js và cũng chạy `npm run build`.

## 3. Tạo backend Firebase App Hosting

1. Vào https://console.firebase.google.com/project/ammori-c4905/overview .
2. Nếu dự án còn ở Spark, chủ động cân nhắc trước khi **nâng cấp Blaze** vì có thể phát sinh phí; thiết lập giám sát ngân sách.
3. Vào **Hosting & Serverless > App Hosting > Get started/Create backend**.
4. Chọn GitHub repository Amorri Studio, branch triển khai (nên tạo branch `apphosting-preview` để chạy thử), root directory `/` — thư mục chứa `package.json` và `apphosting.yaml`.
5. Chọn region **`asia-southeast1` (Singapore)** nếu mục tiêu là khách Việt Nam. Firebase RTDB hiện ở `europe-west1`, nên latency API giữa hai vùng cần kiểm chứng; đừng thay RTDB location đột ngột.
6. Chọn Node.js **22**, tạo backend. Nếu Firebase hỏi tự động rollout ngay, nên hoãn lần đầu đến khi đã tạo đủ secrets và biến môi trường.
7. Ghi lại `BACKEND_ID` và hostname `*.hosted.app` Firebase cấp.

**Không xóa dự án Firebase cũ, không bật `AMORRI_LEGACY_ADMIN_WRITES=read-only` hay `AMORRI_LEGACY_DELIVERY_ACCESS=strict` chỉ vì đổi hosting.**

## 4. Chuyển biến môi trường (Environment)

Vào Firebase Console > **App Hosting > Backend > Settings > Environment**. Thiết lập **chính xác** các giá trị đang chạy trên Vercel (lấy từ Vercel Settings nếu có thể):

| Variable | Nguồn | Ý nghĩa |
|---|---|---|
| `NEXT_PUBLIC_FIREBASE_API_KEY` | Firebase Web App hiện tại | Public, dùng ở browser |
| `NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN` | Firebase Web App hiện tại | Public |
| `NEXT_PUBLIC_FIREBASE_DATABASE_URL` | RTDB cũ | Public |
| `NEXT_PUBLIC_FIREBASE_PROJECT_ID` | `ammori-c4905` | Public |
| `NEXT_PUBLIC_FIREBASE_APP_ID` | Firebase Web App hiện tại | Public |
| `AMORRI_ADMIN_UIDS` | Giá trị Vercel hiện tại | Danh sách admin Firebase Auth UID |
| `AMORRI_LEGACY_ADMIN_WRITES` | `compat` trong giai đoạn chuyển | Giữ các nghiệp vụ `/studio` cũ |
| `AMORRI_LEGACY_DELIVERY_ACCESS` | `compat` trong giai đoạn chuyển | Giữ link/luồng cũ |
| `DRIVE_VIDEO_CHUNK_BYTES` | Mặc định `16777216` nếu muốn | Tối ưu đọc Drive |
| `DRIVE_VIDEO_TICKET_TTL_SECONDS` | Mặc định `21600` nếu muốn | Thời gian sống video ticket |
| `GOOGLE_DRIVE_API_KEY` | Chỉ khi API legacy cần | Không đưa trong mã nguồn |

`FIREBASE_PROJECT_ID` và `FIREBASE_DATABASE_URL` đã được khai báo trong `apphosting.yaml` với giá trị project RTDB hiện có. Nếu bạn thay đổi Firebase project, phải rà lại toàn bộ môi trường và credentials.

**Không đặt Firebase Admin private key hoặc Drive service account vào `NEXT_PUBLIC_*`, vào `apphosting.yaml` với `value:`, commit GitHub, hay gửi qua chat.**

## 5. Cloud Secret Manager — bắt buộc trước rollout

File `apphosting.yaml` đã khai báo **3 secrets bắt buộc**:

| App env | Cloud Secret Manager secret ID | Giá trị phải dùng |
|---|---|---|
| `FIREBASE_SERVICE_ACCOUNT_JSON` | `amorriFirebaseAdminJson` | JSON Admin service account thuộc **ammori-c4905** |
| `DRIVE_SERVICE_ACCOUNT_JSON` | `amorriDriveServiceAccountJson` | JSON Drive service account có quyền đọc các folder/file của khách |
| `DRIVE_VIDEO_SIGNING_SECRET` | `amorriDriveVideoSigningSecret` | **Đúng chính xác secret cũ trên Vercel** để các ticket và link liên quan không đứt |

Trên máy của Admin với Firebase CLI đã đăng nhập:

```powershell
npm install -g firebase-tools
firebase login
firebase apphosting:secrets:set amorriFirebaseAdminJson --project ammori-c4905
firebase apphosting:secrets:set amorriDriveServiceAccountJson --project ammori-c4905
firebase apphosting:secrets:set amorriDriveVideoSigningSecret --project ammori-c4905
```

CLI cho nhập giá trị hoặc chọn file local qua `--data-file`. Với JSON private key, ưu tiên file `.json` **ngoài thư mục dự án/GitHub** rồi dùng `--data-file` để tránh lỗi dấu xuống dòng và lộ console history. Đừng để temporary file chứa khóa trong Git.

Sau khi backend tạo xong, cấp quyền truy cập secrets cho backend bằng hướng dẫn CLI, hoặc:

```powershell
firebase apphosting:secrets:grantaccess amorriFirebaseAdminJson,amorriDriveServiceAccountJson,amorriDriveVideoSigningSecret --backend YOUR_BACKEND_ID --project ammori-c4905 --location asia-southeast1
```

Nếu secret được thêm sau, đợi **rollout mới** để Cloud Run nạp nó; secret không xuất hiện lập tức trên revision cũ.

**Bản lưu dự phòng lịch:** Nếu Vercel có `AMORRI_ARCHIVE_ENCRYPTION_KEY` 64 ký tự hex thì chuyển nguyên giá trị cũ vào Secret Manager, tạo secret `amorriArchiveEncryptionKey`, và **bỏ dấu `#`** ở 4 dòng env tương ứng trong `apphosting.yaml` rồi grant access. Nếu trước đây dùng fallback từ `DRIVE_VIDEO_SIGNING_SECRET`, không được đổi signing secret; nếu muốn chuyển sang key mới, phải có kế hoạch đọc/di trú các bản lưu cũ.

**Link staff/delivery:** Nếu trên Vercel bạn có đặt thêm `AMORRI_STAFF_LINK_KEY` hay `AMORRI_DELIVERY_LINK_KEY` thì cũng phải sao chép **đúng giá trị cũ** sang secrets và khai báo biến trong App Hosting. Nếu không có, code dùng fallback `DRIVE_VIDEO_SIGNING_SECRET`; không cần tạo mới tùy tiện.

## 6. Firebase Authentication — Authorized Domains

Trong Firebase Console > Authentication > Settings > Authorized domains, thêm hostname App Hosting do Firebase cấp (và domain riêng nếu có). Xác nhận frontend Auth config và RTDB project vẫn là `ammori-c4905`. Khi thay host, phiên đăng nhập của người dùng thường phải đăng nhập lại vì storage/cookie được phân tách theo origin.

## 7. Test API trên hostname mới

1. Mở `https://YOUR_HOSTED_DOMAIN/api/health`. Phải trả:
   - `ok: true`
   - `release: "firebase-apphosting-20261013-r1"`
2. Vào website, đăng nhập Admin Firebase; thử lịch tháng, chọn lịch, sửa lịch, lưu rồi F5.
3. Tạo **link bàn giao sản phẩm mới** từ site App Hosting. Server dùng origin của request để tạo URL mới.
4. Thử khách chọn ảnh, F5, copy tên ảnh, mở bình luận video, gửi/đánh dấu góp ý.
5. Thử video trong DevTools Network: response `/api/drive-video` phải xử lý **`Range` và `206 Partial Content`** (khi trình duyệt có Range request). Đánh giá playback thực tế 1080p trên mạng khách.
6. Mở `/studio` để kiểm tra các nghiệp vụ legacy, không xóa luồng này.
7. Kiểm tra Firebase Console > App Hosting > Logs hoặc Google Cloud Logging khi có mã lỗi `X-Amorri-Request-Id`.

Không dùng một tài khoản quản trị Production để kiểm thử xóa lịch có dữ liệu thật. Dùng bản ghi giả/staging và xác nhận backup mã hóa được đọc lại trước khi thử xóa.

## 8. Đổi domain, link khách và rollback

- Website trên `*.vercel.app` đang bị tạm dừng **không tự động hoạt động lại** khi bạn chuyển sang App Hosting.
- **Đường dẫn path và token cũ** vẫn được code hỗ trợ, nhưng URL đầy đủ có tên miền Vercel sẽ trỏ về deployment cũ. Nếu không dùng custom domain riêng, hãy **gửi lại link với hostname App Hosting** cho khách. Token có thể tồn tại trong Firebase, không vì thế tự đổi hostname trong tin nhắn cũ.
- Nếu có domain riêng, chỉ chuyển DNS sau khi đã test đầy đủ trên hostname `*.hosted.app`, kiểm tra HTTPS và ghi nhận thời gian propagation.
- Giữ nhánh/bản ZIP cũ để rollback code. Không rollback Firebase Realtime Database bằng cách overwrite toàn bộ dữ liệu đang phát sinh trên site mới.

## 9. Chi phí và hiệu năng 1080p

- App Hosting là Cloud Run + CDN; chạy proxy Google Drive video có thể làm tăng outgoing bandwidth đáng kể. `apphosting.yaml` đặt `minInstances: 0`, `maxInstances: 3`, `concurrency: 25` để giới hạn mức mở rộng giai đoạn đầu. Đây **không phải giới hạn chi phí cứng** và có thể ảnh hưởng throughput khi lượng người xem đông.
- Khoảng cách region App Hosting (`asia-southeast1`) tới RTDB (`europe-west1`) có thể tăng latency phần quản lý, cần đo thực tế.
- Không chuyển video sang Cloudflare HLS, giữ nguyên nguồn Google Drive và route Range. Nếu 1080p vẫn chậm, phải đo tốc độ Drive upstream và Cloud Run logs, tránh hứa có thể ép chất lượng từ dữ liệu gốc.

## 10. Tài liệu gốc

- Firebase App Hosting: https://firebase.google.com/docs/app-hosting
- Cấu hình YAML/secrets: https://firebase.google.com/docs/app-hosting/configure
- Quota và pricing: https://firebase.google.com/docs/app-hosting/costs
- App Hosting locations: https://firebase.google.com/docs/app-hosting/about-app-hosting
- Vercel paused: https://vercel.com/docs/errors/deployment_paused
