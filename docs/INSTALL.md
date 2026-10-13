# 安装（step-by-step）

> 目标：在你自己的机器上，把本仓的**平台覆盖层 + 21 个 Mod** 叠到**你自备的官方 0.2.5** 上。
> 全程**本地操作**，脚本不联网、不碰任何服务器、不索取任何凭据。
> 预计 15 分钟（其中大部分时间是官方素材下载）。

---

## 0. 前提

| 项 | 要求 | 为什么 |
|---|---|---|
| **游戏本体** | **官方 0.2.5**（上游 `package.json` 的 `"version": "0.2.5"`） | 19 个核心 Mod 的 `gameVersion` 就写 0.2.5；装载器严格校验，版本不符会**整批跳过** |
| **Node.js** | **≥ 22**（上游 `engines.node`） | 服务器与所有工具都是 Node 程序 |
| **素材** | 由官方 `tools/setup.mjs` 在你本机自取（约 270 MB） | 官方美术 / 字体**不在本仓**，也不能再分发 |
| **磁盘** | 本体 + 素材 + 依赖约 1 GB 起 | 与上游要求一致 |
| **本仓** | `git clone` 或下载 ZIP 解压到任意目录 | 覆盖层与 Mod 都在这里 |

> ⚠ **本仓不含游戏本体**。下载本仓不能直接玩。

---

## 1. 准备官方 0.2.5（自备）

任选一条路，最后都要得到一个**目录**（下称 `<游戏目录>`，例如 `D:\Stronghold-Protocol-0.2.5`）：

**路线 A（推荐·源码）**

```bash
git clone https://github.com/sganggs/Stronghold-Protocol.git "<游戏目录>"
cd "<游戏目录>"
git checkout 0.2.5          # 或与 0.2.5 对应的 tag / commit
npm install                 # postinstall 会跑 tools/vendor.mjs
npm run setup               # ★ 自取官方素材（public/assets/** + public/fonts/**）
```

**路线 B（官方 Releases 的 0.2.5 完整包）**：下载解压 → `npm install`。
若包内已带素材，可跳过 `npm run setup`。

**确认两件事**（`apply-overlay.mjs` 也会自己核对）：

```bash
node -e "console.log(require('./package.json').version)"   # 期望输出 0.2.5
ls server public docs tools test                            # 这五个目录都要在
```

---

## 2. 拿到本仓

```bash
git clone <本仓地址> "<本仓目录>"
cd "<本仓目录>"
```

---

## 3. ★ 干跑（只报告，不写任何文件）

```bash
node tools/apply-overlay.mjs --target "<游戏目录>" --dry-run
```

期望输出（要点）：

```
目标版本: package.json version = 0.2.5  ✓
覆盖层  : 105 个文件
闸① 覆盖层自身完整性: ✓ 105/105
闸② 目标现状: 可写 105 · 已是本仓版本 0 · 冲突 0
--- --dry-run：一个字节都没写 ---
RESULT: OK（可以真跑）
```

**看到「冲突」怎么办**：说明那个文件在你那棵官方树上与官方原版**逐字节不同**（你改过、别的 Mod 改过、
或你的包形态与我们对照的官方全量包不同）。先一行行看清楚是哪些文件，再决定：
- 你确实想要本仓版本 ⇒ 加 `--force`（会先备份）；
- 只是想对比 ⇒ 保持默认，它**不会**覆盖任何有冲突的文件，并在结束时 `RESULT: FAIL` 退出码 1。

---

## 4. 真跑（先备份，再逐文件写入）

```bash
node tools/apply-overlay.mjs --target "<游戏目录>" --with-mods
```

它会：

1. 再校验一次覆盖层完整性（`overlay/MANIFEST.sha256`）；
2. 把**每个将被覆盖的文件**备份到 `<游戏目录>/.sp-overlay-backup-<时间戳>/`（原本不存在的记 `ABSENT`）；
3. 写入 105 个覆盖层文件，**写后逐文件复核 sha256**；
4. `--with-mods` 时把 21 个 Mod 目录拷进 `<游戏目录>/mods/`（**已存在的同名目录不会被覆盖**，会打印出来让你自己确认）；
5. ★ 若 `mods/.state.json` **不存在**，再写一份把 **7 个历史归档 Mod 停用**的状态
   （作者两台实例就是这个口径；那几个 Mod 自己的 README 也写着「建议不装载 / 不要再分发本目录」）。
   **已存在** ⇒ 一个字都不动；不想让它写 ⇒ 加 `--no-state`。

期望结尾：

```
文件 105 个 / 3.34 MB · 覆盖前备份 67 个（原本不存在的记 ABSENT）
写后逐文件复核: ✓ 105/105 sha256 一致
拷入 21/21 个 Mod（135 文件）到 <游戏目录>/mods
启停状态: 已写 mods/.state.json：停用 7 个历史归档 Mod（…）
RESULT: OK
```

