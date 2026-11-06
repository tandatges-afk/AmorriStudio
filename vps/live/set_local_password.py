#!/usr/bin/env python3
"""Interactive local account activation, preserving existing Firebase UID.
Run on VPS private TTY, not in a pasted script or GitHub secret.
"""
import argparse
import getpass
import hashlib
import os
import secrets


def main():
    parser=argparse.ArgumentParser()
    parser.add_argument('email',help='Email from imported Firebase Auth identity')
    args=parser.parse_args()
    value=getpass.getpass('New strong password (min 14 characters): ')
    if len(value)<14:
        raise ValueError('Password must be at least 14 characters')
    verify=getpass.getpass('Confirm password: ')
    if not secrets.compare_digest(value,verify):
        raise ValueError('Password mismatch')
    salt=secrets.token_bytes(24)
    digest=hashlib.scrypt(value.encode('utf8'),salt=salt,n=2**14,r=8,p=1,dklen=32)
    import psycopg2
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            cur.execute('UPDATE amorri_local_users SET salt=%s,password_hash=%s,session_epoch=session_epoch+1,updated_at=now() '
                        'WHERE lower(email)=lower(%s) AND disabled=false RETURNING uid', (salt.hex(),digest.hex(),args.email))
            item=cur.fetchone()
            if not item:
                raise ValueError('Account email missing or disabled. Import Firebase Auth first.')
    print('Activated local login for original UID; existing sessions revoked')

if __name__=='__main__':
    try:main()
    except Exception as ex:raise SystemExit(f'PASSWORD RESET STOPPED: {ex}')
