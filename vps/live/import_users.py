#!/usr/bin/env python3
"""Import Firebase Auth identity mapping into self-hosted DB WITHOUT guessing hashes.

Firebase Auth password hashes are NOT standard scrypt. Existing user passwords
must be reset with set_local_password.py unless proper Firebase hash verifier
is separately implemented/audited. Staff share links need no account.
"""
import argparse
import csv
import json
import os
import pathlib


def users_from(path):
    if path.suffix.lower() == '.csv':
        with path.open(newline='', encoding='utf8') as stream:
            for item in csv.DictReader(stream):
                yield item
    else:
        root = json.loads(path.read_text(encoding='utf8'))
        data = root.get('users', root) if isinstance(root, dict) else root
        if not isinstance(data, list):
            raise ValueError('Firebase Auth export must be a users array or CSV')
        yield from data


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('export')
    args = parser.parse_args()
    path = pathlib.Path(args.export)
    if not path.is_file():
        raise ValueError('Firebase Auth export file is missing')
    allowed = set(os.environ.get('AMORRI_ADMIN_UIDS', '').split(',')) - {''}
    rows = []
    for raw in users_from(path):
        uid = raw.get('localId') or raw.get('uid') or raw.get('User ID') or raw.get('user_id')
        email = raw.get('email') or raw.get('Email')
        if not uid or not email:
            continue
        if len(uid) > 160 or len(email) > 320:
            raise ValueError('Invalid identity in export')
        rows.append((uid, email.lower(), 'admin' if uid in allowed else 'staff',
                     str(raw.get('disabled','false')).lower() == 'true'))
    if not rows:
        raise ValueError('No valid users in Auth export; aborting')
    if len({r[0] for r in rows}) != len(rows) or len({r[1] for r in rows}) != len(rows):
        raise ValueError('Duplicate UID or email: aborting')
    import psycopg2
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM amorri_local_users')
            if cur.fetchone()[0]:
                raise ValueError('Local Auth already populated; refusing overwrite')
            for uid, email, role, disabled in rows:
                cur.execute('INSERT INTO amorri_local_users(uid,email,role,disabled) VALUES(%s,%s,%s,%s)',
                            (uid,email,role,disabled))
    print(f'Imported {len(rows)} identities with original Firebase UIDs; passwords must be reset locally')
    print(f'Admin accounts from AMORRI_ADMIN_UIDS: {sum(row[2]=="admin" for row in rows)}')

if __name__ == '__main__':
    try: main()
    except Exception as error: raise SystemExit(f'AUTH IMPORT STOPPED: {error}')