---

## 5. 校验 Mod

```bash
cd "<游戏目录>"
node tools/mod.mjs validate
```

**期望输出（要点）**：

```
✓ cyanfish.announce  (1 ops)      ✓ cyanfish.max-seats  (2 ops)
… 共 19 个 ✓ …
✗ cyanfish.dj-bgm  (0 ops)
    错误: gameVersion=0.2.4 与当前游戏版本 0.2.5 不一致
✗ cyanfish.dj-models  (0 ops)
    错误: gameVersion=0.2.4 与当前游戏版本 0.2.5 不一致

2/21 个 Mod 校验未通过  （另有 1 个 Mod 有提示，不影响通过）
```

★ 最后那个 `2/21 未通过` 与**退出码 1** 都是**预期**：就是两个 DJ 整活 Mod 的版本门槛在起作用
（它们按归档原样发布，`gameVersion` 是 0.2.4）。详见 [OUTDATED-MODS.md](OUTDATED-MODS.md)。

> Mod 目录默认取 `<游戏目录>/mods`（也可用 `SP_MODS=<目录>` 指定）。本仓的 `mods/` 就是自足的，
> 直接把目录拷过去即可，**不需要任何环境变量**。

> ★ 装完的默认状态：**12 个正常装载** · **2 个 DJ 被版本门槛跳过** · **7 个历史归档停用**（共 21 个目录，
> 全部在 `/mods` 里可见）。想改启停：`node tools/mod.mjs enable|disable <mod-id>`。

---

## 6. 起服务

```bash
cd "<游戏目录>"
npm start                 # 等价于 node server/index.js
```

浏览器打开 `http://localhost:3000/`（端口由环境变量 `PORT` 决定）。
管理页 `http://localhost:3000/admin` —— 它需要你自己设 `SP_ADMIN_TOKEN`，**本仓不含任何令牌**；
不设令牌时管理页不可用（这是上游的安全设计，不是安装失败）。

打开 `/mods` 检查：**21 个都在列表里** —— 12 个正常装载、7 个历史归档显示「停用」、
两个 DJ Mod 显示**一行版本不一致的错误并被跳过**（预期行为，见 [OUTDATED-MODS.md](OUTDATED-MODS.md)）。

**不想让那两个 DJ 报错**（例如你只要干净的一页）：`node tools/mod.mjs disable cyanfish.dj-models` 与
`… disable cyanfish.dj-bgm`；那样 `validate` 也会回到 0 错误。代价是 `/mods` 里就看不到那两条过时提醒了。

---

## 7. 卸载 / 回滚

```bash
node tools/apply-overlay.mjs --target "<游戏目录>" --rollback "<第 4 步打印的备份目录>"
```

它按 `BACKUP.json` 逐文件还原，并删掉本次**新建**的文件；跑完打印
`RESULT: OK（目标已回到打补丁前的状态）`。

只要回滚 Mod：删掉 `<游戏目录>/mods/` 下你不想留的目录即可（`.state.json` 是本机启停状态，不用管）。

---

## 8. 常见问题

| 症状 | 原因 / 处理 |
|---|---|
| 干跑报一堆冲突 | 你的树不是官方 0.2.5 全量包（少了 `test/` 之类），或你改过那些文件。逐个看冲突清单再决定 |
| 干跑报「目标不是官方 0.2.5」 | `package.json` 的 `version` 不是 `0.2.5`。请先升级本体 |
| `validate` 报 `2/21 未通过` | **预期**：两个 DJ 整活 Mod 的 `gameVersion` 是 0.2.4。停用它们即可回到 0 错误 |
| `/mods` 显示 7 个「停用」 | **预期**：那是「历史归档 / 上游已修」的 7 个，工具替你停用了（见 [MODS-LIST.md](MODS-LIST.md) 第三节） |
| 不想让它写 `mods/.state.json` | 加 `--no-state`；或事后删掉那个文件（等于「全部启用」） |
| `/mods` 显示 `modsConfigured:false` | 服务器的 Mod 目录没指对：默认是 `<游戏目录>/mods`，或用 `SP_MODS` 指定 |
| 两个 DJ Mod 报错 | **预期行为**，它们按归档原样发布、`gameVersion: 0.2.4`，会被跳过但不崩服 |
| 页面没有美术、模型是方块 | 官方素材没取到：回到第 1 步跑 `npm run setup` |
| 想自己写 Mod | `cyanfish.demo` 是最小可读样例；平台规范见覆盖层里的 `docs/MODS.md` |

---

## 9. 许可提醒（一句话）

本仓代码 GPL-3.0-or-later；**游戏素材与数据不归本仓、也不在授权范围内** ⇒
仅供学习、研究和个人非商业娱乐，**禁止任何形式的盈利**。详见 [../NOTICE.md](../NOTICE.md)。
