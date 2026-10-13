# VNext 2.6.1 — Sửa hiển thị Link an toàn

## Nguyên nhân

`components/DeliveryGrantManager.tsx` đưa markup HTML vào trong chuỗi JS (`'<span>🔐</span> Link an toàn 2.5'`). React escape nội dung chuỗi để bảo vệ giao diện, do đó thẻ `<span>` hiển thị nguyên văn thay vì được dựng thành phần tử HTML.

## Thay đổi

- Đổi chuỗi HTML thành phần tử JSX `<LockKeyhole />` + văn bản **Link an toàn**.
- Bổ sung `type="button"`, `aria-expanded`, `aria-controls` cho nút mở danh sách liên kết.
- Đồng bộ nhãn phiên bản trên dashboard thành **VNext 2.6** (trước đó vẫn ghi 2.0/2.5).
- Thêm bài kiểm thử hồi quy `tests/display-2_6_1.test.mjs`.

Không thay đổi Firebase, API, security rules, bảng lương, phát video hay khóa bí mật. Không cần bổ sung biến môi trường.

## Triển khai

1. Sao lưu phiên bản VNext 2.6 đang chạy.
2. Chép toàn bộ source 2.6.1 vào nhánh GitHub dùng cho **Preview**.
3. Trên Vercel, bảo đảm Framework **Next.js**, Output Directory **Automatic**, chạy `npm run build`.
4. Mở Dashboard → Bàn giao sản phẩm, xác nhận nút có biểu tượng khóa đúng và chỉ hiển thị chữ “Link an toàn”; nhấn mở/đóng danh sách link.
5. Kiểm tra chức năng tạo/thu hồi link, bình luận video, tải ảnh, và chỉ chuyển Production sau khi xác nhận.

`/api/health` vẫn hiển thị release 2.6 vì bản 2.6.1 chỉ là hotfix giao diện, không thay đổi API. Kiểm tra deployment bằng Git commit trên Vercel.

### Phạm vi kiểm chứng

Chạy `npm test`, `node scripts/check-static.mjs`, và kiểm tra cú pháp TSX riêng. Chưa kiểm chứng đầy đủ `next build` nếu môi trường không có gói npm đã cài.
