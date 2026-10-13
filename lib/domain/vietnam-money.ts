/** All stored monetary values are integer VND; punctuation is presentation only. */
export const MAX_VND = 1_000_000_000_000;
export function formatVnd(value: number): string {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return (n === 0 ? '0.000' : new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(n)) + 'đ';
}
export function formatVndInput(value: number): string {
  const n = Number.isFinite(value) ? Math.trunc(value) : 0;
  return n === 0 ? '0.000' : new Intl.NumberFormat('vi-VN',{maximumFractionDigits:0}).format(n);
}
/** e.g. 2000000, 2.000.000 -> 2000000. Reject negative/decimal/invalid values. */
export function parseVnd(text: string): number | null {
  const clean=text.replace(/[.\s]/g,'').replace(/đ$/i,'');
  if(!/^\d{1,16}$/.test(clean))return null;
  const value=Number(clean);
  return Number.isSafeInteger(value)&&value>=0&&value<=MAX_VND?value:null;
}
