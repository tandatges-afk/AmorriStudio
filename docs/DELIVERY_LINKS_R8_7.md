# R8.7 – Links bàn giao qua các ứng dụng nhắn tin

- Studio dùng **Copy link sản phẩm** duy nhất để lấy link mới dạng `/delivery/<mã lịch>/s/<mã truy cập>`. Khách không thấy nút sao chép trùng lặp.
- Tham số quảng bá do Zalo, Messenger, Facebook, Instagram thêm vào (`zarsrc`, `utm_*`, `fbclid`...) không ảnh hưởng xác thực. Link mới vẫn hoạt động khi ứng dụng xóa **phần query** của URL vì mã truy cập nằm trong đường dẫn; link cũ đọc được từ `access`, `token` hoặc fragment.
- Link cũ `?access=`, `?token=`, `#token=` được nâng cấp thành URL path `/s/<mã truy cập>` ở thanh địa chỉ khi được mở đầy đủ.
- **Không thể khôi phục mã truy cập bị một ứng dụng xóa hẳn**; nếu link chỉ còn `/delivery/<mã lịch>`, yêu cầu Studio gửi lại bằng **Copy link sản phẩm**. Không cho phép tự tạo lại quyền từ mã lịch.
- Mã truy cập trong URL là bí mật có thời hạn và có thể bị thu hồi. Không gửi công khai, không đưa vào analytics/log.
- Kiểm thử: `node --experimental-strip-types --test tests/delivery-message-links-r87.test.mjs tests/delivery-zalo-lightbox-r86.test.mjs`.
