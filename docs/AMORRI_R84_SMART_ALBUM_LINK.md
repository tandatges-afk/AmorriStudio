# Amorri Studio R8.4 — Smart Existing Album Verification

## Scope

`IMPORT EXISTING ALBUM` now requires two *visual* image comparisons. The first two JPG/JPEG names on the selected computer folder (natural filename order) must each have a matching **image code** on Drive (filename without extension, normalized and case-insensitive). Drive list ordering does not matter: `A1.jpg` is compared to `A1.JPG`; `A2.jpg` is compared to `A2.jpeg`. Never substitute an A2 image for an A1 image.

For each pair the Electron main process reads two local JPGs and two Drive JPEG previews, decodes them using `nativeImage`, and computes a lightweight edge-and-colour perceptual similarity percentage. **This is a deterministic image fingerprint, not a trained AI model or 100% proof of the customer's identity.** Each score must be **at least 90.0%**. The number is a heuristic and is not a calibrated ML confidence score.

The rest of the album must still have the same image-code set and image count (the extension .jpg/.jpeg may differ), with valid matching Drive MD5 hashes for all images not selected for visual comparison. For the two inspected images only, a visual match may replace a differing/missing MD5. RAW source still must be present. The app shows score details and asks the operator to confirm the customer before persisting the link. At final confirmation it repeats both the local/Drive checksums and visual comparisons to detect changes between preview and commit.

## Duplicate-link memory

Drive folder identifiers are checked against the locally persisted `driveFolders`, `driveUploads` and `rawLinks` mappings. A link already associated with this customer or another customer on the **same device** is warned about and blocked. The remembered mapping survives app restarts. Existing customer-folder URLs are also recognized where the selected link points to the parent of `jpg`.

This is intentionally **not cross-device deduplication**. Detecting links saved on other staff computers would require a shared authoritative link registry with authentication and conflict protection. Do not claim that the current local check detects all cross-device duplicates.

## Safety

- No external AI service, new API key, paid inference or transfer to an unrelated server is involved. Preview bytes are only read from Google Drive into app memory and not written to disk.
- JPEG previews are size bounded (8 MiB thumbnails; 64 MiB originals), abort on timeout, and restrict redirects to HTTPS Googleusercontent hosts. Unsupported or oversized files fail closed.
- Import never uploads, moves, renames, deletes or shares JPGs. Only final local metadata persistence is modified.
- Conflicting name codes, missing images, insufficient similarity, name/count mismatches and other checksum mismatches keep `Liên kết nguồn trên máy này` disabled.
- Reduced motion and existing colour/theme styles remain unchanged.

## Verification

`npm --prefix desktop run test:desktop`, `npm --prefix desktop run typecheck`, `npm --prefix desktop run dist:win` on a configured Windows workstation. The GUI and OAuth Drive fetch should be tested against a real, permissioned test album before production.
