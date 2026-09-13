"""Map physical sensory modalities to retained, annotated receptor neurons."""
from pathlib import Path
import gzip,hashlib,json
import numpy as np
import pandas as pd
ROOT=Path(__file__).resolve().parents[1];out=ROOT/'dist/assets/connectome'
a=pd.read_feather(ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather')
a=a[a.superclass.notna() & (a.status!='Glia')].sort_values('bodyId').reset_index(drop=True)
n=len(a);m=json.loads((out/'manifest.json').read_text());assert n==m['neurons']
load=lambda name,dtype:np.frombuffer(gzip.decompress((out/name).read_bytes()),dtype)
assert np.array_equal(a.bodyId.to_numpy(),load(m['nodes']['ids']['file'],np.uint32)), 'Annotation order must match the retained graph'
rows=load(m['nodes']['rows']['file'],np.uint32);coords=load('centroids.bin.gz',np.float32).reshape(-1,3)
photo=(a.superclass=='ol_sensory').to_numpy() & a.rootSide.isin(['L','R']).to_numpy()
hex_valid=a.assignedOlHex1.notna().to_numpy() & a.assignedOlHex2.notna().to_numpy()
q=a.assignedOlHex1.fillna(0).to_numpy(float);r=a.assignedOlHex2.fillna(0).to_numpy(float)
weight_sum=np.zeros(n);q_sum=np.zeros(n);r_sum=np.zeros(n)
for part in m['parts']:
 pre=load(part['pre']['file'],np.uint32);w=load(part['weight']['file'],np.uint16)
 post=np.searchsorted(rows,np.arange(part['start'],part['start']+part['count']),side='right')-1
 keep=photo[pre]&hex_valid[post];i=pre[keep];v=w[keep].astype(float);j=post[keep]
 np.add.at(weight_sum,i,v);np.add.at(q_sum,i,v*q[j]);np.add.at(r_sum,i,v*r[j])
known=photo&(weight_sum>0);q_known=np.divide(q_sum,weight_sum,out=np.zeros(n),where=weight_sum>0);r_known=np.divide(r_sum,weight_sum,out=np.zeros(n),where=weight_sum>0)
# Unlabelled retinal terminals borrow a column only from the nearest measured
# photoreceptor endpoint in the same eye. The report marks this approximation.
inferred=[]
for side in ['L','R']:
 good=np.flatnonzero(known & (a.rootSide==side).to_numpy());missing=np.flatnonzero(photo & ~known & (a.rootSide==side).to_numpy())
 assert len(good)>0
 for i in missing:
  distance=((coords[good]-coords[i])**2).sum(axis=1);j=good[np.argmin(distance)];q_known[i]=q_known[j];r_known[i]=r_known[j];inferred.append(int(i))
channel=np.full(n,-1,np.int16);polarity=np.ones(n,np.int8);eye_ranges={};width,height=32,24
for eye,side in enumerate(['L','R']):
 ids=np.flatnonzero(photo & (a.rootSide==side).to_numpy());x=q_known[ids]-.5*r_known[ids];y=r_known[ids]*np.sqrt(3)/2
 xmin,xmax=x.min(),x.max();ymin,ymax=y.min(),y.max();u=np.clip(np.rint((x-xmin)/(xmax-xmin)*(width-1)),0,width-1).astype(int);v=np.clip(np.rint((y-ymin)/(ymax-ymin)*(height-1)),0,height-1).astype(int)
 if side=='L':u=width-1-u
 channel[ids]=eye*width*height+v*width+u;eye_ranges[side]={'neurons':int(len(ids)),'directColumnEvidence':int(known[ids].sum()),'borrowedNearestColumn':int((~known[ids]).sum()),'distinctPixels':int(len(np.unique(channel[ids]))),'hexProjectionBounds':[float(xmin),float(xmax),float(ymin),float(ymax)]}
counts={};body_offset=width*height*2
for i,row in a.iterrows():
 if photo[i]:continue
 cls=str(row['class']);sub=str(row['subclass']);nerve=str(row.entryNerve);side=str(row.rootSide);choices=[]
 if cls=='olfactory' and row.type in ['ORN_DM1','ORN_DA2'] and side in ['L','R']:
  choices=[(18 if row.type=='ORN_DM1' else 20)+(side=='R')]
 elif cls=='mechanosensory_proprioceptive':
  if sub=='haltere':choices=[10,11,12]
  elif 'Pro' in nerve:choices=[0] if side=='L' else [1,2] if side=='R' else []
  elif 'Meso' in nerve:choices=[8] if side=='L' else [6,7] if side=='R' else []
  elif 'Meta' in nerve:choices=[3,5] if side=='L' else [4,5] if side=='R' else []
  elif sub=='campaniform sensilla':choices=[13,14,15]
  elif nerve=='PrN':choices=[9]
 elif cls=='mechanosensory_tactile':choices=[16]
 elif cls=='mechanosensory' and sub=='wind_gravity':choices=[13,14,15]
 elif cls=='mechanosensory' and sub=='auditory':choices=[17]
 if choices:
  c=choices[i%len(choices)];channel[i]=body_offset+c;polarity[i]=-1 if c<16 and (i//len(choices))%2 else 1;counts[cls]=counts.get(cls,0)+1
# Keep unknown modalities without invented direct stimulation. All still compute.
for name,arr in [('receptor-channels',channel),('receptor-polarity',polarity)]:
 raw=arr.tobytes();(out/(name+'.bin.gz')).write_bytes(gzip.compress(raw,mtime=0))
report={'schema':'retina-body-1558-v1','retina':{'width':width,'height':height,'eyes':eye_ranges,'channels':1536,'mapping':'Synapse-weighted assigned optic-column coordinates, projected to each eye; nearest measured same-eye photoreceptor endpoint when direct column evidence is missing. Image axes and camera calibration are model choices.'},'bodyChannels':22,'directlyDrivenNeurons':int((channel>=0).sum()),'modalityCounts':{'photoreceptors':int(photo.sum()),**counts},'source':'MaleCNS v1.0 body annotations and measured directed connections','sourceSHA256':hashlib.sha256((ROOT/'data/body-annotations-male-cns-v1.0-minconf-0.5.feather').read_bytes()).hexdigest(),'unmappedNeurons':int((channel<0).sum()),'limitations':['Photoreceptor grayscale encoding does not model colour/UV receptor spectra.','Within-class body response directions and control associations are authored, not measured tuning curves.','Normalized odor exposure models receptor stimulation, not molecular concentration or pharmacology.','Unknown sensory modalities receive no invented direct signal; every retained neuron and edge still participates.'],'olfaction':{'ethylAcetate':{'target':'ORN_DM1 / Or42b','source':'https://pubmed.ncbi.nlm.nih.gov/28670618/'},'geosmin':{'target':'ORN_DA2 / Or56a','source':'https://www.nature.com/articles/srep21841'}}}
report['routingFiles']={name:{'sha256':hashlib.sha256(arr.tobytes()).hexdigest(),'elementType':'int16'if name=='receptor-channels'else'int8'}for name,arr in [('receptor-channels',channel),('receptor-polarity',polarity)]}
report['limitations'].append('The inherited rate model defaults histamine and unknown transmitters to an excitatory sign; receptor-specific physiology is not implemented.')
(out/'sensory-map.json').write_text(json.dumps(report,indent=2)+'\n');print(json.dumps(report))
