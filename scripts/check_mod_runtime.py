"""Validate JSON, pinned schemas, preserved source, generated build, and JS syntax."""
import hashlib
import json
import re
import subprocess
import tempfile
from pathlib import Path

from jsonschema import Draft202012Validator
from build_mod_runtime import BASE, OUTPUT, ROOT, build


def unique(pairs):
    result = {}
    for key, value in pairs:
        if key in result:
            raise ValueError('Duplicate JSON key: ' + key)
        result[key] = value
    return result


def reject(value):
    raise ValueError('Invalid JSON number: ' + value)


def main():
    jsons = {path: json.loads(path.read_text(), object_pairs_hook=unique, parse_constant=reject)
             for path in ROOT.rglob('*.json') if '.git' not in path.parts}
    schema = jsons[ROOT / 'src/mod-runtime/mod.schema.json']
    catalog = jsons[ROOT / 'src/mod-runtime/catalog.schema.json']
    for item in (schema, catalog):
        Draft202012Validator.check_schema(item)
    for path, data in jsons.items():
        if path.parent.name == 'fixtures':
            Draft202012Validator(schema).validate(data)
    original = subprocess.check_output(['git', 'show', 'HEAD:src/guy_fights_0.2.2.html'], cwd=ROOT)
    assert BASE.read_bytes() == original, 'Original game source changed'
    expected = OUTPUT.read_bytes()
    build()
    assert OUTPUT.read_bytes() == expected, 'Generated game was stale; review rebuilt output and rerun'
    for path in (ROOT / 'src/mod-runtime').glob('*.js'):
        subprocess.run(['node', '--check', str(path)], check=True)
        source = path.read_text()
        assert not re.search(r'\beval\s*\(|new\s+Function\s*\(', source), 'Executable string API in mod runtime'
    with tempfile.TemporaryDirectory() as tmp:
        scripts = re.findall(r'<script[^>]*>(.*?)</script>', expected.decode(), re.S)
        assert len(scripts) == 2
        for index, source in enumerate(scripts):
            path = Path(tmp) / f'script-{index}.js'
            path.write_text(source)
            subprocess.run(['node', '--check', str(path)], check=True)
    print(f'Validated {len(jsons)} JSON files, both schemas, all runtime and assembled JS, deterministic build, and unchanged 0.2.2 source.')
    print('Original SHA-256:', hashlib.sha256(original).hexdigest())


if __name__ == '__main__':
    main()
