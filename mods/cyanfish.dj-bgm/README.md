# 背景音乐覆盖（DJ 版）· `cyanfish.dj-bgm`

把游戏默认的背景音乐换成**你自己挑的音乐**（循环播放）。内置一首：
B 站「🥳kkr：⚡️朋友的酒🍺DJ 完整版⚡️」（UP **活跃黑江乐**，`BV1hXbN6VEKV`）。

- **音量不另做控件** —— 服主口径是"复用官方设置"：播放音量**实时读官方设置里那条 BGM 滑杆**
  （`public/js/ui/settings.js` 的 `settingsStore.bgm`），拖滑杆我们的音量立刻跟着变，
  官方那条「静音」档同样生效。
- **切换/卸载一定还回去**：选「跟随官方 BGM」、关掉开关、停用本 Mod、或宿主卸载客户端扩展，
  都会把宿主 BGM 声道写回玩家滑杆的值，并停掉我们那个 `<audio>` 元素 ——
  **绝不留下「宿主被静音」的状态**。
- **不猴补丁**：一行宿主代码都没改。只调宿主 `AudioManager.setVolumes({ bgm: 0 })` 这个公开方法
  （`public/js/audio.js:584-597`，且它**只合并给定的键**），然后自己用一个 `<audio>` 放。

---

## 怎么再加一首（两步，不用改代码）

1. **丢文件**：把音频放进 `mods/cyanfish.dj-bgm/assets/bgm/`（`.m4a` / `.mp3` / `.ogg` / `.opus` / `.wav` / `.aac` / `.mp4` / `.webm`）。
   `assets/` 是宿主 `/assets/**` 的**兜底搜索根**（`server/http/static.js:200`）⇒ 这个文件会以
   `/assets/bgm/<文件名>` 被取到，不需要改 `public/`、也不需要重启什么。
2. **登记一条**：在 `mods/cyanfish.dj-bgm/client/bgm.json` 的 `tracks[]` 里加：

```json
{
  "id": "my-track-1",
  "title": "曲名",
  "artist": "作者",
  "file": "assets/bgm/my-track-1.m4a",
  "durationSec": 187,
  "bytes": 4619673,
  "source": "出处小字（会显示在设置栏位里）"
}
```

改完在管理页点「重载」（或重启服务），玩家刷新页面就能在「模组设置 → 背景音乐」的下拉里看到新的一首。

字段规矩（写坏了只跳过**那一条**，其余照常，绝不报错）：

| 字段 | 必填 | 说明 |
| --- | --- | --- |
| `id` | ✅ | 唯一；玩家本机存的就是它（所以**改 `id` = 让所有人重新选一次**） |
| `title` | | 省略时显示 `id` |
| `artist` | | 下拉里显示成 `title · artist` |
| `file` | ✅ | **相对站点根**的路径，必须 `assets/` 开头、扩展名在白名单里（扩展名不对 ⇒ MIME 不对 ⇒ 浏览器不认成音频，所以这一层直接挡掉） |
| `durationSec` / `bytes` | | 只用于显示与自查，不参与逻辑 |
| `source` | | 出处/授权小字，显示在栏位底部 |

顶层的 `default` = **本机从没存过配置时**默认选中哪一条（省略时取 `tracks[0]`）。
`tracks` 为**空数组**时本 Mod 在页面上零痕迹（不注册设置栏位、不压宿主 BGM、不出声）。

---

## 实现（为什么这么写）

### ① 压掉宿主那一路，只走公开方法

宿主 `public/js/audio.js` 的 `AudioManager` 用 Web Audio 播它自己的 BGM（`playBgm(key)` → `bgmGain`，
增益 = `bgm² × 0.55`，audio.js:605）。我们另用一个 `<audio>` 元素放自己那首 ⇒ 不压宿主就是两首一起响。

`AudioManager.setVolumes(v)` 是 audio.js:584-597 的**公开方法**，而且**只合并给定的键**：

```js
this.volumes = { bgm: n(v?.bgm, this.volumes.bgm), sfx: n(v?.sfx, …), voice: n(v?.voice, …), muted: … };
```

所以本 Mod **只写 `bgm` 这一个键**：`audio.setVolumes({ bgm: 0 })`。
`sfx` / `voice` / `muted` 一个都不碰。

- 由此得到**与 `cyanfish.skinvoice` 互不干扰**：它压的是 `voice`（`client/hostvoice.js`），我们压的是 `bgm`，
  两个键在同一次合并里各写各的，谁也不覆盖谁。
- 也**没有**替玩家动 `muted`：静音是玩家自己的官方设置，我们只在自己那个 `<audio>` 上设 `el.muted`。

### ② 拿单例：`import('/js/audio.js')`

宿主 `public/js/main.js:47` 也 import 这个 URL ⇒ ES 模块按 URL 去重 ⇒ 拿到的是**同一个** `AudioManager`
实例（不会 new 出第二个）。宿主 client mod API（`public/js/ui/extensions.js`）是刻意窄的、**没有** audio，
所以这是本 Mod 唯一的"非正式依赖"（另一条是同源 `settingsStore`）。

**拿不到就静默降级**：不压宿主、**也不放我们那首**。理由：压不住宿主就一定会双播，那比"什么都不做"更糟；
"什么都不做"= 官方 BGM 原样播，与没装本 Mod 完全一致。只在 console 留一条 `warn`。

### ③ 「后写覆盖」：音量能实时跟随官方滑杆的关键

