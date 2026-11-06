#!/usr/bin/env python3
"""One-time, transactional import of a FULL Firebase Realtime Database export.

Preserves original keys, numeric legacy IDs, full nested event objects and
customer delivery/review/permission metadata in PostgreSQL JSONB.
Fails closed if data is missing, duplicated or the destination has live rows.
NEVER deletes or changes the Firebase source. Run only during a write freeze.
"""
import argparse
import hashlib
import json
import os
import pathlib
import sys


def documents(root):
    if not isinstance(root, dict):
        raise ValueError('Expected complete Firebase root JSON object')
    for root_key, parent in root.items():
        if not isinstance(root_key, str) or not root_key:
            raise ValueError('Invalid root key')
        if root_key in ('studioPlanner_v1', 'amorriStudioAdminArchive_v1'):
            if not isinstance(parent, dict):
                raise ValueError('Expected object at ' + root_key)
            for collection, content in parent.items():
                if isinstance(content, list):
                    children = ((str(index), item) for index, item in enumerate(content) if item is not None)
                elif isinstance(content, dict):
                    children = content.items()
                else:
                    # Preserve scalar top-level settings under a reserved entry.
                    children = [('__root', content)]
                for key, item in children:
                    yield f'{root_key}/{collection}/{key}', item
        elif isinstance(parent, dict):
            for child, item in parent.items():
                yield f'{root_key}/{child}', item
        elif isinstance(parent, list):
            for index, item in enumerate(parent):
                if item is not None:
                    yield f'{root_key}/{index}', item
        else:
            yield f'{root_key}/__root', parent


def inspect(root):
    planner = root.get('studioPlanner_v1') if isinstance(root, dict) else None
    if not isinstance(planner, dict):
        raise ValueError('Missing studioPlanner_v1 root: not a complete Amorri export')
    events = planner.get('events')
    if isinstance(events, list):
        keyed = [(str(i), v) for i, v in enumerate(events) if v is not None]
    elif isinstance(events, dict):
        keyed = list(events.items())
    else:
        raise ValueError('Missing events collection: aborting migration')
    if not keyed:
        raise ValueError('No calendar events found; refuse empty production import')
    ids = {}
    bad = []
    for key, event in keyed:
        if not isinstance(event, dict):
            bad.append(key)
            continue
        identity = event.get('id')
        if identity is None or str(identity).strip() == '':
            bad.append(key)
            continue
        ids.setdefault(str(identity), []).append(key)
    duplicates = {event: keys for event, keys in ids.items() if len(keys) > 1}
    if duplicates or bad:
        raise ValueError(f'Calendar integrity check failed: duplicate IDs={len(duplicates)}, missing IDs={len(bad)}. Fix before cutover.')
    return len(keyed)


def canonical(value):
    return json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(',', ':'))


def main():
    parser = argparse.ArgumentParser(description='Transactional Firebase RTDB -> Amorri PostgreSQL import')
    parser.add_argument('export', help='Complete Firebase RTDB JSON export')
    parser.add_argument('--report', required=True, help='JSON report output path; must be private')
    args = parser.parse_args()
    source = pathlib.Path(args.export).resolve()
    report = pathlib.Path(args.report).resolve()
    if report.exists():
        raise SystemExit('Refusing to overwrite existing migration report')
    if not source.is_file() or source.stat().st_size > 1_000_000_000:
        raise SystemExit('Missing or unexpectedly large JSON export')
    raw = source.read_bytes()
    root = json.loads(raw)
    event_count = inspect(root)
    all_documents = list(documents(root))
    from pg_bridge import segments
    for key, _ in all_documents:
        segments(key)
    expected = {key: value for key, value in all_documents}
    if len(expected) != len(all_documents):
        raise SystemExit('Duplicate document paths in source')
    if len(expected) > 250_000:
        raise SystemExit('Unusually many objects; use a streamed import instead')
    sha = hashlib.sha256(raw).hexdigest()
    root_sha = hashlib.sha256(canonical(root).encode('utf8')).hexdigest()
    import psycopg2
    with psycopg2.connect(os.environ['DATABASE_URL']) as conn:
        with conn.cursor() as cur:
            cur.execute('SELECT count(*) FROM amorri_documents')
            existing = cur.fetchone()[0]
            if existing:
                raise RuntimeError('Database already contains live records; refusing to overwrite them')
            cur.execute('SELECT count(*) FROM amorri_import_runs')
            if cur.fetchone()[0]:
                raise RuntimeError('Previous import detected; refusing second import')
            for path, payload in all_documents:
                cur.execute('INSERT INTO amorri_documents (path,payload) VALUES (%s,%s::jsonb)',
                            (path, json.dumps(payload, ensure_ascii=False, separators=(',', ':'))))
            cur.execute('SELECT path,payload FROM amorri_documents')
            actual = dict(cur.fetchall())
            if actual.keys() != expected.keys():
                raise RuntimeError('Document paths failed verification')
            for path, data in expected.items():
                if canonical(actual[path]) != canonical(data):
                    raise RuntimeError('PostgreSQL JSON content mismatch; migration aborted')
            # Compare by exact prefix in Python to avoid off-by-one key filtering.
            observed = sum(1 for key in actual if key.startswith('studioPlanner_v1/events/'))
            if observed != event_count:
                raise RuntimeError('Calendar count mismatch; transaction rolled back')
            cur.execute('INSERT INTO amorri_import_runs(source_sha256,documents,events,root_sha256,verified) '
                        'VALUES (%s,%s,%s,%s,true)', (sha,len(actual),event_count,root_sha))
    report.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    report.write_text(json.dumps({'sourceSha256':sha,'rootSha256':root_sha,'documents':len(expected),
                                  'events':event_count,'postgresVerified':True},indent=2),encoding='utf8')
    report.chmod(0o600)
    print(f'VERIFIED: imported {event_count} original calendar events, {len(expected)} documents; sha256={sha}')
    print('WARNING: Do not disable Firebase until all other integrations, auth and media have passed production smoke tests')


if __name__ == '__main__':
    try:
        main()
    except Exception as e:
        raise SystemExit(f'MIGRATION STOPPED: {e}')
