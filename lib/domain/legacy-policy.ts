/** Client-side migration gate; NOT an authorization mechanism. Enforce RTDB rules separately. */
export type LegacyAdminWriteMode = 'compat' | 'read-only';
export function legacyAdminWriteMode(raw: string | undefined): LegacyAdminWriteMode {
  // Default compat preserves the existing advanced legacy workflows until an explicit cutover.
  // Invalid explicit values fail closed.
  return raw === undefined || raw === '' || raw === 'compat' ? 'compat' : 'read-only';
}
export function legacyCanWrite(mode: LegacyAdminWriteMode, scope: 'admin'|'delivery'): boolean {
  return scope === 'delivery' || mode === 'compat';
}
