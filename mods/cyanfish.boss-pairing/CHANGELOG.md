# 最终攻势 · 随机配队（cyanfish.boss-pairing）

## 1.0.0 — 2026-10-10（★ 2026-10-12 随 0.2.5 重缝撤项，版本号不升）
- ★★ **撤项（0.2.5 重缝）**：上游 0.2.5 已把「首领每局随机配对、隐藏首领沿用同局分组」做成基座行为
  （`docs/history/0.2.5.md` §30.12；`finalAssault.pairPlayers(alive, rng, previous)` + `Match.bossPairs`）。
  基座自 0.2.5 起**不再调用** `bossPairGroups` ⇒ 本 Mod 的 `config.bossPairing` 数据补丁**不再被读取 = no-op**。
  登记 `upstreamFixedIn: 0.2.5`；目录与文件保留（暂不删），对正式服零影响（本 Mod 在 `LIVE_MODS_EXCLUDED`）。
- 新增：最终攻势（同盟第 14 回合 / 隐秘核心第 15 回合）的队友改为**每局随机挑选**，不再固定按座位两两配对
- 口径：随机的只是「谁和谁一队」；组内左右仍按座位决定（座位靠前者守左半边，2 人房左右不变）
- 随机走**独立的派生随机流** ⇒ 波次 / 商店 / 机变 / 机器人逐值不变
- 纯数据 Mod（只加 `config.bossPairing` 一段表），与 `cyanfish.max-seats` 可各自单独开关
