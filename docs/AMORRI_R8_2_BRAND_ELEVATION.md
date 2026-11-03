# Amorri Studio R8.2 — Brand Elevation (03/11/2026)

## Phạm vi thay đổi

- Thay chữ A ở khu vực tài khoản sidebar và topbar bằng logo vàng Amorri thật (`/brand/amorri-mark.png`).
- Thêm lớp giao diện `app/amorri-brand-elevation.css` để logo rõ nét và tách khỏi nền Plum: khung vàng Champagne, chiều sâu, halo, shimmer chỉ khi hover, hiệu ứng trang trí nhẹ cho logo hero.
- Hai cửa sổ Electron Upload JPG và Chọn Drive trước đây hiện biểu tượng ảnh lỗi vì CSP không cho tải ảnh; nay khai báo `img-src 'self' data:` để cho phép logo **nội bộ**, vẫn khóa script và network không tin cậy.
- Hai cửa sổ phụ Electron được gắn icon Windows `.ico` (path khác nhau giữa dev và bản đóng gói), không còn dựa vào icon Electron mặc định.
- Các hiệu ứng hỗ trợ `prefers-reduced-motion` và không thêm WebGL hay thư viện animation nặng.

## Không đổi

- Logic upload queue trong Electron main process; album tiếp theo được thêm từ luồng chọn thư mục thường dùng.
- Không thêm lại nút `+ Thêm album tiếp theo`.
- Không thay đổi OAuth, Firebase, R2, RAW matching, lương, lịch, hay nguồn dữ liệu khách hàng.

## Kiểm thử

- `node --test tests/amorri-brand-elevation-r82.test.mjs`
- `node --test desktop/tests/r82-brand-elevation.test.mjs desktop/tests/r8-brand-queue.test.mjs`
- `npm ci && npm run typecheck && npm test && npm run test:unit && npm run build`
- `(cd desktop && npm ci && npm run typecheck && npm run test:desktop)`
- Kiểm tra ứng dụng chạy thực tế (EXE/DMG): ảnh logo xuất hiện ở Upload JPG/Chọn Drive, icon cửa sổ và menu, avatar topbar/sidebar, hover và giảm chuyển động.

## Ghi chú triển khai

- Luôn đọc `CLAUDE.md`, `AGENTS.md`, `docs/AI_HANDOFF.md` trước khi sửa mã nguồn.
- Sau khi push nhánh main và GitHub Actions xanh, build lại EXE trên Windows và DMG qua workflow macOS; installer cũ vẫn dùng icon và renderer cũ cho đến khi build lại.
- Không commit `desktop/desktop.config.json` hay các file `.env*` chứa giá trị bí mật.
