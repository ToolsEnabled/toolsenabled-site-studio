#!/usr/bin/env python3
"""Verify, scan and copy a handoff exclusively through its SHA256SUMS inventory."""
import argparse
import bz2
import gzip
import lzma
import hashlib
import io
import json
import re
import shutil
import subprocess
import tarfile
import tempfile
import zipfile
from pathlib import Path, PurePosixPath

MAX_FILE = 64 * 1024 * 1024
MAX_EXPANDED = 512 * 1024 * 1024
KEY = re.compile(rb'-----BEGIN (?:[A-Z0-9]+ )*PRIVATE KEY(?: BLOCK)?-----|'
                 rb'---- BEGIN SSH2 ENCRYPTED ' rb'PRIVATE KEY ----')

def safe_name(name):
    p = PurePosixPath(name)
    if p.as_posix() != name.rstrip('/') or not name or p.is_absolute() or '..' in p.parts or '\\' in name or '\n' in name or '\r' in name or ':' in name:
        raise ValueError('unsafe inventory/archive path')
    if any(part.lower() == '.git' for part in p.parts):
        raise ValueError('raw .git paths refused; transfer a scanned Git bundle')
    return p

def files(root):
    if root.is_symlink() or not root.is_dir():
        raise ValueError('root must be a real directory')
    result = []
    for p in sorted(root.rglob('*')):
        if p.is_symlink():
            raise ValueError('symlink refused: ' + str(p.relative_to(root)))
        if p.is_dir():
            continue
        if not p.is_file():
            raise ValueError('non-regular file refused')
        safe_name(p.relative_to(root).as_posix())
        result.append(p)
    return result

def scan(root):
    counters = {'files': 0, 'archiveMembers': 0, 'gitBlobs': 0, 'bytesInspected': 0}
    def inspect(data, name, depth=0):
        if depth > 5 or len(data) > MAX_FILE:
            raise ValueError('scan bound exceeded: ' + name)
        counters['bytesInspected'] += len(data)
        if counters['bytesInspected'] > MAX_EXPANDED:
            raise ValueError('expanded scan bound exceeded')
        if KEY.search(data):
            raise ValueError('private-key header refused: ' + name)
        buffer = io.BytesIO(data)
        decoder = gzip.GzipFile if data.startswith(bytes.fromhex('1f8b')) else bz2.BZ2File if data.startswith(b'BZh') else lzma.LZMAFile if data.startswith(bytes.fromhex('fd377a585a00')) else None
        if decoder:
            try:
                with (decoder(fileobj=buffer, mode='rb') if decoder is gzip.GzipFile else decoder(buffer, 'rb')) as stream:
                    expanded = stream.read(MAX_FILE + 1)
            except (OSError, EOFError, lzma.LZMAError) as error:
                raise ValueError('uninspectable compressed archive: ' + name) from error
            inspect(expanded, name + '!decompressed', depth + 1)
            return
        unsupported = [bytes.fromhex('28b52ffd'), bytes.fromhex('377abcaf271c'), b'Rar!', b'PACK']
        zlib_header = len(data) >= 2 and data[0] & 15 == 8 and data[0] >> 4 <= 7 and int.from_bytes(data[:2], 'big') % 31 == 0
        if any(data.startswith(magic) for magic in unsupported) or zlib_header:
            raise ValueError('unsupported compressed/Git archive refused: ' + name)
        if data.startswith((b'# v2 git bundle', b'# v3 git bundle')) and (depth or not name.endswith('.bundle')):
            raise ValueError('nested or disguised Git archive refused: ' + name)
        if zipfile.is_zipfile(buffer):
            with zipfile.ZipFile(buffer) as z:
                seen = set()
                for info in z.infolist():
                    safe_name(info.filename)
                    if info.filename in seen or info.file_size > MAX_FILE or info.flag_bits & 1:
                        raise ValueError('unsafe/oversize/encrypted archive member: ' + name)
                    seen.add(info.filename)
                    if (info.external_attr >> 16) & 0o170000 == 0o120000:
                        raise ValueError('archive symlink refused: ' + name)
                    if not info.is_dir():
                        counters['archiveMembers'] += 1
                        inspect(z.read(info), name + '!' + info.filename, depth + 1)
        else:
            # ZIP probing moves the cursor. Open an uncompressed tar from byte 0,
            # including old tar variants that have no ustar magic field.
            buffer.seek(0)
            try:
                archive = tarfile.open(fileobj=buffer, mode='r:')
            except tarfile.ReadError:
                archive = None
            if archive:
                with archive as t:
                    seen = set()
                    for info in t:
                        safe_name(info.name)
                        if info.name in seen or info.size > MAX_FILE or not (info.isfile() or info.isdir()):
                            raise ValueError('unsafe tar member: ' + name)
                        seen.add(info.name)
                        if info.isfile():
                            counters['archiveMembers'] += 1
                            inspect(t.extractfile(info).read(MAX_FILE + 1), name + '!' + info.name, depth + 1)
            elif name.lower().endswith(('.zip', '.mcpb', '.tar', '.tgz', '.7z', '.rar', '.gz', '.xz', '.bz2', '.zst', '.zlib', '.deflate', '.pack')):
                raise ValueError('uninspectable archive refused: ' + name)
    for p in files(root):
        if p.stat().st_size > MAX_FILE:
            raise ValueError('oversize file refused: ' + p.name)
        counters['files'] += 1
        inspect(p.read_bytes(), p.relative_to(root).as_posix())
        if p.suffix == '.bundle':
            with tempfile.TemporaryDirectory(prefix='handoff-git-scan-') as temp:
                repo = Path(temp) / 'objects.git'
                subprocess.run(['git', 'clone', '--bare', '--quiet', str(p.resolve()), str(repo)], check=True, capture_output=True)
                ids = subprocess.check_output(['git', 'rev-list', '--objects', '--all'], cwd=repo, text=True)
                for row in ids.splitlines():
                    oid = row.split(' ', 1)[0]
                    if subprocess.check_output(['git', 'cat-file', '-t', oid], cwd=repo).strip() != b'blob':
                        continue
                    size = int(subprocess.check_output(['git', 'cat-file', '-s', oid], cwd=repo))
                    if size > MAX_FILE:
                        raise ValueError('oversize git blob refused')
                    data = subprocess.check_output(['git', 'cat-file', 'blob', oid], cwd=repo)
                    counters['gitBlobs'] += 1
                    inspect(data, p.name + '!git/' + oid + '/' + (row.split(' ', 1)[1] if ' ' in row else 'blob'), depth=1)
    return {'status': 'PASS', 'privateKeyHeaders': 0, **counters}

