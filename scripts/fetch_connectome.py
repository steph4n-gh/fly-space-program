"""Download the published MaleCNS v1.0 tables; retain exact hashes."""
from pathlib import Path
import concurrent.futures, hashlib, json, urllib.request

ROOT = Path(__file__).resolve().parents[1]
BASE = 'https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'
FILES = ['body-annotations-male-cns-v1.0-minconf-0.5.feather', 'body-neurotransmitters-male-cns-v1.0.feather', 'connectome-weights-male-cns-v1.0-minconf-0.5.feather']

def fetch(name):
    p = ROOT / 'data' / name
    p.parent.mkdir(exist_ok=True)
    if not p.exists():
        print('Downloading', name, flush=True)
        temp = p.with_suffix('.partial')
        urllib.request.urlretrieve(BASE + name, temp)
        temp.replace(p)
    with p.open('rb') as f:
        sha = hashlib.file_digest(f, 'sha256').hexdigest()
    print(name, p.stat().st_size, sha, flush=True)
    return name, {'url': BASE + name, 'sha256': sha, 'bytes': p.stat().st_size}

if __name__ == '__main__':
    with concurrent.futures.ThreadPoolExecutor(max_workers=3) as pool:
        sources = dict(pool.map(fetch, FILES))
    (ROOT / 'scripts' / 'source-lock.json').write_text(json.dumps(sources, indent=2) + '\n')
