"""Cross-check: every DOM id referenced in JS/HTML must exist in the game's HTML.
Also flags duplicate ids. Usage: python idcheck.py"""
import re, sys, io, os

GAMES = {
    '1': ['余烬之城.html'],
    '2': ['index.html'], '3': ['index.html'], '4': ['index.html'], '5': ['index.html'],
    '6': ['index.html'], '7': ['index.html'], '8': ['index.html'], '9': ['index.html'], '10': ['index.html'],
}
JS_DIRS = {n: ['js'] for n in GAMES}

def read(p):
    return io.open(p, encoding='utf-8').read()

problems = []
for n, entries in GAMES.items():
    html = read(os.path.join(n, entries[0]))
    # strip inline <script> bodies: template literals there are not static DOM
    html_static = re.sub(r'<script[^>]*>.*?</script>', '', html, flags=re.S)
    defined = set(re.findall(r'id="([^"]+)"', html_static)) | set(re.findall(r"id='([^']+)'", html_static))
    all_ids = re.findall(r'id="([^"]+)"', html_static)
    seen = {}
    for i in all_ids:
        seen[i] = seen.get(i, 0) + 1
    for i, c in seen.items():
        if c > 1:
            problems.append(f'[{n}] duplicate id in HTML: #{i} x{c}')
    # referenced ids from JS files
    refs = {}
    js_files = []
    for d in JS_DIRS.get(n, []):
        dp = os.path.join(n, d)
        if os.path.isdir(dp):
            for f in os.listdir(dp):
                if f.endswith('.js'):
                    js_files.append(os.path.join(dp, f))
    js_snippets = [read(f) for f in js_files]
    # inline scripts for single-file games
    if n in ('1', '5'):
        for m in re.finditer(r'<script[^>]*>(.*?)</script>', html, re.S):
            if m.group(1).strip():
                js_snippets.append(m.group(1))
    for src_name, code in zip([os.path.basename(f) for f in js_files] + ['inline'], js_snippets):
        for m in re.finditer(r'getElementById\(\s*[\'"]([^\'"]+)[\'"]\s*\)', code):
            refs.setdefault(m.group(1), src_name)
        for m in re.finditer(r'querySelector(?:All)?\(\s*[\'"]#([A-Za-z0-9_-]+)[\'"]', code):
            refs.setdefault(m.group(1), src_name)
    # ids created dynamically via js injection: id = "..." or .id = '...'
    dyn = set(re.findall(r'id\s*=\s*[\'"]([A-Za-z0-9_-]+)[\'"]', ' '.join(js_snippets)))
    dyn |= set(re.findall(r'\.id\s*=\s*[\'"]([A-Za-z0-9_-]+)[\'"]', ' '.join(js_snippets)))
    for rid, src in sorted(refs.items()):
        if rid not in defined and rid not in dyn:
            problems.append(f'[{n}] JS({src}) references #{rid} but not found in HTML nor created in JS')

if problems:
    print('\n'.join(problems))
    print(f'\n{len(problems)} problem(s)')
    sys.exit(1)
print('All DOM id references OK')
