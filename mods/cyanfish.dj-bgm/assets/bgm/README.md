# assets/bgm/ — 本 Mod 自带的背景音乐

这个目录是**宿主的 `/assets/**` 兜底搜索根**（`server/http/static.js:200`）：`public/assets/bgm/` 里没有的
文件，会依次到各启用 Mod 的 `assets/` 里找。所以这里的文件以 **`/assets/bgm/<文件名>`** 被浏览器取到，
不需要改 `public/`。

**加一首歌 = 往这里丢文件 + 在 `../../client/bgm.json` 的 `tracks[]` 里登记一条**（见 Mod 根 README）。

---

## `friends-wine-dj.m4a`

| | |
| --- | --- |
| 来源 | B 站 **BV1hXbN6VEKV**「🥳kkr：⚡️朋友的酒🍺DJ 完整版⚡️」 <https://www.bilibili.com/video/BV1hXbN6VEKV> |
| UP 主 | **活跃黑江乐**（mid 16217707） |
| cid | `41667726578` |
| 取的轨 | DASH 音频轨 id **30280**，197 220 bps，`mp4a.40.2`，`audio/mp4`（该视频三条音频轨里码率最高的一条） |
| 体积 | 4 619 673 字节（4.406 MiB） |
| 时长 | 容器内 187.371 s（`moov/mvhd`；B 站 API 报 188 s，差 0.629 s） |
| sha256 | `fd0bfa1adea8cbefe0992b330cec5b3348718e6a423b2f4526f4736ba5166761` |
| 抓取 | `<开发期脚本>/fetch_bgm_bv.py`（经 VPS；VPS 上没有 yt-dlp / ffmpeg，**也不需要**：DASH 音频本身就是 MP4/AAC，浏览器 `<audio>` 直接播） |

**版权**：音乐与视频的著作权归原 UP 主与相关权利人所有，**不适用**本仓库的 GPL 授权。
本 Mod 仅供学习与同好间**免费**共享，**禁止任何形式的收费**与商业分发。
若权利人要求，删掉本文件并把 `client/bgm.json` 的 `tracks` 换成自己的曲目即可 ——
本 Mod 的代码不依赖任何一首具体的歌。
