/** Normalize Google Drive storage-exhausted failures. Other 403 errors,
 * e.g. permissions, must NOT be mistaken for quota failures. */
export function isGoogleDriveStorageQuotaExceeded(error:unknown):boolean{
 const message=error instanceof Error?error.message:String(error);
 return /storage\s*quota|storageQuotaExceeded|quota has been exceeded/i.test(message);
}
