"""截图分析：输出客观美术指标 + ASCII 预览，用于在无图像输入能力时评估画面。
用法: python analyze.py <png> [--cols=72] [--rows=30] [--json]
"""
import sys, json, math
import numpy as np
from PIL import Image

RAMP = " .:-=+*#%@"


def load(p):
    im = Image.open(p).convert("RGB")
    return im, np.asarray(im).astype(np.float32)


def colorfulness(a):
    r, g, b = a[..., 0], a[..., 1], a[..., 2]
    rg = np.abs(r - g)
    yb = np.abs(0.5 * (r + g) - b)
    return float(math.sqrt(rg.std() ** 2 + yb.std() ** 2) + 0.3 * math.sqrt(rg.mean() ** 2 + yb.mean() ** 2))


def edge_density(lum):
    gx = np.zeros_like(lum); gy = np.zeros_like(lum)
    gx[:, 1:-1] = lum[:, 2:] - lum[:, :-2]
    gy[1:-1, :] = lum[2:, :] - lum[:-2, :]
    mag = np.hypot(gx, gy)
    return float((mag > 18).mean())


def block_entropy(a, blocks=24):
    h, w, _ = a.shape
    bh, bw = max(1, h // blocks), max(1, w // blocks)
    lums = []
    for y in range(0, h - bh + 1, bh):
        for x in range(0, w - bw + 1, bw):
            lums.append(a[y:y + bh, x:x + bw].mean())
    lums = np.array(lums)
    hist, _ = np.histogram(lums, bins=32, range=(0, 255))
    p = hist / max(1, hist.sum())
    p = p[p > 0]
    return float(-(p * np.log2(p)).sum())


def ascii_preview(lum, cols, rows):
    h, w = lum.shape
    ch = max(1, h // rows); cw = max(1, w // cols)
    lines = []
    for y in range(0, h - ch + 1, ch):
        row = []
        for x in range(0, w - cw + 1, cw):
            v = lum[y:y + ch, x:x + cw].mean() / 255.0
            row.append(RAMP[min(len(RAMP) - 1, int(v * len(RAMP)))])
        lines.append("".join(row))
    return "\n".join(lines)


def color_preview(a, cols, rows):
    """每格输出主色的十六进制，用于查看配色分布。"""
    h, w, _ = a.shape
    ch = max(1, h // rows); cw = max(1, w // cols)
    lines = []
    for y in range(0, h - ch + 1, ch):
        row = []
        for x in range(0, w - cw + 1, cw):
            m = a[y:y + ch, x:x + cw].reshape(-1, 3).mean(0).astype(int)
            row.append("%02x%02x%02x" % tuple(m))
        lines.append(" ".join(row))
    return "\n".join(lines)


def main():
    p = sys.argv[1]
    cols = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--cols=")), 72))
    rows = int(next((a.split("=")[1] for a in sys.argv if a.startswith("--rows=")), 28))
    im, a = load(p)
    lum = a @ np.array([0.299, 0.587, 0.114], dtype=np.float32)
    q = (a // 24).astype(np.uint8)
    uniq = len(np.unique(q.reshape(-1, 3), axis=0))
    # 主色
    flat = q.reshape(-1, 3)
    vals, counts = np.unique(flat, axis=0, return_counts=True)
    order = np.argsort(-counts)[:8]
    dom = [{"hex": "#%02x%02x%02x" % tuple((vals[i] * 24 + 12).astype(int)),
            "pct": round(float(counts[i]) / len(flat) * 100, 1)} for i in order]
    # 逐区域亮度（3x3）
    h, w = lum.shape
    thirds = [[round(float(lum[y * h // 3:(y + 1) * h // 3, x * w // 3:(x + 1) * w // 3].mean()), 1)
               for x in range(3)] for y in range(3)]
    info = {
        "file": p, "size": [w, h],
        "mean_lum": round(float(lum.mean()), 2),
        "std_lum": round(float(lum.std()), 2),
        "saturation_mean": round(float((a.max(2) - a.min(2)).mean()), 2),
        "colorfulness": round(colorfulness(a), 2),
        "unique_colors_q": int(uniq),
        "unique_colors_exact": int(len(np.unique(a.reshape(-1, 3), axis=0))),
        "edge_density": round(edge_density(lum), 4),
        "block_entropy": round(block_entropy(a), 3),
        "region_lum_3x3": thirds,
        "dominant": dom,
    }
    print(json.dumps(info, ensure_ascii=False, indent=2))
    if "--json" not in sys.argv:
        print("\n--- 明度预览 ---")
        print(ascii_preview(lum, cols, rows))
        print("\n--- 配色预览 (每格平均色) ---")
        print(color_preview(a, min(cols, 16), min(rows, 10)))


main()
