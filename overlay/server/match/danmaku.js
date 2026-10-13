// server/match/danmaku.js — 【已退役 · 兼容转发层】。
// (i18n-ignore-file: 本文件只有开发者注释，没有任何界面文案)
//
// ★★ 本文件原先承载「观战者实时弹幕」的规则接缝（`config.danmaku`，工序 90）。该 Mod
//    `cyanfish.danmaku` **从未上线过任何实例**（`deploy_base_024.py`：live = LIVE_MODS_EXCLUDED、
//    test = TEST_MODS_NOT_UPLOADED ⇒ 两个实例都不上传），其内容已**整体迁移**到 `cyanfish.chat`
//    （对局内聊天 + 弹幕 + 设置页），接缝也随之改名为 **`config.chat`**（实现见 `server/match/chat.js`，
//    登记见 `docs/MODS.md` §4.20）。
//
// ★ 为什么这里留一个转发层而不是直接删掉：
//   ① `<开发期报告>/90-spectator-danmaku.md` 等历史报告引用的是**这些函数名**，
//      留着旧名字让那些报告仍然读得通（证据不因改名而失效）；
//   ② 旧名字一旦被某个尚未更新的调用点 import，转发层让它**继续可用**，而不是整台服务器起不来。
//   ★ 新代码**一律** import `server/match/chat.js` 的 `CHAT_*` 名字；本文件不再承载任何逻辑，
//     也不再有 `danmakuSenderAllowed`（"只有观战者能发"这条口径已被 `chatSenderAllowed`
//     的"对局里的真人都能发"取代 —— 见 server/match/chat.js 的注释）。
//
// ★ 不装 Mod（数据里没有 `config.chat`）⇒ `readChat()` 返回 `CHAT_DEFAULTS`（`enabled: false`）
//   ⇒ 调用点第一条闸门就返回 ⇒ **与官方逐值相同**。

export {
  CHAT_LIMITS as DANMAKU_LIMITS,
  CHAT_FALLBACK as DANMAKU_FALLBACK,
  CHAT_DEFAULTS as DANMAKU_DEFAULTS,
  readChat as readDanmaku,
  sanitizeChatText as sanitizeDanmakuText,
  chatLength as danmakuLength,
  chatBlocked as danmakuBlocked,
  windowCount,
  pruneWindow,
} from './chat.js';
