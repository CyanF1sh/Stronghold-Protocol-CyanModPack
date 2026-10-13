# overlay/ —— 平台覆盖层（105 个文件）

这一层是**本仓的核心**：它把 Mod 平台叠到你自备的官方 0.2.5 上。
**不叠这一层，`mods/` 里的 21 个 Mod 一个都装不上。**

## 它是什么

| 组成 | 数量 | 例子 |
|---|---|---|
| **Mod 平台本体**（上游 0.2.5 里没有的新文件） | **38** | `server/mods/**`（装载器 / 补丁引擎 / 打包）、`public/js/ui/extensions.js`（插槽宿主）、`tools/mod.mjs`（Mod CLI）、`tools/mod-admin.html`（管理页）、`docs/MODS.md`（Mod 开发规范） |
| **对上游 0.2.5 已有文件的改动** | **67** | `server/index.js`、`server/sim/mechanics.js` 之外的接缝、`public/js/**`、`test/**` 等 |

合计 **105 个文件 / 约 3.3 MB**，目录层次与上游完全一致（`server/ shared/ public/ docs/ tools/ test/ scripts/`）。

## 两份清单

| 文件 | 记的是什么 | 谁在校验 |
|---|---|---|
| `MANIFEST.sha256` | **本仓**每个覆盖层文件的 sha256 | `apply-overlay.mjs` 每次运行都核对（防下载损坏） |
| `ORIGIN.sha256` | **你那棵官方 0.2.5** 上这些路径**应有的** sha256；上游没有的路径记 `ABSENT` | `apply-overlay.mjs` 写盘前逐文件核对（防覆盖你自己的改动） |

`ORIGIN.sha256` 是「原样性闸门」：只要你的本体是干净的官方 0.2.5，105 个文件应当**全部可写、0 冲突**。

## 怎么用

**不要手工拷这一层** —— 用仓根的工具，它会先校验、再备份、后写入：

```bash
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --dry-run
node tools/apply-overlay.mjs --target "<你的官方 0.2.5 目录>" --with-mods
```

详细步骤见 [../docs/INSTALL.md](../docs/INSTALL.md)。

## 许可证

覆盖层是上游 GPL 代码的**派生作品** ⇒ 与整仓一致，按 **GPL-3.0-or-later** 发布（见 [../LICENSE](../LICENSE)）。
它**不含任何官方素材**（没有美术 / 语音 / 音乐 / 字体 / 官方数据表）。
