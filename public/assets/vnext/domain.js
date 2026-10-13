/** Converts mm:ss or hh:mm:ss to seconds; suitable for frame-associated review timestamps. */
export function parseTimecode(text) {
    if (!/^\d{1,3}:\d{2}(?::\d{2})?$/.test(text.trim()))
        return null;
    const parts = text.trim().split(':').map(Number);
    if (parts.some((x, i) => i > 0 && (x < 0 || x > 59)))
        return null;
    return parts.reduce((n, p) => n * 60 + p, 0);
}
export function formatTimecode(seconds) {
    if (!Number.isFinite(seconds) || seconds < 0)
        return '00:00';
    const t = Math.floor(seconds);
    const pad = (n) => String(n).padStart(2, '0');
    const hours = Math.floor(t / 3600), min = Math.floor((t % 3600) / 60), sec = t % 60;
    return hours ? `${pad(hours)}:${pad(min)}:${pad(sec)}` : `${pad(min)}:${pad(sec)}`;
}
export function assignedOnDate(items, staffId, date) {
    return items.filter(e => e.date === date && e.status !== 'cancelled' && e.assignments.some(a => a.id === staffId));
}
export function canEditBooking(role) { return role === 'admin'; }
export function canManageBlackout(role, actorStaffId, record) {
    return role === 'admin' || (role === 'staff' && !!actorStaffId && actorStaffId === record.staffId);
}
export function normalizeKeyed(input) {
    return (Array.isArray(input) ? input : Object.values(input || {})).filter(x => x && typeof x === 'object');
}
