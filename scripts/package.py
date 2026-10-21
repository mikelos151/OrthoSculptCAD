"""Package the local app + engineering sources; no toolchains, private inputs or caches."""
import argparse
import hashlib
import json
import pathlib
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--output', type=pathlib.Path)
    args = parser.parse_args()
    root = pathlib.Path(__file__).resolve().parents[1]
    output = (args.output or root.parent / 'OrthoSculptCAD-lokalny.zip').resolve()
    if output.suffix.lower() != '.zip' or root in output.parents:
        raise SystemExit('Output must be a ZIP outside the project root.')
    allowed_dirs = {'src', 'src-tauri', 'crates', 'tests', 'e2e', 'scripts', 'docs', 'dist'}
    allowed_files = {'README.md', 'THIRD_PARTY_NOTICES.txt', 'Uruchom-OrthoSculpt.cmd',
                     'package.json', 'package-lock.json', 'index.html', 'tsconfig.json',
                     'vite.config.ts', 'vitest.config.ts', 'playwright.config.ts', '.gitignore', '.gitattributes'}
    excluded = {'.git', 'node_modules', 'target', 'test-results', 'playwright-report', '__pycache__'}
    manifest_path = pathlib.Path('docs/verification/package-manifest.json')
    files = []
    for path in root.rglob('*'):
        if not path.is_file():
            continue
        rel = path.relative_to(root)
        if (rel.parts[0] not in allowed_dirs and str(rel) not in allowed_files
                or any(part in excluded for part in rel.parts)
                or path.name.endswith(('.exe', '.log', '.tsbuildinfo', '.pyc', '.zip'))
                or rel == manifest_path):
            continue
        if path.is_symlink():
            raise SystemExit('Refusing symlink in package: ' + str(rel))
        files.append(path)
    assert (root / 'dist/index.html') in files
    hashes = {p.relative_to(root).as_posix(): hashlib.sha256(p.read_bytes()).hexdigest() for p in sorted(files)}
    # Final bundle must be exactly the one exercised in the extracted-package browser smoke.
    smoke = json.loads((root / 'docs/verification/packaging.json').read_text(encoding='utf-8'))
    assert smoke['passed'] and smoke['nodeModulesAbsent']
    for name, digest in smoke['bundleHashes'].items():
        assert hashes['dist/assets/' + name] == digest, 'Re-run package smoke after changing bundle'
    manifest = {'algorithm': 'SHA-256', 'fileCountExcludingManifest': len(hashes), 'files': hashes}
    manifest_bytes = (json.dumps(manifest, ensure_ascii=False, indent=2) + '\n').encode('utf-8')
    (root / manifest_path).write_bytes(manifest_bytes)
    files.append(root / manifest_path)
    output.parent.mkdir(parents=True, exist_ok=True)
    temporary = output.with_suffix('.zip.tmp')
    with zipfile.ZipFile(temporary, 'w', compression=zipfile.ZIP_DEFLATED) as archive:
        for path in sorted(files):
            archive.write(path, 'OrthoSculptCAD/' + path.relative_to(root).as_posix())
    with zipfile.ZipFile(temporary) as archive:
        assert archive.testzip() is None
        expected = {'OrthoSculptCAD/' + name for name in hashes} | {'OrthoSculptCAD/' + manifest_path.as_posix()}
        assert set(archive.namelist()) == expected
        for name, digest in hashes.items():
            assert hashlib.sha256(archive.read('OrthoSculptCAD/' + name)).hexdigest() == digest
        assert archive.read('OrthoSculptCAD/' + manifest_path.as_posix()) == manifest_bytes
    temporary.replace(output)
    digest = hashlib.sha256(output.read_bytes()).hexdigest()
    output.with_suffix('.zip.sha256').write_text(digest + '  ' + output.name + '\n', encoding='ascii')
    print(json.dumps({'zip': str(output), 'sha256': digest, 'entries': len(files),
                      'bytes': output.stat().st_size, 'integrityVerified': True,
                      'nativeExeIncluded': False, 'nodeModulesIncluded': False}))


if __name__ == '__main__':
    main()
