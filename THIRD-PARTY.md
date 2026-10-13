# 第三方与署名（THIRD-PARTY）

本仓**不含**任何官方素材，也**不含**任何第三方二进制。这份文件记录**需要署名或需要说明授权状态**的第三方内容。
★ **一处例外**：`mods/cyanfish.dj-all/assets/amiya-spin.gif` —— 一张**同人二创表情包**（见 §5）。

## 1. 上游项目（本仓的基础）

| 项 | 内容 |
|---|---|
| 项目 | **Stronghold Protocol** —— `sganggs/Stronghold-Protocol` |
| 本仓对照版本 | **0.2.6**（本仓的覆盖层就是按这一版逐字节对齐的） |
| 许可证 | **GPL-3.0-or-later**（见上游 `LICENSE` / `NOTICE.md` §1） |
| 我们的使用方式 | 覆盖层是它的**派生作品**（改动 + 新增平台代码），因此本仓整体沿用 GPL-3.0-or-later |

## 2. 英文翻译署名（来自上游，予以保留）

上游 `NOTICE.md` §1 载明：界面英文文本 `public/i18n/en.json` 与游戏文本的补充译文
`tools/i18n/fallback-pr70.json` 的翻译以 GitHub PR #70（分支 `en-translation`）中
**@YuriRestia** 的翻译为基础，经项目所有者决定署名沿用，并随项目以 GPL-3.0-or-later 发布。

★ 本仓的覆盖层**包含** `public/i18n/en.json`（我们改过它）。
因此这份署名在本仓**继续有效**：**@YuriRestia** 的英文翻译以 GPL-3.0-or-later 随本仓一同分发。

## 3. `cyanfish.dj-bgm`：那首第三方曲子（**本仓不带**）

| 项 | 内容 |
|---|---|
| 曲目 | B 站 `BV1hXbN6VEKV`「🥳kkr：⚡️朋友的酒🍺DJ 完整版⚡️」，UP 主 **活跃黑江乐** |
| 原归档文件 | `assets/bgm/friends-wine-dj.m4a`（4.41 MB，DASH 音频轨 30280） |
| 授权状态 | **未取得权利人授权**；该 Mod 自己的说明写着「音乐与视频的著作权归原 UP 主与相关权利人所有，**不适用** GPL，禁止任何形式的收费与商业分发」 |
| 本仓的处理 | **不随包发布**（一个音频文件都没有）。`assets/bgm/` 里只留一份「自己放 BGM」的说明 |
| 署名 | 在此**如实注明出处与 UP 主**，供读者了解原归档的来源；本仓不因该署名而获得任何授权 |

★ 该 Mod 的**代码**是数据驱动的、不依赖任何一首具体的歌 ⇒ 去掉音频后功能照常（`tracks` 为空时页面上零痕迹）。
自己放曲子的三步说明见 `mods/cyanfish.dj-bgm/OUTDATED.md`；**请只放你自己有权使用的音频**。

## 4. 其它

- **npm 第三方库**（PixiJS、pixi-spine、Preact、htm、three.js、ws 等）：随**官方本体**安装，各自保留原许可证，
  见上游的 `THIRD-PARTY-NOTICES.md`（本仓不分发这些库）。
- **Spine Runtimes（上游 `NOTICE.md` §1 的附加许可）**：上游以 GPL-3.0 第 7 条附加许可允许把本项目与
  pixi-spine 中的 Spine Runtimes 组合后再分发；Spine Runtimes 本身仍受其自己的许可证约束。
  本仓不额外分发 Spine Runtimes。
- **`tools/local-extract/aklz4.py`（来自 isHarryh/Ark-Unpacker，BSD-3-Clause）**：**不在本仓**（本仓的覆盖层不含
  `tools/local-extract/**`）。它随官方本体发布，授权照旧。
- **游戏数据与素材**：版权归上海鹰角网络科技有限公司及其授权方所有，**不在本仓**，也不在 GPL 范围内
  （详见 [NOTICE.md](NOTICE.md) §2）。

## 5. `cyanfish.dj-all` 的同人二创表情包（**本仓带 1 张**）

| 项 | 内容 |
|---|---|
| 文件 | `mods/cyanfish.dj-all/assets/amiya-spin.gif`（128×128 · 27 帧 · 117 KB） |
| 性质 | **同人二创表情包**（由服主提供），**不是**游戏本体的官方美术文件 |
| 用途 | `cyanfish.dj-all` 的**局内独立入口（FAB）图标**（`client/fab.js` 的 `ASSET_FILE`） |
| 本仓的改动 | 仅「缩放 + 调色板重编码」，无改动式再创作 |
| **未随包** | 原包同目录的 960×960 **素材源** `阿米娅旋转.gif`（1.8 MB）—— 原包自己的 `SOURCE.md` 即注明「不参与运行，可删」 |
| 授权状态 | **未逐一取得授权**；按「同人二创、非商业」惯例随包，并**公开声明可随时删除** |
| **删除办法** | 在本仓提交 Issue（见 [NOTICE.md](NOTICE.md) §5）⇒ 我们**只删这一个文件**即可，不影响该 Mod 其余功能 |

★ 该 Mod 的其余部分**全是纯文本**（`.js` / `.mjs` / `.json` / `.md` / `.html`）—— 删掉这张图后，
**除局内入口图标取不到外，功能照常**；把自己的图片命名成 `amiya-spin.gif` 放进同目录即可恢复。
