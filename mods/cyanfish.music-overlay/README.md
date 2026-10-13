# 音效替换 · `cyanfish.music-overlay`

把游戏里能听到的**背景音乐**与**各类音效**换成**你自己上传的音频**，逐条可选。
干员语音（`voice` / `voiceJp`）**不在范围内** —— 那是 `cyanfish.skinvoice` 那条轴的事。

本 Mod 是归档 Mod `cyanfish.dj-bgm`（只换背景音乐一首）的**通用化继承者**：
从「只压宿主 BGM 一路 + 自己放一首」扩到「**游戏里除干员语音外的所有播放音频**」。

- **轴**：L4（只在玩家浏览器里跑）。**没有** `data/`（数据补丁）、**没有** `content/`（战斗行为）、**没有** `assets/`。
- **音频只存在你自己的浏览器里**（IndexedDB），**不上传服务器**，别人听不到你的替换。
- **音量不另做控件**：实时跟随官方设置里的「背景音乐 / 音效」滑杆，官方「静音」档同样生效。

---

## 怎么用

1. 进游戏 → 打开**设置** → 「模组设置」→ 左栏选**音效替换**（需要装着 `cyanfish.mod-settings`，它是设置页外壳）。
2. 最上面是**总开关**；下面按 `背景音乐 / 界面音效 / 战斗音效 / 干员音效` 分组，用**搜索框**按名字或编号找条目。
3. 找到想换的那一条：
   - **选择文件** → 挑本机一个音频文件（`.mp3` / `.m4a` / `.ogg` / `.opus` / `.wav` / `.aac` / `.mp4` / `.webm`）；
   - **试听** → 先听一遍你选的那份；
   - **移除** → 还原成官方原声。
4. 改完**刷新页面**也不会丢（存在 IndexedDB 里）。

**设置只对本机这位玩家生效。** 同一局里别的玩家听到的仍是他们自己的（或官方的）音频。

---

## 长音效与短音效：本 Mod 最核心的一条区分

游戏里可替换的声音分两类，本 Mod 对它们**行为不同**：

| 类别 | 有哪些 | 播放方式 | 本 Mod 怎么处理 |
|---|---|---|---|
| **长音效** | 背景音乐（大厅 / 整备 / 作战 / 联防 / 首领 / 开战 A·B） | 宿主按**循环**播，带前奏的曲目先放 `intro` 再切 `loop` | 换掉**循环那一段**；若该曲目有官方前奏，**前奏被跳过**（直接放你的曲子并循环）。绝不出现「官方前奏 + 你的曲子」拼在一起 |
| **短音效** | 界面音效 55 条 · 战斗音效 ~12 条 · 干员攻击 / 受击 / 技能 / 被击倒 / 部署 · 各种技能专属挥击与命中 | **一次性**触发，一次事件响一次 | 只把**解码出来的音频缓冲**换成你的；官方的**播放时机、并发上限、冷却、优先级**一概不动 |

---

## 实现（为什么这么写）

### ① 唯一的漏斗：`AudioManager._buffer(url)`

宿主 `public/js/audio.js` 的 `AudioManager` 是**单例**，它所有发声路径 ——
`_startBgm`（背景音乐）、`_play`（界面 / 战斗音效）、`_playLanding`（整备落子）、`_playBondCue`、
`_playVoice`（干员语音）—— 都先走**同一个**私有方法 `_buffer(url)`：`fetch` → `decodeAudioData` → LRU 缓存。

所以本 Mod 只在**这一个点**上做替换：

```js
const orig = audio._buffer.bind(audio);
audio._buffer = (url) => {
  const rec = map.get(url);            // 命中 = 玩家替换过这一条
  if (!rec) return orig(url);          // 没命中 ⇒ 原样交还给宿主
  if (rec.mute) return Promise.resolve(null);   // 背景音乐的前奏：喂 null ⇒ 宿主跳过前奏
  return decode(rec.blob);             // 命中 ⇒ 交回玩家音频解码出的 AudioBuffer
};
```

- **宿主自己的调度全部保留**：限流器（`SfxLimiter`）、语音门（`VoiceGate`）、循环、淡入淡出、
  「同一文件最多 2 个副本」等等，**一个都没改** —— 我们换的是**字节**，不是**时机**。
- **背景音乐的前奏**用「喂 `null`」处理：宿主 `_startBgm` 里 `if (intro) {…}`，拿到 `null` 就**跳过前奏**，
  直接从 `t0` 起播循环段。这样既不会出现「官方前奏 + 你的曲子」，也不需要合成静音。
- **卸载即还原**：`delete audio._buffer` 把实例上的自有属性摘掉，露出原型上的原方法。

### ② 为什么不用 dj-bgm 那套「压声道 + 自己放 `<audio>`」

`dj-bgm` 能用**公开方法** `audio.setVolumes({ bgm: 0 })` 是因为它只换**背景音乐一路**。
通用化之后不行了，两个硬理由：

1. **短音效在同一路增益上**：`sfx` 是一整路 `sfxGain`，把 `volumes.sfx` 压 0 会把**界面音效 + 战斗音效 + 全部干员音效一起哑掉**，
   而我们要的是**逐条**替换。
2. **需要逐条**：`voice()` 第一行就是 `if (… || this.volumes.voice <= 0) return false`（audio.js），
   换句话说「压某一路」= **整路**失效 —— 没有「只压其中某一个文件」的公开办法。

