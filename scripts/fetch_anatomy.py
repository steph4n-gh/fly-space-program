"""Fetch the published synaptic-partner coordinates once, with provenance."""
from pathlib import Path
import hashlib,json,time,urllib.request
ROOT=Path(__file__).resolve().parents[1]
name='syn-partners-male-cns-v1.0-minconf-0.5.feather'
url='https://storage.googleapis.com/flyem-male-cns/v1.0/connectome-data/flat-connectome/'+name
path=ROOT/'data'/name
if not path.exists():
    temp=path.with_suffix('.partial');h=hashlib.sha256();total=0;last=time.monotonic()
    with urllib.request.urlopen(url,timeout=90) as response,temp.open('wb') as out:
        size=int(response.headers.get('Content-Length',0));print('Anatomy download:',size,'bytes',flush=True)
        while chunk:=response.read(4*1024*1024):
            out.write(chunk);h.update(chunk);total+=len(chunk)
            if time.monotonic()-last>20:print(round(total/1024**3,2),'GiB downloaded',flush=True);last=time.monotonic()
    temp.replace(path);digest=h.hexdigest()
else:
    with path.open('rb') as f:digest=hashlib.file_digest(f,'sha256').hexdigest()
lock=json.loads((ROOT/'scripts/source-lock.json').read_text())
lock[name]={'url':url,'bytes':path.stat().st_size,'sha256':digest}
(ROOT/'scripts/source-lock.json').write_text(json.dumps(lock,indent=2)+'\n')
print('Anatomy ready',path.stat().st_size,digest,flush=True)
