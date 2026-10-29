# Amorri Studio Desktop 1.0 — Windows (Electron)

**Bản nền tảng có thể mở cửa sổ desktop và tạo bộ cài NSIS.**

Giữ nguyên backend Vercel, Firebase, Drive, Cloudflare R2, GitHub Actions và toàn bộ website Next.js. Không đóng gói credential riêng tư. Chỉ mở website thật thông qua Electron với các tùy chọn bảo mật tối thiểu, không phải ứng dụng hoạt động offline.

## 0. Trước khi làm

- Windows 10/11, Node 22 LTS, npm và VS Code.
- Bạn đã chạy trong `desktop/`: `npm init -y; npm i -D electron electron-builder typescript @types/node`.
- Git đang ở nhánh `feature/desktop-electron`; không thực hiện trên main.

## 1. Cài bộ starter

**Giải nén ZIP vào thư mục GỐC repository `AmorriStudio`**, không giải nén vào `desktop`. ZIP chứa `desktop/src/main.ts`, `desktop/setup.mjs`, `desktop/desktop.config.json`, ...; không chứa hoặc thay thế `desktop/package.json` và `desktop/package-lock.json` bạn đã tạo.

PowerShell (đổi vị trí nếu ZIP không nằm trong Downloads):

```powershell
cd C:\Users\Admin\Documents\GitHub\AmorriStudio
Expand-Archive -LiteralPath "$env:USERPROFILE\Downloads\AmorriStudio_Electron_Desktop_1.0_Starter.zip" -DestinationPath . -Force
cd desktop
node setup.mjs
```

Trong `desktop/desktop.config.json`, thay `https://YOUR-DOMAIN.vercel.app/` bằng **URL HTTPS đang hoạt động của Amorri Studio**. Không dùng `/api/health`; điền trang chủ website. **Không điền khóa Firebase/R2/GitHub ở đây.**

Ví dụ cấu trúc file:
```json
{"webUrl":"https://ten-website-thuc-te.vercel.app/"}
```

## 2. Chạy lần đầu

```powershell
npm run typecheck
npm run dev
```

- Mở cửa sổ Amorri Studio.
- Đăng nhập thử, mở lịch, bàn giao ảnh và video R2.
- Menu **Amorri → Chọn thư mục tải ảnh…** để chọn đường dẫn Windows. Khi tải file qua HTTP chuẩn, Electron tự lưu ở đó và hiển thị tiến độ trên taskbar.
- Menu **Amorri → Mở thư mục tải ảnh** mở File Explorer.
- Download trong Electron **không** phải Chrome History (Ctrl+J); ảnh sẽ nằm trong thư mục Windows đã chọn.
- Nếu chưa chọn thư mục, Electron sẽ mở hộp thoại lưu file cho từng lượt tải.

**Google Sign-In / Google OAuth có thể cần tích hợp chuyên biệt cho Desktop.** Bản nền tảng chưa cam kết popup OAuth hoạt động trong mọi trường hợp. Không bật Node integration để lách giới hạn.

## 3. Tạo bộ cài EXE

Đóng ứng dụng dev, chạy trong `desktop`:

```powershell
npm run dist:win
```

File dự kiến:

`desktop/release/Amorri Studio Setup 1.0.0.exe`

- Cài thử trên một máy Windows khác. Cần có Internet để sử dụng backend.
- Bộ cài **chưa ký số** nên có thể bị Windows SmartScreen cảnh báo. Nên ký số trước khi phát hành rộng.
- Mặc định chỉ cho x64 Windows và NSIS, có shortcut Desktop/Start Menu, hỗ trợ gỡ cài đặt.
- Việc tải dữ liệu trực tiếp bằng native download chưa hỗ trợ trang web đang dùng `fetch + Blob`; website hiện đã có HTTP attachment cho ảnh nên có thể kiểm thử.

## 4. Git — dùng giao diện VS Code

- `Ctrl+Shift+G` xem file mới, xác nhận không stage `node_modules/`, `dist/`, `release/`, `.env`.
- Stage chỉ các file trong `desktop/`, bao gồm `package.json`, `package-lock.json` đã tạo trên Windows.
- Commit: `Add Amorri Studio Electron desktop shell 1.0`.
- Push nhánh `feature/desktop-electron` lên GitHub; kiểm thử trước khi merge `main`.

## 5. Những gì bản 1.0 CHƯA có

- Không có chế độ làm việc offline và không chứa toàn bộ Next.js server.
- Chưa có quản lý RAW tại chỗ, system tray, background notifications, auto-updater.
- Chưa có đăng nhập OAuth native và chưa có quy trình ký số code-signing.
- Web app chính chưa được sửa để tận dụng các API Windows.

Các tính năng này sẽ được triển khai theo các giai đoạn sau khi kiểm tra bản nền tảng hoạt động ổn định.
