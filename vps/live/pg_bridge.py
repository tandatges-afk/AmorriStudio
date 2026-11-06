#!/usr/bin/env python3
"""Local, authenticated HTTP-to-PostgreSQL bridge for Amorri server code.

Never bind this service to public interfaces. Use AMORRI_BRIDGE_SECRET and
DATABASE_URL from /etc/amorri/prod.env. No arbitrary SQL can be sent by clients.
Requires Ubuntu's python3-psycopg2 package. All mutations are serializable
within a collection via transaction-scoped PG advisory locks and CAS revisions.
"""
import hashlib
import hmac
import json
import os
import re
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer

import psycopg2
import psycopg2.extras

PATH_RE = re.compile(r'^[A-Za-z0-9_-]+(?:/[A-Za-z0-9_-]+)*$')
MAX_BODY = 8 * 1024 * 1024


def segments(path):
    if not isinstance(path, str) or len(path) > 600 or not PATH_RE.fullmatch(path):
        raise ValueError('Invalid document path')
    return path.split('/')


def collection(path):
    parts = segments(path)
    if parts[0] in ('studioPlanner_v1', 'amorriStudioAdminArchive_v1'):
        return '/'.join(parts[:2])
    return parts[0]


def doc_path(path):
    parts = segments(path)
    depth = 3 if parts[0] in ('studioPlanner_v1', 'amorriStudioAdminArchive_v1') else 2
    return '/'.join(parts[:depth]) if len(parts) >= depth else None


def read_doc(cur, path):
    cur.execute('SELECT payload,revision FROM amorri_documents WHERE path=%s', (path,))
    row = cur.fetchone()
    return (row[0], row[1]) if row else (None, 0)


def suffix_value(value, suffix):
    for item in suffix:
        if isinstance(value, dict):
            value = value.get(item)
        elif isinstance(value, list) and item.isdigit():
            index = int(item)
            value = value[index] if index < len(value) else None
        else:
            return None
    return value


def assign_suffix(value, suffix, replacement):
    if not suffix:
        return replacement
    if not isinstance(value, (dict, list)):
        value = {}
    result = json.loads(json.dumps(value))
    current = result
    for name in suffix[:-1]:
        if isinstance(current, list) and name.isdigit():
            index = int(name)
            if index > 100_000:
                raise ValueError('Array index too large')
            while len(current) <= index:
                current.append(None)
            if not isinstance(current[index], (dict, list)):
                current[index] = {}
            current = current[index]
        elif isinstance(current, dict):
            if not isinstance(current.get(name), (dict, list)):
                current[name] = {}
            current = current[name]
        else:
            raise ValueError('Unsupported nested array path')
    name = suffix[-1]
    if isinstance(current, dict):
        if replacement is None:
            current.pop(name, None)
        else:
            current[name] = replacement
    elif isinstance(current, list) and name.isdigit():
        index = int(name)
        if index > 100_000:
            raise ValueError('Array index too large')
        while len(current) <= index:
            current.append(None)
        current[index] = replacement
    else:
        raise ValueError('Unsupported nested path')
    return result


def read_tree(cur, path):
    key = doc_path(path)
    if key:
        raw, rev = read_doc(cur, key)
        remainder = segments(path)[len(segments(key)):]
        return suffix_value(raw, remainder), str(rev)
    prefix = path + '/'
    cur.execute('SELECT path,payload,revision FROM amorri_documents '
                'WHERE left(path,length(%s))=%s ORDER BY path', (prefix, prefix))
    rows = cur.fetchall()
    result = {}
    checksum = hashlib.sha256()
    for key, value, rev in rows:
        suffix = key[len(prefix):].split('/')
        if not suffix or not suffix[0]:
            continue
        current = result
        for part in suffix[:-1]:
            current = current.setdefault(part, {})
        current[suffix[-1]] = value
        checksum.update(f'{key}\0{rev}\n'.encode('utf8'))
    return (result or None), checksum.hexdigest()


def write_tree(cur, path, value):
    key = doc_path(path)
    if key:
        existing, revision = read_doc(cur, key)
        suffix = segments(path)[len(segments(key)):]
        new_value = assign_suffix(existing, suffix, value)
        if new_value is None:
            cur.execute('DELETE FROM amorri_documents WHERE path=%s', (key,))
        else:
            cur.execute('INSERT INTO amorri_documents (path,payload) VALUES (%s,%s::jsonb) '
                        'ON CONFLICT(path) DO UPDATE SET payload=EXCLUDED.payload, '
                        "revision=nextval('amorri_document_revision_seq'),updated_at=now()",
                        (key, json.dumps(new_value, ensure_ascii=False)))
        return
    # Collection transactions (staff/blackouts) replace only their subtree.
    prefix = path + '/'
    cur.execute('DELETE FROM amorri_documents WHERE left(path,length(%s))=%s', (prefix, prefix))
    if value is None:
        return
    if not isinstance(value, (dict, list)):
        raise ValueError('Collection must be a JSON object or array')
    entries = enumerate(value) if isinstance(value, list) else value.items()
    for label, payload in entries:
        if payload is None:
            continue
        label = str(label)
        if not PATH_RE.fullmatch(label):
            raise ValueError('Unsafe collection key')
        cur.execute('INSERT INTO amorri_documents(path,payload) VALUES (%s,%s::jsonb)',
                    (prefix + label, json.dumps(payload, ensure_ascii=False)))


