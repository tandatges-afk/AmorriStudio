/* Operator-only recovery: node --experimental-strip-types scripts/decrypt-archive.mjs archived-record.json > restored.json
 * Requires AMORRI_ARCHIVE_ENCRYPTION_KEY. Never send restored.json or key to ChatGPT/GitHub. */
import {readFileSync} from 'node:fs';
import {decryptBookingArchive} from '../lib/server/booking-archive.ts';
if(process.argv.length!==3)throw new Error('Usage: node --experimental-strip-types scripts/decrypt-archive.mjs archived-record.json');
const source=JSON.parse(readFileSync(process.argv[2],'utf8'));
process.stdout.write(JSON.stringify(decryptBookingArchive(source),null,2)+'\n');
