# Amorri R8.5 — Mobile original photo download

## Root cause

The previous customer gallery posted an authenticated photo-download request into a hidden iframe created with JavaScript. That flow was fragile on iOS Safari and mobile Chrome: the attachment was not guaranteed to be recognized by the browser's download manager, while the UI prematurely displayed "Đã yêu cầu tải" and desktop-only Ctrl+J instructions.

## Fix

- Render a **native HTML form** for each photo download action (actual `type=submit` button), `POST` and `target=_blank`. This preserves the trusted user gesture and moves the response to a browser top-level tab/download context rather than a hidden frame.
- Keep `eventId` in the endpoint path, while `productId`, `mediaId`, and **grant token** remain in the POST body. No token in URL, referrer, or browser download link.
- Preserve server-side grant validation, Drive product membership checks, 150 MB limit, and streaming `Content-Disposition: attachment` responses. No JavaScript blob buffering.
- For a rejected form POST, respond with a secure, no-store HTML error page in the new tab rather than raw JSON. API/JSON requests keep their original JSON error behavior.
- Replace the misleading Ctrl+J completion notice with instructions for Safari Files / Android Downloads and how to interpret errors.
- The flow does not assert that the file was downloaded, because the browser, not the page, controls saving and download completion.

## Verification

1. On iPhone Safari, open an active guest delivery URL and tap **Tải ảnh**. Verify Downloads or the share/save-to-Files route; repeat with an expired grant and check the readable error tab.
2. On iPhone Chrome and Android Chrome, verify a medium and large JPEG download (avoid exceeding 150 MB), file name, and gallery selection state after the download.
3. On desktop Chrome, test standard download flow, one invalid token, and no new exposed grant tokens in address bars.
4. If the file still fails, capture Network response status and headers from a controlled test environment; a mobile download may fail for reasons outside the page (Drive permissions, upstream error, network, browser limitations).

This change only affects customer-gallery photo downloads; neither R2 playback nor upload/RAW is modified.
