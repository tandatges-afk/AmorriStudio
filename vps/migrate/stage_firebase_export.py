#!/usr/bin/env python3
"""Convert a Firebase RTDB JSON export into a lossless SQL staging import.

Usage (offline, inside a private directory with mode 0700):
  python3 stage_firebase_export.py /secure/rtdb-export.json /secure/staging-import.sql
  psql -v ON_ERROR_STOP=1 -f 01-staging-schema.sql -f /secure/staging-import.sql ...
This does NOT activate PostgreSQL as Amorri's application database.
"""
import base64
import hashlib
import json
import pathlib
import sys

if len(sys.argv) != 3:
    raise SystemExit('Usage: stage_firebase_export.py INPUT_RTD_EXPORT_JSON OUTPUT_SQL')
input_path = pathlib.Path(sys.argv[1]).resolve()
output_path = pathlib.Path(sys.argv[2]).resolve()
if input_path == output_path:
    raise SystemExit('Refusing to overwrite Firebase export')
raw = input_path.read_bytes()
if len(raw) > 2_000_000_000:
    raise SystemExit('Large export: use a streamed importer instead')
root = json.loads(raw)
if not isinstance(root, dict):
    raise SystemExit('Expected Firebase RTDB root JSON object')
sha = hashlib.sha256(raw).hexdigest()
output_path.parent.mkdir(parents=True, exist_ok=True)
if output_path.exists():
    raise SystemExit('Output file already exists; choose a new path')
with output_path.open('x', encoding='utf-8') as output:
    output.write('BEGIN;\n')
    for key, value in root.items():
        if not isinstance(key, str) or not key or len(key) > 512:
            raise SystemExit('Invalid root key')
        key_b64 = base64.b64encode(key.encode('utf8')).decode('ascii')
        payload_b64 = base64.b64encode(json.dumps(value, ensure_ascii=False, separators=(',', ':')).encode('utf8')).decode('ascii')
        output.write("INSERT INTO amorri_legacy_snapshots(export_sha256,root_key,payload) VALUES (\n")
        output.write(f"'{sha}',convert_from(decode('{key_b64}','base64'),'UTF8'),\n")
        output.write(f"convert_from(decode('{payload_b64}','base64'),'UTF8')::jsonb) ON CONFLICT DO NOTHING;\n")
    output.write('COMMIT;\n')
output_path.chmod(0o600)
print(f'Staging SQL created, roots={len(root)}, export SHA-256={sha}, output={output_path}')
print('The SQL contains private customer data. Do not email, upload, or commit it.')
