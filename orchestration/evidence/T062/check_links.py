#!/usr/bin/env python3
"""T062: check that every relative href/src in docs/play/judges.html and docs/play/guide.html resolves to a file
inside docs/play/, that in-page #anchors exist, and that no owned file has git conflict markers.
Run from the repository root:  python orchestration/evidence/T062/check_links.py"""
import os, re, sys
from urllib.parse import urlsplit, unquote

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), '..', '..', '..'))
os.chdir(ROOT)
PLAY = os.path.abspath('docs/play')
bad = 0
for page in ['docs/play/judges.html', 'docs/play/guide.html']:
    src = open(page, encoding='utf-8').read()
    ids = set(re.findall(r'\sid="([^"]+)"', src))
    refs = re.findall(r'\s(?:href|src)="([^"]+)"', src)
    n_rel = n_ext = n_anchor = 0
    for r in refs:
        u = urlsplit(r)
        if u.scheme in ('http', 'https', 'mailto'):
            n_ext += 1
            continue
        if not u.path:
            n_anchor += 1
            if u.fragment and u.fragment not in ids:
                print(f'BROKEN anchor {page}: {r}'); bad += 1
            continue
        n_rel += 1
        target = os.path.abspath(os.path.join(os.path.dirname(page), unquote(u.path)))
        if os.path.isdir(target):
            target = os.path.join(target, 'index.html')
        if not target.startswith(PLAY + os.sep) or not os.path.isfile(target):
            print(f'BROKEN link {page}: {r} -> {os.path.relpath(target, ROOT)}'); bad += 1
    print(f'{page}: {n_rel} relative links/images, {n_anchor} in-page anchors, {n_ext} external links (not fetched)')

OWNED = ['RELEASE.md', 'JUDGES.md', 'README.md', 'GUIDE.md', 'submission/PROJECT_DESCRIPTION.md',
         'docs/play/judges.html', 'docs/play/guide.html']
for f in OWNED + [os.path.join('orchestration/evidence/T062', x) for x in os.listdir('orchestration/evidence/T062')
                if x.endswith(('.md', '.py'))]:
    for n, line in enumerate(open(f, encoding='utf-8'), 1):
        if re.match(r'^(<{7}|={7}|>{7})( |$)', line):
            print(f'CONFLICT MARKER {f}:{n}'); bad += 1
print('conflict markers: none' if bad == 0 else f'{bad} problem(s)')
sys.exit(1 if bad else 0)
