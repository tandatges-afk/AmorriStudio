// Only classify errors locally; never log err.message because it can include URLs or credentials.
export function classifyFirebaseError(error: unknown): string {
  const err = error as {code?:unknown;message?:unknown};
  const code=typeof err?.code==='string' ? err.code.toLowerCase() : '';
  const msg=typeof err?.message==='string' ? err.message.toLowerCase() : '';
  const combined=code+' '+msg;
  if (/permission.denied|access.denied|403|insufficient.permission|unauthorized/.test(combined)) return 'PERMISSION_DENIED';
  if (/index.not.defined|indexon|index.required|\.indexon/.test(combined)) return 'INDEX_REQUIRED';
  if (/invalid.url|invalid.database|database.url|invalid.hostname/.test(combined)) return 'INVALID_DATABASE_URL';
  if (/not.found|404|instance.not.found/.test(combined)) return 'DATABASE_NOT_FOUND';
  if (/timeout|timed.out|deadline.exceeded|econnreset|enotfound|network|unavailable|503/.test(combined)) return 'NETWORK_ERROR';
  return 'UNKNOWN';
}
