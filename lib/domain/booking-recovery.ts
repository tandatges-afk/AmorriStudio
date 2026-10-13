/** A Firebase transaction callback can run with null before its final server state is known.
 * Classify only after a separate, awaited server read, never from the callback. */
export type BookingAbortCode = 'BOOKING_NOT_FOUND' | 'BOOKING_CONFLICT' | 'BOOKING_RETRY';
export function classifyBookingAbort(
  latest: Record<string, unknown> | null,
  expectedVersion: string,
  hash: (value: Record<string, unknown>) => string
): BookingAbortCode {
  if (!latest || typeof latest !== 'object' || Array.isArray(latest)) return 'BOOKING_NOT_FOUND';
  if (hash(latest) !== expectedVersion) return 'BOOKING_CONFLICT';
  return 'BOOKING_RETRY';
}
