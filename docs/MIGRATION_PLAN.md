# Phương án chuyển dần sang TypeScript, không làm mất nghiệp vụ

**Giai đoạn 1 — có trong bản này:** React Next.js admin dashboard đọc theo tháng, backend role check, tạo lịch cơ bản, giữ `/studio` và Drive API/Review cũ. Dữ liệu RTDB giữ nguyên.

**Giai đoạn 2 — công việc tiếp theo:** Chuyển CRUD events, staff assignments, blackouts, payroll carry/advance/paid sang server actions/typed APIs có transactions & contract tests so với mã legacy. Dùng feature flag chọn giao diện mới cho từng phần. Chuyển staff UID auth trước khi mở rộng dữ liệu.

**Giai đoạn 3 — bàn giao/media:** Module React gallery (pagination, thumbnail sizes, lazy load), client review timeline typed API, signed share links + revoke, người dùng chỉ xem content được cấp quyền; hệ thống HLS 1080p adaptive ABR đi qua CDN, giữ file gốc trên Drive/storage, có poster/skeleton/quality options. Chạy thử 1 sự kiện trước rồi mở rộng.

**Giai đoạn 4 — hardening:** RBAC RTDB rules, Firebase emulator test, performance budgets, error monitoring, Playwright regression, backup/restore drill. Chuyển domain khi feature parity đã được QA ký duyệt.

Không được coi "đã có đường dẫn legacy" là "đã chuyển hoàn toàn sang TypeScript".
