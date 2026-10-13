# 示例干员包（`cyanfish.demo`）

**想自己写 Mod 的话，从这个包开始读最省事。** 它只做两件事，把一条 Mod 的最小骨架摆全：

1. 照抄官方干员「隐现」（`chess_char_1_01_a`）新增一名干员**「隐现·改」**（`cyanfish_demo_a` / `_b`）；
2. 把原「隐现」的攻击力小幅上调。

> **v1.1.0（适配基座 0.2.1）改了什么**：只动 `mod.json` 两个字段 —— `gameVersion` `0.1.2` → `0.2.1`
> （规范 §9.3 要求与宿主 `package.json` 的 `version` **严格相等**，否则整个 Mod 被跳过），
> `version` `1.0.0` → `1.1.0`。**`data/chess.json` 补丁零改动**（`node tools/mod.mjs validate` 通过，3 条 op 全部可应用）。
>
> ★ 作为示例包，它同时也是**待补的样板**：0.2.1 给全部 266 条干员记录新增了 `backup`
> （`{charId, tmplId, skillIndex, uniEquipId, potRank}`，补位系统 `server/match/gamedata.js:199-212` 使用），
> 而本包的 `cyanfish_demo_a/_b` **没有** `backup` ⇒ 不会被补位（不报错）。
> 补 `backup` 是 0.2.1 上「新增干员」这一课的新增必填项，**本例尚未示范**。

---

## 目录结构（最小骨架）

```
mods/cyanfish.demo/
├── mod.json            ← 清单：id / version / apiVersion / gameVersion 必填（loader.js:114）
└── data/
    └── chess.json      ← 数据补丁：{ "ops": [ … ] }，op 白名单见 server/mods/patch.js
```

- **轴**：只有 **L1 数据**。没有 `content/`（战斗行为）、没有 `client/`（界面扩展）、没有 `assets/`（美术）。
- **`data/<目标>.json` 的命名就是目标文件**：`data/chess.json` ⇒ 打到 `data/chess.json` 上。
- 想加战斗行为就放 `content/index.js`（默认导出 `(api) => void`），想加界面就放 `client/index.js`。
- 校验：在仓库根跑 `node tools/mod.mjs validate cyanfish.demo`（或 `lint <dir>` 校验任意目录）。
