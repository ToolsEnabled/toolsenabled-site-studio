#!/usr/bin/env python3
"""Stage the reviewed package allowlist and pack it with the supplied offline mcpb 2.1.2 CLI."""
import argparse
import hashlib
import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile

ROOT = Path(__file__).resolve().parent.parent

def build(cli, output):
    cli = cli.resolve(strict=True)
    version = subprocess.check_output(['node', str(cli), '--version'], text=True).strip()
    if version != '2.1.2':
        raise ValueError('Expected mcpb CLI 2.1.2, got ' + version)
    members = json.loads((ROOT / 'tools/package-files.json').read_text())
    if 'server.json' in members:
        raise ValueError('Registry metadata belongs outside plugin artifacts')
    if members != sorted(set(members)):
        raise ValueError('Package allowlist must be sorted and unique')
    for name in members:
        rel = Path(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name:
            raise ValueError('Unsafe package path: ' + name)
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    env = dict(os.environ, SOURCE_DATE_EPOCH='1767225600', TZ='UTC')
    env.pop('DISPLAY', None)
    with tempfile.TemporaryDirectory(prefix='site-studio-mcpb-') as temp:
        stage = Path(temp)
        for name in sorted(set(members)):
            source = ROOT / name
            if source.is_symlink() or any((ROOT / p).is_symlink() for p in source.relative_to(ROOT).parents if p != Path('.')):
                raise ValueError('Symlink refused: ' + name)
            target = stage / name
            target.parent.mkdir(parents=True, exist_ok=True)
            shutil.copyfile(source, target)
            target.chmod(0o644)
        subprocess.run(['node', '--require', str(ROOT / 'tools/mcpb-clock.cjs'), str(cli), 'pack', str(stage), str(output)], env=env, check=True)
    return {'archive': output.name, 'sha256': hashlib.sha256(output.read_bytes()).hexdigest(), 'bytes': output.stat().st_size, 'mcpb': version, 'sourceDateEpoch': env['SOURCE_DATE_EPOCH'], 'signed': False}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--mcpb-cli', type=Path, required=True)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.mcpb_cli, args.output), sort_keys=True))
