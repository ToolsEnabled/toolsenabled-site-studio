#!/usr/bin/env python3
"""Build a byte-reproducible, dependency-free Site Studio ZIP."""
import argparse
import hashlib
import json
from pathlib import Path, PurePosixPath
import zipfile

ROOT = Path(__file__).resolve().parent.parent

def build(output: Path):
    members = json.loads((ROOT / 'tools/package-files.json').read_text())
    if members != sorted(set(members)):
        raise ValueError('package manifest must be unique and sorted')
    payloads = {}
    for name in members:
        rel = PurePosixPath(name)
        if rel.is_absolute() or '..' in rel.parts or '\\' in name:
            raise ValueError('unsafe package member: ' + name)
        file = ROOT / name
        if any(p.is_symlink() for p in [file, *file.parents] if p != ROOT.parent):
            raise ValueError('linked package member: ' + name)
        if not file.is_file():
            raise ValueError('missing package member: ' + name)
        payloads[name] = file.read_bytes()
    payloads['MANIFEST.sha256'] = ''.join(
        hashlib.sha256(data).hexdigest() + '  ' + name + '\n'
        for name, data in sorted(payloads.items())
    ).encode()
    output = output.resolve()
    output.parent.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(output, 'w', compression=zipfile.ZIP_STORED) as archive:
        for name, data in sorted(payloads.items()):
            info = zipfile.ZipInfo('site-studio/' + name, date_time=(2026, 1, 1, 0, 0, 0))
            info.create_system = 3
            info.external_attr = (0o100644 << 16)
            info.compress_type = zipfile.ZIP_STORED
            archive.writestr(info, data)
    return {'archive': output.name, 'members': len(payloads), 'bytes': output.stat().st_size,
            'sha256': hashlib.sha256(output.read_bytes()).hexdigest()}

if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--output', type=Path, required=True)
    args = parser.parse_args()
    print(json.dumps(build(args.output), sort_keys=True))
