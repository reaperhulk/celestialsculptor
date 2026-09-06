# Agent-side fallback when Git HTTPS credentials are unavailable. Does not hold credentials.
import json
import subprocess

def git(*args):
    return subprocess.check_output(['git', *args], text=True)

entries = []
for row in git('diff-tree', '--no-commit-id', '--name-status', '-r', 'HEAD').splitlines():
    status, path = row.split('\t', 1)
    entry = {'path': path, 'mode': '100644', 'type': 'blob'}
    if status == 'D':
        entry['sha'] = None
    else:
        entry['content'] = git('show', 'HEAD:' + path)
    entries.append(entry)
print(json.dumps({'message': git('log', '-1', '--format=%s').strip(), 'elements': entries}))
