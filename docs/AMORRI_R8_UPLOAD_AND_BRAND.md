# Amorri Studio R8 — Queue UX and brand assets

- Use the normal **Chọn thư mục khách** then **Chọn thư mục cha** flow to add each customer while existing uploads continue. The enqueue operation snapshots the selected JPG directory so a later selection does not alter active jobs. Only one uploader runs at a time; other albums wait in FIFO order.
- The dedicated **+ Thêm album tiếp theo** shortcut is removed; users reopen the normal Drive picker. Closing the picker never stops transfers. Closing the Tools window during an active queue hides it; reopening restores the main-process queue snapshot. Quitting the entire Electron app remains blocked during active upload to protect file transfer.
- Separate **Upload Activity** card removed from visible UI. Queue now displays a short upload history with expandable failed-file details. Invisible compatibility metadata remains for existing tests and UI progress logic.
- Desktop `assets/amorri-logo.png` and `assets/icon.ico`/`icon.icns` use the user-supplied transparent gold Amorri mark. Browser brand assets at `public/brand/` and App Router `app/icon.png`/`app/apple-icon.png` handle web/logo/icon display.
- Motion is CSS-only, GPU-light, hover-conditional and respects `prefers-reduced-motion`.
- Do not store desktop OAuth secrets in Git. `desktop/desktop.config.json` remains local / ignored.
