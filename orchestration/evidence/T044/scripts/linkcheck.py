import re, sys, os, json, urllib.request, urllib.parse, concurrent.futures, glob
root = sys.argv[1]
files = [os.path.join(root,f) for f in ["README.md","JUDGES.md","RELEASE.md"]] + sorted(glob.glob(root+"/submission/*.md")) + sorted(glob.glob(root+"/docs/play/*.html"))
local, ext = [], {}
md = re.compile(r'\]\(([^)\s]+)(?:\s+"[^"]*")?\)')
href = re.compile(r'''(?:href|src)=["']([^"']+)["']''')
for f in files:
    t = open(f, encoding='utf-8', errors='replace').read()
    links = md.findall(t) if f.endswith('.md') else href.findall(t)
    if f.endswith('.md'): links += re.findall(r'<(https?://[^>\s]+)>', t)
    for l in links:
        if l.startswith(('mailto:','javascript:','data:','#')): continue
        if l.startswith(('http://','https://')):
            ext.setdefault(l.split('#')[0], []).append(os.path.relpath(f,root)); continue
        p = urllib.parse.unquote(l.split('#')[0].split('?')[0])
        if not p: continue
        base = os.path.dirname(f)
        target = os.path.join(root, p.lstrip('/')) if p.startswith('/') else os.path.normpath(os.path.join(base,p))
        local.append((os.path.relpath(f,root), l, os.path.exists(target)))
print("LOCAL", len(local), "bad", sum(1 for x in local if not x[2]))
for f,l,ok in local:
    if not ok: print("  MISSING", f, "->", l)
def chk(u):
    for m in ("HEAD","GET"):
        try:
            r = urllib.request.Request(u, method=m, headers={"User-Agent":"Mozilla/5.0 linkcheck"})
            with urllib.request.urlopen(r, timeout=20) as resp: return u, resp.status
        except urllib.error.HTTPError as e:
            if m=="GET": return u, e.code
        except Exception as e:
            if m=="GET": return u, str(e)[:60]
with concurrent.futures.ThreadPoolExecutor(8) as ex: res = list(ex.map(chk, ext))
print("EXTERNAL", len(res), "non-200", sum(1 for u,s in res if s!=200))
for u,s in res:
    print(" ", s, u, "|", ",".join(sorted(set(ext[u]))))
