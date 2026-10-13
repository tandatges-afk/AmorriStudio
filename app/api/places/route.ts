import {NextResponse} from 'next/server';
import {authenticatedAdmin} from '@/lib/server/firebase-admin';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const json = (body: object, status = 200) => NextResponse.json(body, {
 status,
 headers: {'Cache-Control': 'private, no-store'},
});

type GoogleApiError = {
 error?: {
  code?: number;
  status?: string;
  message?: string;
  details?: Array<{reason?: string; '@type'?: string}>;
 };
};

/**
 * Admin-only diagnostic messages. Never return the Google response body or API key
 * to the browser, even when the upstream request fails.
 */
function describeGoogleError(status: number, payload: GoogleApiError) {
 const googleStatus = String(payload.error?.status || '').slice(0, 70);
 const reason = String(payload.error?.details?.find(detail => typeof detail?.reason === 'string')?.reason || '').slice(0, 90);
 const signal = `${googleStatus} ${reason}`.toUpperCase();
 let code = 'GOOGLE_PLACES_UPSTREAM_ERROR';
 let error = 'Google Places từ chối yêu cầu. Kiểm tra API key, Places API (New) và Billing trên cùng dự án Google Cloud.';

 if (/API_KEY_INVALID|API_KEY_NOT_FOUND|INVALID_KEY|API_KEY_EXPIRED/.test(signal) || status === 401) {
  code = 'PLACES_INVALID_KEY';
  error = 'API key Google Maps không hợp lệ. Kiểm tra lại giá trị GOOGLE_MAPS_API_KEY trên Vercel.';
 } else if (/API_KEY_HTTP_REFERRER_BLOCKED|API_KEY_IP_ADDRESS_BLOCKED|API_KEY_SERVICE_BLOCKED|API_KEY_RESTRICTION|API_KEY_ACCESS_DENIED/.test(signal)) {
  code = 'PLACES_KEY_RESTRICTION';
  error = 'API key đang bị giới hạn sai. Với API chạy trên Vercel, không dùng giới hạn Website/referrer; cho phép Places API (New).';
 } else if (/BILLING|PROJECT_BILLING_INFO/.test(signal)) {
  code = 'PLACES_BILLING';
  error = 'Google Cloud chưa bật Billing hoặc tài khoản thanh toán chưa hợp lệ.';
 } else if (/SERVICE_DISABLED|API_DISABLED|ACCESS_NOT_CONFIGURED/.test(signal)) {
  code = 'PLACES_API_DISABLED';
  error = 'Bạn chưa bật Places API (New) trên dự án Google Cloud sở hữu API key.';
 } else if (/RESOURCE_EXHAUSTED|QUOTA|RATE_LIMIT/.test(signal) || status === 429) {
  code = 'PLACES_QUOTA';
  error = 'Google Places đã chạm giới hạn lượt gọi hoặc quota. Kiểm tra Quotas trong Google Cloud.';
 } else if (/INVALID_ARGUMENT/.test(signal) || status === 400) {
  code = 'PLACES_INVALID_REQUEST';
  error = 'Google Places không chấp nhận nội dung yêu cầu. Cần kiểm tra cấu hình Places API và mã nguồn.';
 } else if (/PERMISSION_DENIED/.test(signal) || status === 403) {
  code = 'PLACES_PERMISSION_DENIED';
  error = 'Google Places từ chối quyền gọi API (403). Kiểm tra API restrictions, Billing và Places API (New).';
 } else if (status >= 500) {
  code = 'PLACES_GOOGLE_UNAVAILABLE';
  error = 'Google Places tạm thời không phản hồi. Thử lại sau hoặc kiểm tra trạng thái dịch vụ Google.';
 }
 return {code, error, googleStatus, googleReason: reason, upstreamHttpStatus: status};
}

/** Autocomplete (New) is accessed only through the server; key is never exposed to browser. */
export async function GET(request: Request) {
 const admin = await authenticatedAdmin(request).catch(() => null);
 if (!admin) return json({error: 'Chỉ Admin được tìm địa điểm'}, 403);
 const input = new URL(request.url).searchParams.get('input')?.trim() || '';
 if (input.length < 3 || input.length > 160) return json({items: []});
 const key = (process.env.GOOGLE_MAPS_API_KEY || '').trim();
 if (!key) return json({
  items: [], code: 'PLACES_MISSING_KEY',
  error: 'Vercel chưa nhận GOOGLE_MAPS_API_KEY. Chọn đúng Environment và redeploy Production.',
 }, 503);
 try {
  const response = await fetch('https://places.googleapis.com/v1/places:autocomplete', {
   method: 'POST',
   headers: {
    'Content-Type': 'application/json',
    'X-Goog-Api-Key': key,
    'X-Goog-FieldMask': 'suggestions.placePrediction.placeId,suggestions.placePrediction.text.text',
   },
   body: JSON.stringify({input, languageCode: 'vi', regionCode: 'VN', includedRegionCodes: ['vn']}),
   signal: AbortSignal.timeout(5500),
   cache: 'no-store',
  });
  if (!response.ok) {
   const googleBody = (await response.json().catch(() => ({}))) as GoogleApiError;
   const diagnostic = describeGoogleError(response.status, googleBody);
   // Structured server log contains *only* error classifications, never the key or user's address.
   console.error('[places:autocomplete]', diagnostic);
   return json({items: [], ...diagnostic}, 502);
  }
  const payload = await response.json() as {
   suggestions?: Array<{placePrediction?: {placeId?: string; text?: {text?: string}}}>;
  };
  const items = (payload.suggestions || [])
   .map(item => ({id: String(item.placePrediction?.placeId || ''), label: String(item.placePrediction?.text?.text || '')}))
   .filter(item => item.id && item.label).slice(0, 6);
  return json({items});
 } catch (error) {
  const code = error instanceof Error && error.name === 'TimeoutError' ? 'PLACES_TIMEOUT' : 'PLACES_NETWORK_ERROR';
  console.error('[places:autocomplete]', {code});
  return json({items: [], code, error: code === 'PLACES_TIMEOUT'
   ? 'Google Places phản hồi quá thời gian chờ. Hãy thử lại.'
   : 'Vercel không kết nối được Google Places. Hãy kiểm tra Logs và thử lại.'}, 502);
 }
}
