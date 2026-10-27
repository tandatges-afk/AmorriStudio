# Amorri Studio — Source tái dựng đến giao diện 3.2.7.4

**Lưu ý nguồn gốc:** Gói này được tái dựng từ ZIP Amorri Studio 3.2.0 và các bản vá 3.2.1, 3.2.2, 3.2.3, 3.2.4, 3.2.5, 3.2.6, 3.2.7.2, 3.2.7.4 đã cung cấp trong cuộc trò chuyện. Một số chỉnh sửa giao diện tương đương bản 3.2.5.1 được tái thực hiện từ mô tả vì không có ZIP gốc 3.2.5.1. Không khẳng định giống 100% `main` trên GitHub của bạn.

## Có những gì?
- Toàn bộ thư mục Next.js/React, `app`, `pages`, `components`, `lib`, `scripts`, `tests`, `public`, `package.json`, `package-lock.json` và GitHub workflows từ nguồn tái dựng.
- `components/ClientDelivery.tsx` đầy đủ và `components/PhotoFeedback.tsx`, API bình luận ảnh.
- Phát video R2-only 1080p, lịch âm, tạo lịch bằng double-click, bộ ảnh concept, trạng thái/chi phí R2, chống trùng Drive và UI góp ý ảnh.
- Tên ảnh nằm trong ảnh ở góc dưới bên trái, không có dải gradient toàn chiều ngang.

## Quan trọng: ĐỪNG giải nén đè thẳng lên dự án đang chạy
Sao lưu repo trước. Mã nguồn trên GitHub đã thay đổi ở các lần commit mà gói này không đọc trực tiếp được, nên toàn bộ ZIP này dùng làm **nguồn khôi phục/tham khảo**, không thay thế an toàn tuyệt đối cho branch `main` đang chạy.

### Nếu chỉ lỗi thiếu ClientDelivery.tsx
1. Trong VS Code của repo đang dùng, chạy `git fetch origin` và kiểm tra `git ls-tree -r --name-only origin/main | Select-String "ClientDelivery"`.
2. Nếu file còn trong `origin/main`, dùng `git restore --source=origin/main -- components/ClientDelivery.tsx` (chỉ khi file trên máy bị mất và bạn không có sửa đổi chưa lưu).
3. Nếu file không có trong GitHub, dùng `repair_missing_component.ps1` nằm cạnh thư mục source tái dựng, hoặc chép những file thiếu từ source này sau khi so sánh.
4. Chạy `npm ci`, `npm run typecheck`, `npm run build` trước khi stage/commit/push.

### Chạy bản dựng từ gói tái dựng ở thư mục riêng
```powershell
cd 'C:\...\AmorriStudio_Reconstructed_3.2.7.4'
npm ci
npm run typecheck
npm run build
```
Không copy service account JSON, `.env`, token GitHub/R2 vào ZIP hoặc Git. Biến cấu hình hiện có trên Vercel giữ nguyên, không cần tạo mới.

## Đã kiểm tra / chưa kiểm tra
- Đạt 19 bài kiểm thử mục tiêu trong môi trường xây dựng; `git diff --check` sạch.
- Không thể `npm ci` offline do thiếu gói cache `zod-validation-error`, nên **chưa xác nhận** Next.js production build từ ZIP này.
- Chưa chạy thử Firebase / Drive / Cloudflare R2 production, chưa đồng bộ trực tiếp với repo GitHub mới nhất.
