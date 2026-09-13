"""Fetch the two pinned DoOR tables needed to audit the flavonoid exclusions."""
from pathlib import Path
from urllib.request import urlopen
import datetime
import hashlib
import json

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / 'artifacts/odor-interface/additional-sources'
COMMIT = 'db323a496577c4b4a72b5c2fcd1859e07521ffb5'


def main():
    DEST.mkdir(parents=True, exist_ok=True)
    lock = DEST / 'source-lock.json'
    if lock.exists():
        previous = json.loads(lock.read_text())
        assert previous['commit'] == COMMIT
        for source in previous['sources']:
            assert hashlib.sha256((ROOT / source['file']).read_bytes()).hexdigest() == source['sha256']
        print('Verified existing additional-odor source files.')
        return
    sources = []
    for name in ['Or71a.csv', 'door_dataset_info.csv']:
        url = f'https://raw.githubusercontent.com/ropensci/DoOR.data/{COMMIT}/data/{name}'
        data = urlopen(url, timeout=30).read()
        file = DEST / name
        file.write_bytes(data)
        sources.append({'url': url, 'file': str(file.relative_to(ROOT)),
                        'sha256': hashlib.sha256(data).hexdigest()})
    lock.write_text(json.dumps({'downloadUTC': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                               'commit': COMMIT, 'sources': sources}, indent=2)+'\n')
    print('Fetched the pinned additional-odor source files.')


if __name__ == '__main__':
    main()
