#!/usr/bin/env python3
"""Apply exact string replacements to a CRLF file while preserving CRLF.

Usage: python3 scripts/patch_crlf.py <target_file> <old_file> <new_file>
Both old/new files are read as raw text; their newlines are normalised to CRLF
so the surrounding file keeps its CRLF line endings.
"""
import sys


def to_crlf(text: str) -> str:
    return text.replace('\r\n', '\n').replace('\n', '\r\n')


def main() -> int:
    target, old_file, new_file = sys.argv[1], sys.argv[2], sys.argv[3]
    with open(target, 'rb') as f:
        data = f.read().decode('utf-8')
    with open(old_file, 'r', encoding='utf-8') as f:
        old = to_crlf(f.read())
    with open(new_file, 'r', encoding='utf-8') as f:
        new = to_crlf(f.read())

    count = data.count(old)
    if count != 1:
        print(f'ERROR: expected exactly 1 occurrence, found {count}')
        return 1
    data = data.replace(old, new)
    with open(target, 'wb') as f:
        f.write(data.encode('utf-8'))
    print('OK: patched 1 occurrence')
    return 0


if __name__ == '__main__':
    sys.exit(main())
