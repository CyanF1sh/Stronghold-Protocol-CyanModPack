# 干员调配 · 配置导入导出（`cyanfish.loadout-io`）

一个**界面 Mod**（QoL 型），不是加内容的 Mod：没有 `data/` 补丁、没有 `content/` 战斗行为、没有美术。
它只做一件事 —— 往宿主界面留出的插槽里挂一个按钮。

| | |
|---|---|
| Mod id | `cyanfish.loadout-io` |
| 版本 / API | `1.1.0` / `apiVersion 1` |
| 游戏版本 | `0.2.1` |
| 通道 | `client/`（**只在玩家浏览器里跑**，服务端不加载） |
| 插槽 | `loadout.topbar` —— 「干员调配」顶栏右侧，**位于「已同步」左边** |
| 依赖 | 无（`loadAfter: []`） |

> **v1.1.0（适配基座 0.2.1）改了什么**：只动 `mod.json` 两个字段 —— `gameVersion` `0.1.2` → `0.2.1`
> （规范 §9.3 要求与宿主 `package.json` 的 `version` **严格相等**，否则整个 Mod 被跳过），
> `version` `1.0.0` → `1.1.0`。**客户端代码零改动。**
> ★ 遗留风险（**未处理**）：本 Mod 的插槽 `loadout.topbar` 与 0.2.1 的界面插槽机制是否仍在同一处、
> `client/index.js` 引用的宿主导出（`/vendor/preact.module.js` 等）在 0.2.1 是否仍可用，
> **尚未实测**（属 L4 客户端施工面，见 `<开发期报告>/04-client-l4.md`）。

## 用法

装上并在管理页重载后，玩家刷新页面 →进「干员调配」→ 右上角出现「导入/导出」（⌄ 与「全部恢复默认」同款
secondary/sm 按钮，尺寸与风格自动一致）。

- **导出**：把本机**已调整**的干员（技能 + 精锐模组）写成 JSON 下载。文件里另附一张名字表与当时的 Mod 清单，
  这样对方导入时能说人话（「结城理」而不是 `cyanfish_makoto_a`）。
- **导入**：选一份 JSON，面板**先给出预览**再让你确认：
  - `可导入 N` —— 收下的条目；
  - `部分保留 M` —— 文件里有的字段本服没有（例如某个模组），只导入仍然合法的部分（如技能）；
  - `无需导入 K` —— 与默认配置相同的条目（没有信息量，不算错误）；
  - `丢弃 K` —— 本服没有的干员，**逐条列出名字、id 与原因**，多半写着「所属 Mod『X』未启用」或
    「本服务器没有这名干员（多半来自未安装的 Mod）」。
  确认后与当前配置**合并**（同名干员以文件为准），并立刻走既有的 `room.loadout` 同步推给服务器。

两条硬规则（都是为了让坏文件不伤人）：

- **条目上限 160 条**（与 `shared/protocol.js` 的 `LOADOUT_LIMITS.entries` 同口径）。超出的条目**不处理**、
  直接记为 `丢弃 / 超出配置条目上限`，取文件里的前 160 条 —— 上限按**文件条数**算而不是「收下的条数」，
  所以一个塞了几千条垃圾的 JSON 不会让浏览器白跑一遍。
- **id 形状**必须是干员 id（`^[A-Za-z0-9_\-.:]{1,64}$`）。不合法 ⇒ 记 `丢弃 / 字段格式不合法`，不去查数据。

## 文件格式

导出：

```json
{
  "format": "stronghold-protocol-loadout",
  "version": 1,
  "exportedAt": "2026-10-07T05:20:11.482Z",
  "game": { "app": "0.1.2", "revision": 12 },
  "mods": [{ "id": "cyanfish.makoto", "name": "结城理", "version": "1.0.0" }],
  "names": { "cyanfish_makoto_a": "结城理" },
  "entries": { "chess_char_3_21_a": { "skill": 2 } }
}
```

导入**同时接受**另外两种形状（别人手搓的配置也能用）：

1. 游戏自己 localStorage 里的 `{ "v": 1, "entries": { … } }`
2. 裸映射 `{ "chess_char_1_01_a": { "skill": 1 } }`
   （判据：每个值都是对象，且**至少有一个键**像干员 id —— 本作 266 条 chess id 全部形如 `<前缀>_<名>`，
   所以要求含下划线。`{"foo":{"skill":1}}` 这种普通 JSON 会被判为「认不出」，而不是当成一堆未知干员。）

## 「这是哪个 Mod 的干员？」是怎么算出来的

`GET /mods` 的每个 Mod 记录里带一个 **`chessIds`** —— 该 Mod 用 `add`/`clone` **新建**的干员 id
（`replace`/`merge` 不算：那是在改既有干员）。由 `server/mods/loader.js` 在合并时统计，**回滚则该 Mod 的记账也一并撤销**。

关键一点：**停用 / 校验失败的 Mod 也照常下发 `chessIds`**（loader 里叫「声明值」，只读一遍 `data/chess.json`
的 op 列表，不应用）。这样导入时才能把「本服没有这名干员」细化为：

| 情况 | 提示 | 面板上的原因 |
|---|---|---|
| 列表里有该 Mod，但没启用 / 有问题 | 点名 Mod 名 | `disabled` |
| 列表里压根没有这个 Mod（对方装了本服没有的包） | 「多半来自未安装的 Mod」 | `missing` |

## 它是怎么挂上去的

宿主为「客户端 Mod」留了一条通道（第四条落地轴，前三条是 `data/`、`content/`、`assets/`）：

```
/mods 快照（server/index.js）
  └─ mods[].client = "/mods/cyanfish.loadout-io/client/index.js"   ← server/mods/client.js
       ↓  public/js/ui/extensions.js 的 loadClientMods()（页面启动时）
       ↓  import(url) → setup(hostApi)
     hostApi.slots.register('loadout.topbar', Component)
       ↓
     screens/loadout.js 里的 <UiSlot name="loadout.topbar"/> 把它渲染出来
```

`hostApi` 只给：UI 组件库（`ui.html` / `ui.Button` / `ui.hooks` …）、插槽注册表、干员调配的 store 与模型、
数据仓库、`getMods()`。**没有**任何能碰到服务器或战斗模拟器的口子。

面板本身用 `ui.alertDialog({ text: <Panel/> })` 弹出 —— 它挂在 app 根的 `DialogHost` 上，所以层级、
样式、Esc/背板关闭全都跟游戏自带的对话框一致，也不需要 portal（这份 preact 构建没有 `createPortal`）。

## 为什么可以放心装

- 服务端**不会**加载 `client/`：关掉这个 Mod 只是按钮没了，战斗与数据一模一样。
- 装载全程容错：取不到 `/mods`、模块坏了、`setup` 抛错 ⇒ 记一条 warning，页面对应没有任何变化。
- 导入的每一条都要过宿主自己的清洗（`shared/protocol.js` 的 `checkLoadout`）：就算文件是手工改的，
  也不可能让本机存下一条服务器会拒收的配置。

## 校验

`<开发期脚本>/verify_loadout_io.mjs`（本地与服务器都能跑）：

```bash
node <开发期脚本>/verify_loadout_io.mjs
SP_MODS=本地部署目录/mod/mods node tools/verify_loadout_io.mjs   # 服务器侧
```
