"""把各部分拼成最终意见书：按 01~10 顺序重排第三节，并附录 A 拼接。
用法: python assemble.py
"""
import re
from pathlib import Path

DOC = Path(r'D:\游戏\_doc')
main = (DOC / '意见书.md').read_text(encoding='utf-8')

# 1) 拆出「三、逐款修改与优化建议」里的各款小节
m = re.search(r'(?ms)^## 三、逐款修改与优化建议\s*\n(.*?)(?=^## 四、)', main)
if not m:
    raise SystemExit('找不到第三节')
sec3_body = m.group(1)

blocks = {}
for mm in re.finditer(r'(?ms)^### (3\.\d+) (\d\d) ([^\n]*)\n(.*?)(?=^### 3\.\d+ |\Z)', sec3_body):
    num = mm.group(2)
    blocks[num] = mm.group(4).rstrip() + '\n\n'

def clean(t):
    """去掉小节末尾多余的分隔线与空行"""
    lines = t.rstrip().split('\n')
    while lines and (not lines[-1].strip() or re.match(r'^-{3,}$', lines[-1].strip())):
        lines.pop()
    return '\n'.join(lines).rstrip() + '\n\n'

# 2) 外部小节（01 / 02 / 08 / 10）覆盖进来
def from_file(fn):
    t = (DOC / fn).read_text(encoding='utf-8')
    b = re.search(r'(?ms)^### 3\.\d+ \d\d [^\n]*\n(.*)\Z', t)
    return (b.group(1).rstrip() + '\n\n') if b else None

for num, fn in (('01', 'sec01.md'), ('02', 'sec02.md'), ('08', 'sec08.md'), ('10', 'sec10.md')):
    if (DOC / fn).exists():
        v = from_file(fn)
        if v:
            blocks[num] = v
            print(f'  引入 {fn} -> {num}')

TITLES = {
    '01': '01 余烬之城 · 多结局剧情冒险',
    '02': '02 星火拓荒 · 无尽之地',
    '03': '03 拓城记 · 中古殖民模拟',
    '04': '04 深渊词条 · 肉鸽打宝',
    '05': '05 幻境争锋 · 战棋自走棋',
    '06': '06 回声 Echo · 声音解谜冒险',
    '07': '07 镜像迷城 · Mirror Maze',
    '08': '08 时间碎片 · Time Shards',
    '09': '09 星穹拓荒 · Stellar Frontier',
    '10': '10 情绪花园 · Emotion Garden',
}

missing = [k for k in TITLES if k not in blocks]
if missing:
    raise SystemExit('缺少小节: ' + ','.join(missing))

new_sec3 = '## 三、逐款修改与优化建议\n\n'
for i, num in enumerate(sorted(TITLES), start=1):
    new_sec3 += f'### 3.{i} {TITLES[num]}\n\n' + clean(blocks[num])
new_sec3 += '---\n\n'

main = main[:m.start()] + new_sec3 + main[m.end():]

# 3) 附录 A / B 拼到末尾
for fn, mark in (('附录A.md', '附录 A：本意见书所依据的已修复问题清单'),
                 ('附录B.md', '附录 B：十款游戏实测数据')):
    p = DOC / fn
    if not p.exists():
        print(f'  （跳过 {fn}：不存在）'); continue
    apx = p.read_text(encoding='utf-8').lstrip('\n')
    if mark not in main:
        main = main.rstrip() + '\n\n' + apx
        print(f'  追加 {fn}')

(DOC / '意见书_final.md').write_text(main, encoding='utf-8')

cn = len(re.findall(r'[\u4e00-\u9fff]', main))
print(f'已生成 意见书_final.md：中文字符 {cn}，总字符 {len(main)}')
for i, num in enumerate(sorted(TITLES), start=1):
    c = len(re.findall(r'[\u4e00-\u9fff]', blocks[num]))
    print(f'  3.{i} ({num}) {TITLES[num][:18]:<20} {c:>5} 字')
