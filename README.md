# 🕹️ 十款游戏合集

双击 **`games-center.html`**（或 `index.html`）即可打开游戏中心，点击卡片进入任意一款。
十款游戏全部是**零依赖、零素材、纯原生 HTML/CSS/JS**，直接双击本地文件就能玩，不需要联网、不需要安装任何东西。

## 目录

| 编号 | 游戏 | 入口 |
|---|---|---|
| 01 | 余烬之城 · 多结局剧情冒险 | [`1/余烬之城.html`](1/余烬之城.html) |
| 02 | 星火拓荒 · 无尽之地 | [`2/index.html`](2/index.html) |
| 03 | 拓城记 · 中古殖民模拟 | [`3/index.html`](3/index.html) |
| 04 | 深渊词条 · 肉鸽打宝 | [`4/index.html`](4/index.html) |
| 05 | 幻境争锋 · 战棋自走棋 | [`5/index.html`](5/index.html) |
| 06 | 回声 Echo · 声音解谜冒险 | [`6/index.html`](6/index.html) |
| 07 | 镜像迷城 · Mirror Maze | [`7/index.html`](7/index.html) |
| 08 | 时间碎片 · Time Shards | [`8/index.html`](8/index.html) |
| 09 | 星穹拓荒 · Stellar Frontier | [`9/index.html`](9/index.html) |
| 10 | 情绪花园 · Emotion Garden | [`10/index.html`](10/index.html) |

## 用本地服务器打开（推荐，避免个别浏览器对本地文件的限制）

```powershell
# 方式一：Node
node _tools/serve.mjs 8899
# 然后访问 http://127.0.0.1:8899/

# 方式二：Python
python -m http.server 8899
```

## 开发与验证工具（`_tools/`）

| 文件 | 用途 |
|---|---|
| `serve.mjs` | 静态服务器（禁用缓存），`node serve.mjs [端口] [根目录]` |
| `probe.mjs` | 用 headless Edge 打开页面，抓 console 报错 + 截图，支持 `--click= --key= --eval=` |
| `probe-all.mjs` | 批量探测十款游戏 |
| `analyze.py` | 截图美术指标分析（颜色数 / 色彩丰富度 / 细节密度 / 主色占比）+ ASCII 预览 |
| `verify.mjs` | 改动前后对照验证（同时跑备份与当前版本，输出指标对照表） |
| `fingerprint.mjs` | 代码级"美术投入"指纹（渐变 / 纹理 / 光照 / 粒子 / CSS 美术 使用量） |
| `check-overlay.mjs` | 检测"隐形遮罩抢占点击"类 bug |
| `ART-BRIEF.md` | 美术优化的统一施工规范与验收标准 |

### 快速验证某一款

```powershell
node _tools/probe.mjs "http://127.0.0.1:8899/6/index.html" "_shots/echo.png" --wait=3000 --click=640,400 --eval="EchoApp.curScreen"
& "C:\Users\32651\.dsh\dsh-runtimes\dsh-primary-runtime\dependencies\python\python.exe" _tools\analyze.py _shots\echo.png
```

## 说明

- 各游戏的存档保存在各自浏览器里（localStorage），清缓存会重置进度。
- `_backup_before_art/` 是本次美术优化**之前**的完整快照，方便对比或回退。
- `_shots/` 是验证截图与指标 JSON。
