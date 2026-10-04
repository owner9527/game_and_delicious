"""批量分析 _shots 下指定截图,输出紧凑指标表(不打印 ASCII 预览)。"""
import json, subprocess, sys, os
PY = r"C:\Users\32651\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe"
ANA = r"D:\游戏\_tools\analyze.py"
names = sys.argv[1:]
rows = []
for n in names:
    p = os.path.join(r"D:\游戏\_shots", n)
    out = subprocess.run([PY, ANA, p, "--json"], capture_output=True, text=True, encoding="utf-8")
    d = json.loads(out.stdout)
    rows.append({
        "file": n,
        "dom0": d["dominant"][0]["pct"], "dom_hex": d["dominant"][0]["hex"],
        "uniq": d["unique_colors_exact"], "color": d["colorfulness"],
        "ent": d["block_entropy"], "edge": d["edge_density"],
        "std": d["std_lum"], "mean": d["mean_lum"], "sat": d["saturation_mean"],
        "regions": d["region_lum_3x3"],
    })
for r in rows:
    print("%-26s dom0=%5.1f%% %s uniq=%6d color=%5.2f ent=%5.3f edge=%.4f std=%5.2f mean=%5.2f sat=%5.2f reg=%s" % (
        r["file"], r["dom0"], r["dom_hex"], r["uniq"], r["color"], r["ent"], r["edge"], r["std"], r["mean"], r["sat"],
        "/".join(str(x) for row in r["regions"] for x in row)))
with open(r"D:\游戏\_shots\01_metrics_after.json", "w", encoding="utf-8") as f:
    json.dump(rows, f, ensure_ascii=False, indent=1)