宿主 `ui/settings.js:27-30` 每次设置变化都会 `audio.setVolumes(s)`，把 `bgm` **写回滑杆值** ——
会把我们写进去的 `bgm: 0` 冲掉。所以本 Mod 必须订阅 `settingsStore`，并且**注册在宿主那个订阅者之后**：
`store.js:38-42` 的订阅者按注册顺序**同步**回调，宿主那个在 `ui/settings.js` 模块求值时（`main.js:48` 的
import）就注册了，早于 `main.js:376` 的 `loadClientMods()` ⇒ 我们永远晚于它，同一次通知里我们**后写**，稳赢。
（`cyanfish.skinvoice` 的 `hostvoice.js` 用的是同一套推理，本 Mod 照抄这个模式。）

**只有一个订阅者、一条 `sync()`**：压宿主 / 放我们那首 / 调音量必须一起变 ——
先压住宿主再放我们那首（否则会有一瞬间两首一起响），切回官方档则先停我们的、再还原宿主。

### ④ 音量映射（一个诚实的差别）

宿主把 `bgm` 送进 Web Audio 的 `bgmGain`，增益是 `bgm² × 0.55`（感知曲线）；`<audio>.volume` 是**线性**的。
本 Mod **有意不复刻**那条曲线：① 服主口径是"把官方设置里的 BGM 音量套到我们元素上"，线性最直白、可验证
（`el.volume === 滑杆值`）；② 复刻会让我们最大只能到 0.55，反而比官方那首小。要改只改 `player.js` 的
`follow()` 一处（夹取 + 赋值就在那三行里）。

### ⑤ 文件与职责

```
mods/cyanfish.dj-bgm/
├── mod.json              清单（gameVersion 0.2.1 严格相等、apiVersion 1）
├── README.md             本文
├── client/
│   ├── index.js          L4 入口：**唯一**那条 sync（压宿主 + 放/停 + 音量跟随）+ 订阅 + 注册栏位
│   ├── bgm.json          ★ 音乐清单（加一首改这里）
│   ├── manifest.js       清单读取 + 清洗（路径/扩展名白名单，坏条目单独跳过）
│   ├── config.js         sp.pref.djbgm（on 开关 + track 曲目 id；'' = 跟随官方）
│   ├── hostbgm.js        压/还原宿主 bgm 声道（只调 setVolumes，不猴补丁）
│   ├── player.js         我们自己的 <audio>（循环、音量跟随、静音档、自动播放手势兜底）
│   ├── section.js        「背景音乐」栏位（**只有开关 + 曲目下拉**，没有音量控件）
│   ├── style.js          只加 .sp-djb* 新类
│   └── registry.js       __SP_MODSETTINGS__ 引导（与 cyanfish.mod-settings / skinvoice **逐字节相同**）
└── assets/bgm/
    ├── friends-wine-dj.m4a   内置那首（4 619 673 字节 / 187.371 s）
    └── README.md             出处与授权（跟着二进制一起走）
```

依赖面：宿主 client mod API（apiVersion 1）的 `ui` / `log` / `mod`；
两条非正式依赖 `/js/audio.js` 的 `audio` 单例、`/js/ui/settings.js` 的 `settingsStore`；
一份 `__SP_MODSETTINGS__` 引导（没装设置 Mod 时只是没有界面，覆盖逻辑照常）。
**没有**数据补丁（`data/`）、**没有** L3 行为代码（`content/`）、**不改** `public/**`。
本地存储键：`sp.pref.djbgm`。

---

## 素材出处与授权

内置曲目：**B 站 `BV1hXbN6VEKV`**「🥳kkr：⚡️朋友的酒🍺DJ 完整版⚡️」，UP 主 **活跃黑江乐**
（<https://www.bilibili.com/video/BV1hXbN6VEKV>，cid `41667726578`）。
取的是该视频 DASH 里的最高码率**音频轨 `30280`**（197 kbps · `mp4a.40.2` · `audio/mp4`），
落盘 4 619 673 字节、容器内时长 187.371 s、`sha256 = fd0bfa1a…b5166761`。

抓取脚本：`<开发期脚本>/fetch_bgm_bv.mjs`（在 VPS 上跑，见文件头）+ `<开发期脚本>/fetch_bgm_bv.py`
（本机驱动，经开发期的远端执行通道）。可重跑：字节数与上游一致时跳过下载。

**版权**：音乐与视频的著作权归原 UP 主与相关权利人所有，**不适用**本仓库的 GPL 授权。
本 Mod 仅供学习与同好间**免费**共享，**禁止任何形式的收费**与商业分发。
若权利人要求，删掉 `assets/bgm/friends-wine-dj.m4a` 并把 `client/bgm.json` 的 `tracks` 改成自己的曲目即可
（本 Mod 代码本身不依赖任何一首具体的歌）。

Mod 自身代码沿用本仓库的 **GPL-3.0-or-later**。

---

## 回滚

1. 停用：`node tools/mod.mjs disable cyanfish.dj-bgm`（或管理页里关掉），或直接删 `mods/cyanfish.dj-bgm/`。
   玩家侧一行残留都没有：本 Mod 不写宿主数据、不打补丁；浏览器里只剩一个 `sp.pref.djbgm` 键
   （想彻底清干净：`localStorage.removeItem('sp.pref.djbgm')`）。
2. 只想恢复官方 BGM：设置栏位里选「跟随官方 BGM」或把开关关掉（**当场**还原，不用重启）。
3. 回滚不影响任何其它 Mod：本 Mod 只写宿主 BGM 声道一个键。
