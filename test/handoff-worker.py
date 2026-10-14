import gzip,hashlib,importlib.util,io,subprocess,sys,tarfile,tempfile,zipfile,zlib
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sys.dont_write_bytecode=True # load tools/*.py without leaving __pycache__ in the plugin folder
spec=importlib.util.spec_from_file_location('handoff',root/'tools/handoff.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='site-studio-handoff-') as temp:
 work=Path(temp);source=work/'packet';source.mkdir();(source/'readme.txt').write_text('Synthetic public packet')
 public=work/'scanner-source';public.mkdir()
 for filename in ['tools/handoff.py','test/handoff-worker.py']:(public/Path(filename).name).write_bytes((root/filename).read_bytes())
 assert module.scan(public)['privateKeyHeaders']==0
 for marker in [b'-----BEGIN '+kind+b'PRIVATE KEY'+suffix for kind,suffix in [(b'',b'-----'),(b'RSA ',b'-----'),(b'EC ',b'-----'),(b'DSA ',b'-----'),(b'OPENSSH ',b'-----'),(b'ENCRYPTED ',b'-----'),(b'PGP ',b' BLOCK-----')]]+[b'---- BEGIN SSH2 ENCRYPTED '+b'PRIVATE KEY ----']:
  assert module.KEY.search(marker), 'private-key format was not detected'
 def manifest():
  (source/'SHA256SUMS').write_text(''.join(hashlib.sha256(p.read_bytes()).hexdigest()+'  '+p.name+'\n' for p in sorted(source.iterdir()) if p.name!='SHA256SUMS'))
 def refused(fn,phrase):
  try:fn()
  except ValueError as e:assert phrase in str(e)
  else:raise AssertionError('unsafe packet accepted')
 manifest();receipt=module.copy_packet(source,work/'copy');assert receipt['copiedByInventory']==1;module.inventory(work/'copy')
 (source/'unlisted.txt').write_text('not in inventory');refused(lambda:module.copy_packet(source,work/'unlisted-copy'),'unlisted');(source/'unlisted.txt').unlink()
 key=b'-----BEGIN '+b'PRIVATE KEY-----\nsynthetic marker only\n'
 for ext in ['zip','mcpb']:
  archive=source/('nested.'+ext)
  with zipfile.ZipFile(archive,'w',compression=zipfile.ZIP_DEFLATED) as z:z.writestr('hidden.txt',key)
  manifest();refused(lambda:module.copy_packet(source,work/('bad-'+ext)),'private-key header');archive.unlink()
 for suffix,mode in [('tar.gz','w:gz'),('tgz','w:gz'),('tar.bz2','w:bz2'),('tar.xz','w:xz'),('opaque.bin','w:gz')]:
  archive=source/('compressed.'+suffix)
  with tarfile.open(archive,mode) as t:
   info=tarfile.TarInfo('hidden.txt');info.size=len(key);t.addfile(info,io.BytesIO(key))
  refused(lambda:module.scan(source),'private-key header');archive.unlink()
 for name,data,reason in [('gzip.bin',gzip.compress(key),'private-key header'),('zstd.bin',bytes.fromhex('28b52ffd')+b'unsupported','archive'),('loose.bin',zlib.compress(b'blob '+str(len(key)).encode()+b'\0'+key),'archive'),('pack.bin',b'PACK'+bytes(16),'archive')]:
  archive=source/name;archive.write_bytes(data);refused(lambda:module.scan(source),reason);archive.unlink()
 gitdir=source/'.git';gitdir.mkdir();(gitdir/'config').write_text('synthetic')
 refused(lambda:module.scan(source),'git');(gitdir/'config').unlink();gitdir.rmdir()
 (source/'unexpected.txt').write_bytes(key);refused(lambda:module.scan(source),'private-key header');(source/'unexpected.txt').unlink()
 repo=work/'git';repo.mkdir()
 def git(*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL)
 git('init');git('config','user.name','Synthetic packet test');git('config','user.email','test@example.invalid');(repo/'hidden.txt').write_bytes(key);git('add','.');git('commit','-m','Synthetic marker')
 git('bundle','create',str(source/'test.bundle'),'HEAD');manifest();refused(lambda:module.copy_packet(source,work/'bad-git'),'private-key header')
 # A nested bundle is compressed Git data, not an ordinary inspected blob.
 inner=(source/'test.bundle').read_bytes();(source/'test.bundle').unlink()
 outer=work/'outer';outer.mkdir();(outer/'nested.bundle').write_bytes(inner)
 def outer_git(*args):return subprocess.check_output(['git',*args],cwd=outer,stderr=subprocess.DEVNULL)
 outer_git('init');outer_git('config','user.name','Synthetic packet test');outer_git('config','user.email','test@example.invalid');outer_git('add','.');outer_git('commit','-m','Nested bundle fixture')
 outer_git('bundle','create',str(source/'outer.bundle'),'HEAD');refused(lambda:module.scan(source),'nested or disguised Git archive')
print('Inventory copy, unlisted-file refusal, compressed ZIP/mcpb keys, whole-tree and reachable Git blob scan PASS.')