def inventory(root):
    entries = {}
    for line in (root / 'SHA256SUMS').read_text().splitlines():
        match = re.fullmatch(r'([0-9a-f]{64})  (.+)', line)
        if not match:
            raise ValueError('invalid SHA256SUMS line')
        digest, name = match.groups()
        safe_name(name)
        if name == 'SHA256SUMS' or name in entries:
            raise ValueError('duplicate/self inventory entry')
        entries[name] = digest
    actual = {p.relative_to(root).as_posix() for p in files(root)}
    if actual != set(entries) | {'SHA256SUMS'}:
        raise ValueError('unlisted or missing packet files')
    for name, digest in entries.items():
        if hashlib.sha256((root / name).read_bytes()).hexdigest() != digest:
            raise ValueError('hash mismatch: ' + name)
    return entries

def copy_packet(source, destination):
    entries = inventory(source)
    before = scan(source)
    if destination.exists():
        raise ValueError('destination must not exist')
    destination.mkdir(parents=True, mode=0o700)
    try:
        for name in ['SHA256SUMS', *entries]:
            p = destination / name
            p.parent.mkdir(parents=True, exist_ok=True)
            # Copy only the verified inventory, never a working parent directory.
            shutil.copyfile(source / name, p)
            p.chmod(0o600)
        inventory(destination)
        after = scan(destination)
    except Exception:
        shutil.rmtree(destination)
        raise
    return {'status': 'PASS', 'copiedByInventory': len(entries), 'sourceScan': before, 'destinationScan': after,
            'inventorySha256': hashlib.sha256((destination / 'SHA256SUMS').read_bytes()).hexdigest()}

if __name__ == '__main__':
    p = argparse.ArgumentParser(description=__doc__)
    p.add_argument('action', choices=['scan', 'verify', 'copy'])
    p.add_argument('source', type=Path)
    p.add_argument('destination', type=Path, nargs='?')
    args = p.parse_args()
    if args.action == 'copy':
        if args.destination is None:
            p.error('copy requires destination')
        result = copy_packet(args.source, args.destination)
    else:
        if args.action == 'verify':
            inventory(args.source)
        result = scan(args.source)
    print(json.dumps(result, indent=2))
