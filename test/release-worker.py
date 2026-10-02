import hashlib,importlib.util,io,json,subprocess,tempfile,zipfile
from pathlib import Path
from unittest.mock import patch
root=Path(__file__).resolve().parent.parent
spec=importlib.util.spec_from_file_location('release',root/'tools/generate-release.py');module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
with tempfile.TemporaryDirectory(prefix='site-studio-release-') as temp:
 work=Path(temp);repo=work/'source';repo.mkdir()
 def git(*args):return subprocess.check_output(['git',*args],cwd=repo,stderr=subprocess.DEVNULL)
 git('init');git('config','user.name','Synthetic release test');git('config','user.email','test@example.invalid')
 manifest={'name':'toolsenabled-site-studio','version':'0.1.2','description':json.loads((root/'.claude-plugin/plugin.json').read_text())['description']}
 (repo/'.claude-plugin').mkdir();(repo/'.claude-plugin/plugin.json').write_text(json.dumps(manifest));(repo/'manifest.json').write_text(json.dumps(manifest));(repo/'mcp-web.js').write_text('reviewed runtime\n');(repo/'tools').mkdir();members=['.claude-plugin/plugin.json','manifest.json','mcp-web.js','tools/package-files.json'];(repo/'tools/package-files.json').write_text(json.dumps(members));git('add','.');git('commit','-m','Synthetic source')
 tree=git('rev-parse','HEAD^{tree}').decode().strip()
 commit=git('rev-parse','HEAD').decode().strip();tag='v0.1.2';repository='https://github.com/ToolsEnabled/toolsenabled-site-studio';url=repository+'/releases/download/'+tag+'/test.mcpb'
 payload=io.BytesIO()
 with zipfile.ZipFile(payload,'w') as z:
  for member in members:z.writestr(member,(repo/member).read_bytes())
 data=payload.getvalue()+b'MCPB_SIG_END';signed=work/'test.mcpb';signed.write_bytes(data)
 reviewed='Edit static sites in a private working copy with preview, checkpoints and human-controlled export.'
 original=subprocess.check_output
 def command(args,**kwargs):
  if args[:2]==['git','ls-remote']:return commit+'\trefs/tags/'+tag+'\n'
  return original(args,**kwargs)
 with patch.object(module.subprocess,'check_output',side_effect=command),patch.object(module.urllib.request,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(data)):
  try:module.generate(repo,repository,tag,commit,signed,url,work/'missing-description',expected_tree=tree)
  except ValueError as e:assert 'description' in str(e)
  else:raise AssertionError('overlong description was silently shortened')
  try:module.generate(repo,repository,tag,commit,signed,url,work/'wrong-tree',description=reviewed,expected_tree='0'*40)
  except ValueError as e:assert 'tree' in str(e)
  else:raise AssertionError('unreviewed tree accepted')
  result=module.generate(repo,repository,tag,commit,signed,url,work/'good',description=reviewed,expected_tree=tree);assert result['sourceCommit']==commit and result['remoteTagVerified']
  entry=json.loads((work/'good/marketplace-entry.json').read_text());assert entry['source']=={'source':'github','repo':'ToolsEnabled/toolsenabled-site-studio','ref':tag,'sha':commit}
  registry=json.loads((work/'good/server.json').read_text());assert registry['packages'][0]['fileSha256']==hashlib.sha256(data).hexdigest();assert registry['description']==reviewed and 1<=len(registry['description'])<=100,'Use the complete reviewed Registry description verbatim'
  try:module.generate(repo,repository,tag,'0'*40,signed,url,work/'wrong-commit',expected_tree=tree)
  except ValueError as e:assert 'Remote tag' in str(e)
  else:raise AssertionError('unpublished commit accepted')
 with patch.object(module.subprocess,'check_output',side_effect=command),patch.object(module.urllib.request,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(b'wrong bytes')):
  try:module.generate(repo,repository,tag,commit,signed,url,work/'wrong-bytes',description=reviewed,expected_tree=tree)
  except ValueError as e:assert 'Downloaded release bytes' in str(e)
  else:raise AssertionError('different download accepted')
 for label,change in [('changed',{'mcp-web.js':b'unreviewed runtime'}),('extra',{'extra.js':b'not reviewed'}),('missing',{'mcp-web.js':None})]:
  payload=io.BytesIO()
  with zipfile.ZipFile(payload,'w') as z:
   for name in [*members,*[n for n in change if n not in members]]:
    value=change.get(name,(repo/name).read_bytes() if (repo/name).exists() else b'')
    if value is not None:z.writestr(name,value)
  bad=payload.getvalue()+b'MCPB_SIG_END';badfile=work/(label+'.mcpb');badfile.write_bytes(bad)
  with patch.object(module.subprocess,'check_output',side_effect=command),patch.object(module.urllib.request,'urlopen',side_effect=lambda *a,**kw:io.BytesIO(bad)):
   try:module.generate(repo,repository,tag,commit,badfile,url,work/label,description=reviewed,expected_tree=tree)
   except ValueError as e:assert 'bundle' in str(e).lower()
   else:raise AssertionError('unreviewed bundle accepted: '+label)
 assert not (work/'wrong-commit').exists() and not (work/'wrong-bytes').exists()
print('Pushed tag, sidecar digest, pinned entry and two refusal checks PASS; signature trust is a separate gate.')