⇒ 逐条替换**只能**在 `_buffer` 这个解码漏斗上做。这是本 Mod **唯一**碰宿主私有成员的地方，已在报告里提**接缝变更申报**。

### ③ 干员语音怎么排除

清单（`data/assets.json` 的 `audio`）里 `voice` / `voiceJp` 两棵树**根本不进目录**；
另外 `catalog.js` 会把这两个树里出现过的所有 URL收进一张**语音 URL 集合**，
`index.js` 建替换表时**跳过**它们 —— 双保险：即便某个语音文件恰好和一条音效同 URL，也不换。

### ④ 文件与职责

```
mods/cyanfish.music-overlay/
├── mod.json              清单（gameVersion 0.2.6 严格相等、apiVersion 1）
├── README.md             本文
├── CHANGELOG.md          版本记录
└── client/
    ├── index.js          L4 入口：装配 + 一条同步 + 注册栏位 + dispose
    ├── catalog.js        枚举音频（除语音）+ 长/短分类 + 展开成可替换条目
    ├── store.js          IndexedDB（音频 Blob）+ 本机配置（localStorage）+ 订阅
    ├── bridge.js         宿主 audio 单例：包装 `_buffer`、按表替换、完全还原
    ├── preview.js        试听（一个独立 `<audio>` 元素，不碰宿主）
    ├── section.js        「音效替换」栏位（分组 + 搜索 + 选择文件 / 试听 / 移除）
    ├── style.js          只加 `.sp-mo__*` 新类
    └── registry.js       __SP_MODSETTINGS__ 引导（与 mod-settings / skinvoice **逐字节相同**）
```

依赖面：宿主 client mod API（apiVersion 1）的 `ui` / `slots` / `data` / `log` / `mod`；
一条非正式依赖 `/js/audio.js` 的 `audio` 单例（与 `dj-bgm` / `skinvoice` 同一条路）；
一份 `__SP_MODSETTINGS__` 引导（没装设置 Mod 时只是**没有界面**，替换逻辑照常）。
**没有**数据补丁（`data/`）、**没有** L3 行为代码（`content/`）、**不改** `public/**`。

浏览器存储：
- IndexedDB 数据库 `sp.music-overlay`，对象仓库 `clips`（键 = 目标音频 URL，值 = `{ blob, name, type, size, at }`）；
- `localStorage` 键 `sp.pref.musicoverlay`（`{ version, on, targets }`）。

---

## 目标条目怎么来的（catalog）

全部来自宿主自己的素材清单 `data/assets.json` 的 `audio` 块（浏览器里经 `api.data.get('assets')` 读到）：

| 组 | 来源 | 条目语义 |
|---|---|---|
| **背景音乐**（长） | `audio.bgm`（`lobby` / `prep` / `combat` / `unite` / `boss` / `combatAlts[]`）+ `audio.bossBgm`（10 个首领） | 一个**曲目**一条；同 URL 的曲目合并成一条（例：整备与作战公用一首循环） |
| **界面音效**（短） | `audio.sfx.ui` | 一个事件一条（`click` / `back` / `confirm` …） |
| **战斗音效**（短） | `audio.sfx.battle` | 一个事件一条（`deploy` / `charDie` / `heal` / `leak` …） |
| **干员音效**（短） | `audio.sfx.units` | 同一音频文件**合并成一条**，标签写「干员名 · 攻击 等 N 处」 |

★ **条目按「音频文件 URL」去重**：同一个文件被多个事件共用时（引擎里很常见 —— 比如很多干员的部署音效共用 `b_char_set.mp3`），
本 Mod 只有**一条**，替换它 = 替换所有用到该文件的地方（因为它们本就是同一个文件）。
标签里会写清「等 N 处」，避免误会。

干员显示名从 `data/chess.json` 的 `charId → name` 反查；查不到就退回用 id。

---

## 本地验证

```bash
node tools/mod.mjs validate          # 本目录必须出现在通过的清单里
node tools/mod.mjs lint mods/cyanfish.music-overlay
node tools/mod.mjs verify
node tools/golden.mjs                # 287/287 零 digest 漂移
node --test                          # 比 not ok 集合，不比总数
node --check mods/cyanfish.music-overlay/client/index.js   # 每个改过的 js
```

真机自测（在游戏目录里）：

```bash
npm start          # 在宿主仓根起本地实例（见本仓 INSTALL）
# ★ 测完停掉进程
```

---

## 已知边界 / 未做

- **只对本机玩家生效**：音频在浏览器里，不改服务器、不改别人。这是本设计的前提，不是缺陷。
- **试听用的是独立 `<audio>`**：绕开游戏自己的音频通道，所以试听音量**不受**设置滑杆控制（那是宿主通道的事）。
- **不替换干员语音**（按需求排除）；需要换语音走 `cyanfish.skinvoice`。
- **不做音量控件**（服主既定口径：复用官方滑杆）。
- 上传文件**大小没有硬限制**，但音频会被解码进内存（一首 4 分钟的歌约 40 MB PCM）—— 别拿它当音乐库。
- `_buffer` 包装是**运行时包装**（非官方接缝），宿主改私有方法名即失效；已提接缝变更申报，见报告。

---

## 合规

Mod 自身代码沿用本仓库的 **GPL-3.0-or-later**。
本 Mod **不自带任何音频**（全部由玩家自行上传），因此**不含**鹰角 / Yostar 素材，也不含任何第三方曲目。
玩家上传音频的版权与责任归上传者本人；本 Mod **严禁任何形式的盈利**。