def safe_equal(expected, actual):
    if not expected or not actual:
        return False
    return hmac.compare_digest(expected.encode('utf8'), actual.encode('utf8'))


def handle_database(request):
    action, path = request.get('action'), request.get('path')
    segments(path)
    if action not in ('read', 'write'):
        raise ValueError('Unsupported DB operation')
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            if action == 'read':
                value, etag = read_tree(cur, path)
                return 200, {'value': value, 'etag': etag}
            coll = collection(path)
            cur.execute('SELECT pg_advisory_xact_lock(hashtextextended(%s,0))', ('amorri/' + coll,))
            previous, etag = read_tree(cur, path)
            if request.get('ifMatch') is not None and not safe_equal(str(request['ifMatch']), etag):
                return 409, {'conflict': True, 'etag': etag}
            write_tree(cur, path, request.get('value'))
            _, new_etag = read_tree(cur, path)
            return 200, {'ok': True, 'etag': new_etag}


def handle_user(request):
    uid = request.get('uid')
    if not isinstance(uid, str) or not re.fullmatch(r'[A-Za-z0-9_-]{1,160}', uid):
        raise ValueError('Invalid UID')
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor(cursor_factory=psycopg2.extras.RealDictCursor) as cur:
            cur.execute('SELECT uid,email,role,disabled,session_epoch FROM amorri_local_users WHERE uid=%s', (uid,))
            row = cur.fetchone()
            return 200, {'user': dict(row) if row else None}


def handle_login(request):
    email = request.get('email', '')
    password = request.get('password', '')
    if not isinstance(email, str) or not isinstance(password, str) or len(email) > 320 or len(password) > 1024:
        raise ValueError('Invalid credentials')
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT uid,email,role,disabled,session_epoch,salt,password_hash '
                        'FROM amorri_local_users WHERE lower(email)=lower(%s)', (email,))
            row = cur.fetchone()
    if not row or row[3] or not row[5] or not row[6]:
        return 401, {'error': 'Invalid credentials'}
    try:
        actual = hashlib.scrypt(password.encode('utf8'), salt=bytes.fromhex(row[5]),
                                n=2**14, r=8, p=1, dklen=32).hex()
    except (ValueError, MemoryError):
        return 401, {'error': 'Invalid credentials'}
    if not safe_equal(actual, row[6]):
        return 401, {'error': 'Invalid credentials'}
    return 200, {'user': {'uid': row[0], 'email': row[1], 'role': row[2],
                          'disabled': row[3], 'session_epoch': row[4]}}


class Handler(BaseHTTPRequestHandler):
    def do_POST(self):
        try:
            expected = os.environ.get('AMORRI_BRIDGE_SECRET', '')
            token = self.headers.get('X-Amorri-Bridge', '')
            if len(expected) < 32 or not safe_equal(token, expected):
                return self.reply(403, {'error': 'Forbidden'})
            size = int(self.headers.get('Content-Length', '0'))
            if size <= 0 or size > MAX_BODY:
                return self.reply(413, {'error': 'Invalid body size'})
            body = json.loads(self.rfile.read(size))
            if not isinstance(body, dict):
                raise ValueError('Expected JSON object')
            if self.path == '/db':
                status, result = handle_database(body)
            elif self.path == '/login':
                status, result = handle_login(body)
            elif self.path == '/user':
                status, result = handle_user(body)
            else:
                status, result = 404, {'error': 'Unknown endpoint'}
            return self.reply(status, result)
        except (ValueError, json.JSONDecodeError):
            return self.reply(400, {'error': 'Invalid request'})
        except Exception as ex:
            print('[amorri-db-bridge]', type(ex).__name__, flush=True)
            return self.reply(503, {'error': 'Database unavailable'})

    def reply(self, status, data):
        encoded = json.dumps(data, ensure_ascii=False, separators=(',', ':')).encode('utf8')
        self.send_response(status)
        self.send_header('Content-Type', 'application/json; charset=utf-8')
        self.send_header('Cache-Control', 'no-store')
        self.send_header('Content-Length', str(len(encoded)))
        self.end_headers()
        self.wfile.write(encoded)

    def log_message(self, format, *args):
        pass  # Do not log private request paths or client data.


if __name__ == '__main__':
    if len(os.environ.get('AMORRI_BRIDGE_SECRET', '')) < 32:
        raise SystemExit('AMORRI_BRIDGE_SECRET must be at least 32 chars')
    if not os.environ.get('DATABASE_URL', '').startswith('postgresql://'):
        raise SystemExit('DATABASE_URL must be a postgresql URI')
    # Hard-coded loopback to prevent accidental exposure of database API.
    ThreadingHTTPServer(('127.0.0.1', 3312), Handler).serve_forever()
