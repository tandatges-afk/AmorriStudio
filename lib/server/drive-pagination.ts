/** Drive folder listing: a complete result is required before authorizing photo IDs.
 * Google Drive v3 permits at most 1,000 files/page. Never return a partial album.
 */
export const DRIVE_FOLDER_PAGE_SIZE = 1000;
export const DRIVE_FOLDER_MAX_PAGES = 12;

export class DriveListingIncompleteError extends Error {
  constructor() { super('DRIVE_LIST_INCOMPLETE'); this.name = 'DriveListingIncompleteError'; }
}

export async function collectDriveFolderPages(
  readPage: (pageToken: string) => Promise<Record<string, unknown>>,
): Promise<Record<string, unknown>[]> {
  const files: Record<string, unknown>[] = [];
  const seenTokens = new Set<string>();
  let pageToken = '';
  for (let page = 0; page < DRIVE_FOLDER_MAX_PAGES; page++) {
    const data = await readPage(pageToken);
    // Incomplete searches, malformed response bodies and repeated cursors must
    // never authorize a guest selection using an incomplete file inventory.
    if (data.incompleteSearch === true || (data.files !== undefined && !Array.isArray(data.files)))
      throw new DriveListingIncompleteError();
    for (const file of (data.files || []) as unknown[]) {
      if (!file || typeof file !== 'object' || Array.isArray(file)) throw new DriveListingIncompleteError();
      files.push(file as Record<string, unknown>);
    }
    const next = data.nextPageToken;
    if (next === undefined || next === null || next === '') return files;
    if (typeof next !== 'string' || seenTokens.has(next)) throw new DriveListingIncompleteError();
    seenTokens.add(next);
    pageToken = next;
  }
  throw new DriveListingIncompleteError();
}
