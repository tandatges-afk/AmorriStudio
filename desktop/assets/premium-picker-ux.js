'use strict';
// Enhance only the local Electron picker. Original picker.js owns all Drive IPC.
(() => {
  const title = document.querySelector('.title');
  if (!title || document.getElementById('amorriClosePicker')) return;
  const close = document.createElement('button');
  close.id = 'amorriClosePicker';
  close.className = 'amorri-picker-close';
  close.type = 'button';
  close.setAttribute('aria-label','Đóng cửa sổ chọn Drive');
  close.title = 'Đóng';
  close.textContent = '×';
  title.append(close);
  const attemptClose = () => {
    const message = document.getElementById('message')?.textContent || '';
    if (/Đang tạo folder|Đang đưa folder/.test(message)) {
      const hint = document.getElementById('message');
      if (hint) hint.textContent = 'Đang xử lý, vui lòng sử dụng Dừng upload trong cửa sổ Up Drive.';
      return;
    }
    window.close();
  };
  close.addEventListener('click', attemptClose);
  document.addEventListener('keydown', event => {
    if (event.key === 'Escape') { event.preventDefault(); attemptClose(); }
  });
})();
