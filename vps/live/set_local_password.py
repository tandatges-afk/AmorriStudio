#!/usr/bin/env python3
"""Set a local Amorri username + password without changing imported Firebase UIDs.

Use on the private VPS TTY only. This script never prints passwords or emails.
Usage:
  python3 set_local_password.py --uid ORIGINAL_FIREBASE_UID --username minhthien
  python3 set_local_password.py email@example.com --username minhthien
Legacy email-only password resets remain supported.
"""
import argparse
import getpass
import hashlib
import os
import re
import secrets

USERNAME_PATTERN = re.compile(r'^[a-z][a-z0-9._-]{2,31}$')
MIN_PASSWORD_LENGTH = 6


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('email', nargs='?', help='Existing imported Firebase email (legacy selector)')
    parser.add_argument('--uid', help='Original Firebase UID (preferred account selector)')
    parser.add_argument('--username', help='Unique username: 3-32 characters, lowercase letters/numbers/._-')
    args = parser.parse_args()
    if bool(args.email) == bool(args.uid):
        parser.error('Select exactly one account using an email argument or --uid')
    username = args.username.strip().lower() if args.username is not None else None
    if username is not None and not USERNAME_PATTERN.fullmatch(username):
        parser.error('Username must be 3-32 characters: lowercase letters, digits, dot, underscore, hyphen; begin with a letter')
    value = getpass.getpass('New password (min 6 characters): ')
    if len(value) < MIN_PASSWORD_LENGTH:
        raise ValueError('Password must be at least 6 characters')
    if len(value.encode('utf8')) > 1024:
        raise ValueError('Password too long')
    verify = getpass.getpass('Confirm password: ')
    if not secrets.compare_digest(value, verify):
        raise ValueError('Password mismatch')
    salt = secrets.token_bytes(24)
    digest = hashlib.scrypt(value.encode('utf8'), salt=salt, n=2**14, r=8, p=1, dklen=32)
    import psycopg2
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            if args.uid:
                selector, identifier = 'uid=%s', args.uid
            else:
                selector, identifier = 'lower(email)=lower(%s)', args.email
            # Username and password change in ONE transaction, preserving UID/role/email.
            # Existing sessions are invalidated on every successful reset.
            if username is None:
                cur.execute('UPDATE amorri_local_users SET salt=%s,password_hash=%s, '
                            'session_epoch=session_epoch+1,updated_at=now() '
                            'WHERE '+selector+' AND disabled=false RETURNING uid',
                            (salt.hex(), digest.hex(), identifier))
            else:
                cur.execute('UPDATE amorri_local_users SET username=%s,salt=%s,password_hash=%s, '
                            'session_epoch=session_epoch+1,updated_at=now() '
                            'WHERE '+selector+' AND disabled=false RETURNING uid',
                            (username, salt.hex(), digest.hex(), identifier))
            if not cur.fetchone():
                raise ValueError('Imported account missing or disabled')
    print('Activated local username/password for original UID; previous sessions revoked')


if __name__ == '__main__':
    try:
        main()
    except Exception as error:
        # Do not print email, username or password in errors.
        raise SystemExit(f'PASSWORD RESET STOPPED: {type(error).__name__ if not isinstance(error, ValueError) else error}')
