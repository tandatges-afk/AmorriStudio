"use strict";
/** Progressive enhancement, scoped to customer video delivery only.
 * Never changes the current stream URL, currentTime, or the user's 1080p file. */
function setupMediaIndicators() {
    const root = document.getElementById('cgVideoContainer');
    if (!root)
        return;
    const initialized = new WeakSet();
    const setup = (video) => {
        if (initialized.has(video) || !video.closest('.client-video-card'))
            return;
        initialized.add(video);
        const frame = video.closest('.client-video-frame');
        if (!frame)
            return;
        const status = document.createElement('span');
        status.className = 'am-media-feedback';
        status.setAttribute('role', 'status');
        status.setAttribute('aria-live', 'polite');
        status.hidden = true;
        status.textContent = 'Đang tải video…';
        frame.appendChild(status);
        let timeout;
        const hide = () => { window.clearTimeout(timeout); status.hidden = true; };
        const wait = () => {
            window.clearTimeout(timeout);
            timeout = window.setTimeout(() => {
                if (!video.paused && !video.ended && video.readyState < 3) {
                    status.textContent = 'Đang tải dữ liệu video…';
                    status.hidden = false;
                }
            }, 1600);
        };
        video.addEventListener('waiting', wait, { passive: true });
        video.addEventListener('stalled', wait, { passive: true });
        video.addEventListener('seeking', hide, { passive: true });
        video.addEventListener('playing', hide, { passive: true });
        video.addEventListener('canplay', hide, { passive: true });
        video.addEventListener('pause', hide, { passive: true });
        video.addEventListener('error', () => {
            hide();
            if (video.error && !video.paused) {
                status.textContent = 'Không tải được nguồn video. Vui lòng thử lại.';
                status.hidden = false;
            }
        }, { passive: true });
    };
    const scan = () => root.querySelectorAll('video').forEach(setup);
    scan();
    let pending = false;
    const observer = new MutationObserver(() => {
        if (pending)
            return;
        pending = true;
        requestAnimationFrame(() => { pending = false; scan(); });
    });
    observer.observe(root, { childList: true, subtree: true });
    window.addEventListener('pagehide', () => observer.disconnect(), { once: true });
}
if (document.readyState === 'loading')
    document.addEventListener('DOMContentLoaded', setupMediaIndicators, { once: true });
else
    setupMediaIndicators();
