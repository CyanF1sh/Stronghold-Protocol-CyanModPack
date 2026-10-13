// server/admin.js — Mod 管理 API（可分发管理页的后端）。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 为什么放在游戏服务端而不是另起一个进程（设计决策，见 卫戍协议-Mod系统使用手册 §8）：
//   · 每个服主**已经**在跑游戏服务 ⇒ 管理能力零额外部署，也**不需要第二个公网端口**；
//   · /mods/ 静态回源（L3 content + Mod 美术）本来就在这个进程里，管理接口是同一套东西的延伸。
//
// 四条硬性约束：
//   1. **默认关闭**。只有设置了 SP_ADMIN_TOKEN（>= 16 字符）才挂载；否则本模块整体 404，
//      游戏端口与原版行为完全一致。
//   2. **token 只走请求头**（`Authorization: Bearer <t>` 或 `X-SP-Admin-Token: <t>`），
//      **绝不接受 query string** —— 查询串会进 access log / Referer，等于把口令写进日志。
//   3. **不回显部署细节**。响应里没有绝对路径、没有 systemd 单元名、没有内网地址；
//      Mod 仓库只回一个显示用标签（SP_ADMIN_LABEL，默认 "本机实例"）。
//      （原 Python 管理页把 本地部署目录/mod/{app,mods} 直接渲染进公网 HTML，这是要修掉的问题。）
//   4. ★★ **CORS 是白名单，不是反射**（工序 73；见 resolveAdminOrigins 与 cors()）：默认只放行
//      **同源** + 字面量 `null`（= `file://` 打开 tools/mod-admin.html 的姿势）+ `SP_ADMIN_ORIGIN` 里列出的源，
//      其余 Origin **一个 CORS 头都不发**（401 / 错误响应同样）。理由：本 API 的明细含玩家 ID / 昵称 /
//      房间活动，而令牌长期存在管理页的 localStorage ⇒ 反射 Origin 等于让任意网页静默读走它们。
//
// 所有真正的 Mod 动作（校验/打包/安装/启停/卸载）都**委托给 tools/mod.mjs**，
// 不在服务端重写一遍 —— 避免「管理页一套校验、CLI 一套校验」两处实现漂移。

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { timingSafeEqual } from 'node:crypto';
import { monitorEventLoopDelay } from 'node:perf_hooks';
import { ASSETS_SUBDIR, CONTENT_SUBDIR, CLIENT_SUBDIR, validateManifest } from './mods/loader.js';
// ★ 工序 host-024：本模块要报「**树**这一版的版本号」（部署版走 /healthz 的 app）。
//   只在模块加载时读一次，读不动就是 null（绝不因此让管理面挂不起来）—— 与「失败不伤现有功能」同一条纪律。
import { createRequire } from 'node:module';

const pkgRequire = createRequire(import.meta.url);
/** 本仓库 `package.json` 的 `version`（读不到 ⇒ null）。★ 与 `shared/constants.js` 的 APP_VERSION 是
 *  两个来源：前者是**这一棵树**的版本，后者是**本进程实际跑的**那一份（= 部署版，/healthz 的 app）。 */
export const TREE_VERSION = (() => {
  try { return String(pkgRequire('../package.json').version || '') || null; } catch { return null; }
})();

/**
 * 管理 API 版本（前端据此判断能否对接）。
 * ★ 2（2026-10-10，工序 43）**纯加成**：`/snapshot` 的每个 Mod 多一个 `changelog` 字段
 *   （最近 3 版，`null` = 该 Mod 没有 CHANGELOG.md），并新增只读端点 `GET /admin/api/changelog?id=<mod>`。
 *   既有字段的语义与形状一个都没改 ⇒ 只认 `apiVersion >= 1` 的老前端照常工作（它只是看不到日志入口）。
 * ★ 3（2026-10-11，工序 61）**纯加成**：新增「实时文档」通道 `GET|POST /admin/api/live?id=<mod>`
 *   （见 LIVE_FILE 的说明），`caps()` 多一个 `live: true`。既有端点与字段一个都没动。
 * ★ 4（2026-10-11，工序 69）**纯加成**：新增**管理员只读**的房间明细 `GET /admin/api/rooms`
 *   （每房间：房号 / 创建时间 / 是否开局 / 对局开始时间 / 回合 / 阶段 / 座位 / 真人 / AI / 观战 / 每人状态
 *   + 顶层汇总 `rooms/matches/humans/bots/spectators` 与 **`safeToRestart`**），`caps()` 多一个 `rooms: true`。
 *   ★ 数据**不是**这里算的：`getRooms()`（`server/match/roomDetail.js`）直接读运行中的 Room / Match 对象
 *   —— 「别自己造第二份真相」（见该模块头部）。既有端点与字段一个都没动。
 * ★ **不抬版本**（工序 73）：端点与字段一个都没动，只把 CORS 从「反射任意 Origin」改成**白名单**
 *   （同源 + `null` + `SP_ADMIN_ORIGIN`；不命中 ⇒ 一个 CORS 头都不发，401 / 错误响应同样），
 *   并把 `/rooms` 的 `safeToRestart` 口径收紧到「0 真人 0 对局 **0 观战**」（见 roomDetail.js）。
 *   两者都不是形状变化 ⇒ 老前端照常工作，`ADMIN_API_VERSION` 仍为 4。
 * ★ 5（2026-10-12，工序 114）**纯加成**：新增**管理员只读**的趋势指标 `GET /admin/api/metrics`
 *   （环形缓冲里的采样点 → 列式序列；每点含 humans / bots / matches / rooms / spectators /
 *   **cpuMean + cpuPeak**（峰值由窗口内每 2 秒一次的高频子采样取 max）/ rssMB / elMeanMs + elMaxMs + elP99Ms /
 *   sockets / load1 / memFreeMB / **peakBots + peakHumans + peakAtSec**），`caps()` 多一个 `metrics: true`，
 *   并**只在管理面挂载后**起一个定时采样器（默认 1 分钟 1 点 · 4320 点 = 3 日）。
 *   ★ 没设 `SP_ADMIN_TOKEN` ⇒ `createModAdmin` 返回 null ⇒ **采样器根本不会被创建**（更不会启动）。
 *   既有端点与字段一个都没动。
 * ★ 6：2026-10-13，工序 host-024，**纯加成**：新增**管理员只读**的官方 release 追踪
 *   `GET /admin/api/upstream-release`（服务端每 60 分钟带 ETag 拉一次 api.github.com 的
 *   releases/latest ⇒ 当前版本 / 官方最新版本 / 发布时间 / 更新说明摘要 / 资产清单（名 / 大小 / sha256 digest）
 *   / 落后几个版本），`caps()` 多一个 `upstream: true`。
 *   ★ 没设 `SP_ADMIN_TOKEN` ⇒ `createUpstreamPoller(...)` 在 `return null` 之后 ⇒ **连对象都不建、
 *     一个定时器都不会起**；`SP_ADMIN_UPSTREAM=0` ⇒ 整块关掉（接口回 enabled:false，同样不起定时器）。
 *   既有端点与字段一个都没动。
 */
export const ADMIN_API_VERSION = 6;
/** 管理 API 路径前缀。 */
export const ADMIN_PREFIX = '/admin/api';

const MOD_ID_RE = /^[a-z0-9][a-z0-9._-]*$/;
const EXPORT_SUBDIR = '.exports';
const UPLOAD_SUBDIR = '.uploads';
const MANIFEST = 'mod.json';
const STATE_FILE = '.state.json';
/** 每个 Mod 自己目录里的版本更新日志（docs/MODS.md §4.12.5：随包分发、与 README.md 并列）。 */
const CHANGELOG = 'CHANGELOG.md';
/**
 * 快照里最多回几版日志（新的在前）。**完整**日志走 `GET /admin/api/changelog?id=<mod>`
 * ——这样列表接口不会因为某个 Mod 攒了 30 版日志而变大。
 */
const CHANGELOG_VERSIONS_IN_SNAPSHOT = 3;
/** 上传包上限（32 MB；Mod 自带美术也就几 MB）。 */
export const MAX_UPLOAD = 32 * 1024 * 1024;

/**
 * ★★ 「实时文档」通道（工序 61；docs/MODS.md §4.14）。
 *
 * 一个 Mod 的**本机运行态**（不是它分发的静态内容）可以放在自己目录下的这个固定文件名里，由管理页
 * 实时读/写：`GET /admin/api/live?id=<mod>` / `POST /admin/api/live?id=<mod>`（body = 整份 JSON 文档）。
 * 消费方（该 Mod 的 L4 客户端代码）通过**已有的** `/mods/` 静态挂载读同一份文件
 * （`GET /mods/<id>/live.json`）⇒ 发布不需要重启进程、也不需要任何新端口。
 *
 * 为什么它不是 `data/` 里的补丁：`data/<target>.json` 是**分发内容**（随 `.spmod` 打包、启动时合并进
 * `data/*.json`）⇒ 改它必须走「重载 / 重启」，而且每次改动都会把 `revision` 顶掉、把已连接客户端的
 * 数据变成旧版。横幅公告这类**几分钟内就要上线、又要能随时撤回**的东西要的是「一个文件 + 一次轮询」。
 * 所以本文件与 `<modsDir>/.state.json` 同类：**本机状态，不随 `.spmod` 分发**
 * （tools/mod.mjs 的安装白名单里没有它 —— 这是有意的，新装一台服务器不该继承别处的运行态）。
 */
export const LIVE_FILE = 'live.json';
/** 实时文档上限（64 KB：横幅公告这类文本远用不到；给一个硬上限防止把磁盘写爆）。 */
export const MAX_LIVE = 64 * 1024;

/**
 * 解析 `mods/<id>/CHANGELOG.md`（docs/MODS.md §4.12.5 的格式）。
 *
 * 约定（宽松解析，读不动就当作没有日志 —— 绝不因此报错）：
 *   · `# <Mod 名>`                      可选的一级标题；
 *   · `## <version> — <YYYY-MM-DD>`     版本小标题（新的在最上面）；
 *   · `## 未发布`                       未发布的改动（在最新一条的位置出现）；
 *   · `- <一条>`                        该版本的一条改动。
 *
 * ★ 为什么放服务端解析而不是把 markdown 原样丢给前端：管理页的 CSP 与"不注入 HTML"的现状要求
 *   前端只做转义渲染，**结构化**的数据比一句 markdown 更容易一致地排版（也就不会两个页面各写一套解析）。
 * @param {string} text
 * @returns {{versions:Array<{version:string,date:string|null,items:string[]}>}|null}
 */
export function parseChangelog(text) {
  if (typeof text !== 'string' || !text.trim()) return null;
  const versions = [];
  let cur = null;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.trim();
    if (!line) continue;
    const h2 = /^##\s+(.+?)\s*$/.exec(line);
    if (h2) {
      const head = h2[1];
      if (head === '未发布') {
        cur = { version: '未发布', date: null, items: [] };
      } else {
        // 允许 `—` / `-` / `–` 三种破折号，日期可选（缺了就按没日期显示）
        const m = /^(\S+)\s*(?:[—–-]\s*(\d{4}-\d{2}-\d{2}))?$/.exec(head);
        if (!m) { cur = null; continue; }               // 认不出来就不收进这一版（也不会污染上一版）
        cur = { version: m[1], date: m[2] || null, items: [] };
      }
      versions.push(cur);
      continue;
    }
    if (line.startsWith('#')) continue;                  // 一级标题 / 更深的小标题都跳过
    const li = /^[-*]\s+(.+)$/.exec(line);
    if (li && cur) cur.items.push(li[1]);
  }
  if (!versions.length) return null;
  return { versions };
}

/**
 * 读管理 token。未设置 / 太短 ⇒ null（模块不挂载）。
 * @param {Record<string,string|undefined>} [env]
 * @returns {string|null}
 */
export function resolveAdminToken(env = process.env) {
  const t = (env.SP_ADMIN_TOKEN || '').trim();
  return t.length >= 16 ? t : null;
}

/**
 * ★★ 管理面 CORS 的**附加**白名单（工序 73；`SP_ADMIN_ORIGIN`，逗号分隔，可多值）。
 *
 * 基线白名单**永远是**「同源 + 字面量 `null`」，本函数只往里加东西（环境变量没设 ⇒ 空集合）：
 *   · **同源**：管理页从 `/admin` 打开、地址填当前站点，浏览器**同源**请求（很多还带 Origin）照常工作；
 *   · **`null`**：`file://` 打开 `tools/mod-admin.html` 时浏览器发的就是 `Origin: null`
 *     ⇒ 服主原来的用法**不需要改**（★ 代价：`null` 也是沙箱 iframe / `data:` 页面的 Origin，
 *     它们同样在名单里 —— 令牌本身仍是唯一的守门，这里只是不额外拦它）；
 *   · **`SP_ADMIN_ORIGIN`**：给「管理页放在另一个域 / 另一个端口」的部署加显式例外，
 *     例：`SP_ADMIN_ORIGIN=https://ops.example,http://192.168.1.9:8080`；写 `null` 也认（与基线重复，无副作用）。
 *
 * ★ 为什么不是「设了就覆盖基线」：那样一次手滑（写成错的域）会把同源管理页一起关掉，
 *   而本函数的整个目的就是**收紧**，收紧不该把正经用法一起收掉。
 * @param {Record<string,string|undefined>} [env]
 * @returns {Set<string>} 逐个原样比较的 Origin 集合（大小写敏感 —— Origin 是逐字节比较的）
 */
export function resolveAdminOrigins(env = process.env) {
  const out = new Set();
  for (const part of String(env.SP_ADMIN_ORIGIN || '').split(',')) {
    const v = part.trim();
    if (v) out.add(v);
  }
  return out;
}

// =============================================================================================
// ★★ 指标采样 + GET /admin/api/metrics（工序 114；docs/MODS.md §4.21）
//
// 服主口径（2026-10-12）：
//   「不用 5s 1 点，1 分钟 1 点的采样就够了，保留 3 日内数据，可调节显示折线图显示时间范围
//     （按『过去 X 小时』显示），当前主要是想实测人数对服务器的性能压力。」
//   「CPU% 除均值外还应显示分钟内峰值（按照之前测试的口径，AI 计算时会产生瞬时的高压）。」
//
// 四条纪律：
//   1. **只在管理面挂载后才有**：本模块的一切（含**定时采样器**）都由 createModAdmin 创建 ——
//      没设 SP_ADMIN_TOKEN ⇒ createModAdmin 返回 null ⇒ 采样器**根本不会被 new 出来**（更不会 start），
//      /admin/api/metrics 与 /admin 一起 404 ⇒ 与上游逐字节等价（WORKBENCH 的「默认严格等于上游」）。
//   2. **只读**：/admin/api/metrics 不做任何写操作；采样只读进程内计数、perf_hooks 直方图与 os / /proc。
//   3. **有界**：环形缓冲（默认 4320 点 = 3 日 @1 分钟）+ **可选**落盘（单文件上限 + 只留 N 个文件 +
//      「随时留 ≥5 GB」门禁）⇒ 内存与磁盘**都不随时间增长**。
//   4. **峰值与均值分开存**：cpuPeak 由窗口内**每 2 秒一次的高频子采样**取 max（瞬时高压只有这样才能看见；
//      WORKBENCH 坑 14：**分母必须是两次采样的实际墙钟间隔**，不许用名义间隔）；并同时记下**峰值那一刻的
//      bots / humans 与秒偏移** ⇒ 才能回答「几个 AI 造成了多大的瞬间压力」。
// =============================================================================================

/**
 * 一个采样点有哪些列。**顺序 = 环形缓冲的列序 = 落盘 JSONL 每行的数组序 = 接口 series 的来源**。
 * ★ 单一真相：内存 / 磁盘 / 接口 / 管理页的图例全由这一张表驱动。
 */
export const METRIC_FIELDS = Object.freeze([
  'ts', 'humans', 'bots', 'matches', 'rooms', 'spectators',
  'cpuMean', 'cpuPeak', 'rssMB', 'elMeanMs', 'elMaxMs', 'elP99Ms',
  'sockets', 'load1', 'memFreeMB', 'peakBots', 'peakHumans', 'peakAtSec',
]);

/** 图（管理页上下叠放、**共享同一条时间轴**）。`rightUnit` 存在 ⇒ 这个图是双轴（左 unit / 右 rightUnit）。 */
export const METRIC_CHARTS = Object.freeze([
  Object.freeze({ key: 'people', title: '人数', unit: '人' }),
  Object.freeze({ key: 'rooms', title: '房间', unit: '间' }),
  Object.freeze({ key: 'cpu', title: 'CPU', unit: '%' }),
  Object.freeze({ key: 'lat', title: '延迟 / 内存', unit: 'ms', rightUnit: 'MB' }),
]);

/**
 * 可画的系列。`col` = METRIC_FIELDS 的列号（-1 = 派生值：`from` ÷ `by` 两列）。
 * `agg`：同一步长桶里怎么聚合 —— `avg` 均值 / `max` 取峰值（**峰值类指标必须用 max**，
 * 否则降采样会把瞬时高压抹平）/ `atMax` 取「本桶 cpuPeak 最大的那一点」的值（峰值那一刻的 AI 数 / 秒偏移）。
 * `tone` = 颜色档 1..6（管理页从 --ch-N 取色 ⇒ 深浅色各自一套）。
 */
export const METRIC_SERIES = Object.freeze([
  Object.freeze({ key: 'humans', chart: 'people', label: '真人', unit: '人', col: 1, tone: 1, agg: 'avg' }),
  Object.freeze({ key: 'bots', chart: 'people', label: 'AI', unit: '人', col: 2, tone: 2, agg: 'avg' }),
  Object.freeze({ key: 'spectators', chart: 'people', label: '观战', unit: '人', col: 5, tone: 3, agg: 'avg' }),
  Object.freeze({ key: 'rooms', chart: 'rooms', label: '房间', unit: '间', col: 4, tone: 4, agg: 'avg' }),
  Object.freeze({ key: 'matches', chart: 'rooms', label: '游戏中', unit: '间', col: 3, tone: 1, agg: 'avg' }),
  Object.freeze({ key: 'cpuMean', chart: 'cpu', label: 'CPU 均值', unit: '%', col: 6, tone: 1, agg: 'avg' }),
  Object.freeze({ key: 'cpuPeak', chart: 'cpu', label: 'CPU 峰值', unit: '%', col: 7, tone: 2, agg: 'max', band: 'cpuMean' }),
  Object.freeze({ key: 'cpuPerAi', chart: 'cpu', label: '每 AI', unit: '%', col: -1, from: 6, by: 2, tone: 3, agg: 'avg' }),
  Object.freeze({ key: 'elMeanMs', chart: 'lat', label: '延迟均值', unit: 'ms', col: 9, tone: 1, agg: 'avg', axis: 'l' }),
  Object.freeze({ key: 'elP99Ms', chart: 'lat', label: '延迟 P99', unit: 'ms', col: 11, tone: 3, agg: 'max', axis: 'l' }),
  Object.freeze({ key: 'elMaxMs', chart: 'lat', label: '延迟峰值', unit: 'ms', col: 10, tone: 2, agg: 'max', axis: 'l' }),
  Object.freeze({ key: 'rssMB', chart: 'lat', label: '常驻内存', unit: 'MB', col: 8, tone: 4, agg: 'avg', axis: 'r' }),
  // ★ 峰值那一刻的现场（工序 114 服主追加口径）：它们**不画线**（`tipOnly`），只喂悬停读数 ——
  //   「几个 AI 造成了多大的瞬间压力」就靠这两条 + peakAtSec 回答。
  Object.freeze({ key: 'peakBots', chart: 'cpu', label: '峰值时 AI', unit: '人', col: 15, tone: 2, agg: 'atMax', tipOnly: true }),
  Object.freeze({ key: 'peakHumans', chart: 'cpu', label: '峰值时真人', unit: '人', col: 16, tone: 1, agg: 'atMax', tipOnly: true }),
  Object.freeze({ key: 'peakAtSec', chart: 'cpu', label: '峰值第几秒', unit: '秒', col: 17, tone: 3, agg: 'atMax', tipOnly: true }),
]);

/** 顶部那一行「读数」（不画线；短标签 + 单位，照 §4.12.8 的字数上限）。 */
export const METRIC_READOUTS = Object.freeze([
  Object.freeze({ key: 'humans', label: '真人', unit: '人' }),
  Object.freeze({ key: 'bots', label: 'AI', unit: '人' }),
  Object.freeze({ key: 'matches', label: '游戏中', unit: '间' }),
  Object.freeze({ key: 'rooms', label: '房间', unit: '间' }),
  Object.freeze({ key: 'sockets', label: '活跃连接', unit: '个' }),
  Object.freeze({ key: 'cpuMean', label: 'CPU 均值', unit: '%' }),
  Object.freeze({ key: 'cpuPeak', label: 'CPU 峰值', unit: '%' }),
  Object.freeze({ key: 'peakBots', label: '峰值时 AI', unit: '人' }),
  Object.freeze({ key: 'elMeanMs', label: '延迟均值', unit: 'ms' }),
  Object.freeze({ key: 'elMaxMs', label: '延迟峰值', unit: 'ms' }),
  Object.freeze({ key: 'rssMB', label: '常驻内存', unit: 'MB' }),
  Object.freeze({ key: 'memFreeMB', label: '可用内存', unit: 'MB' }),
  Object.freeze({ key: 'load1', label: '系统负载', unit: '' }),
]);

/**
 * 采样配置（全部环境变量可选；**默认值就是契约**）。
 *
 * | 环境变量 | 默认 | 夹取范围 | 含义 |
 * |---|---|---|---|
 * | `SP_ADMIN_METRICS_INTERVAL` | **60** | 5..3600 | 采样间隔（秒）—— 1 分钟 1 点 |
 * | `SP_ADMIN_METRICS_MAX` | **4320** | 120..43200 | 环形缓冲容量（点）—— 4320 × 60 s = **72 小时 = 3 日** |
 * | `SP_ADMIN_METRICS_PEAK_SEC` | **2** | 1..10 | 窗口内高频子采样间隔（秒）—— 用来取 CPU 分钟内峰值 |
 * | `SP_ADMIN_METRICS_EL_RES` | **2** | 1..100 | event-loop 直方图分辨率（ms）—— ★ 它同时是**均值的地板**，见下面那段实测 |
 * | `SP_ADMIN_METRICS_DIR` | （空） | — | ★ **设了才落盘**（JSONL + 轮转）；不设 = 一个字节都不写 |
 * | `SP_ADMIN_METRICS_FILE_MB` | 4 | 1..64 | 单个落盘文件上限（MB） |
 * | `SP_ADMIN_METRICS_KEEP` | 3 | 1..10 | 最多留几个文件（含当前）⇒ 磁盘上界 = FILE_MB × KEEP |
 * @param {Record<string,string|undefined>} [env]
 *
 * ★★ `SP_ADMIN_METRICS_EL_RES` 为什么默认 **2** 而不是 Node 文档里的 10（工序 114 实测）：
 *   `monitorEventLoopDelay` 记的是**定时器周期本身**（≈ resolution + 真实滞后），所以 `mean` 有一个
 *   **≈ resolution 的地板**。本机实测（空载 700 ms 窗口）：res 1 → mean 1.14 ms · res 2 → 2.27 ms ·
 *   res 5 → 5.55 ms · res 10 → 10.57 ms · res 20 → 20.48 ms。用 10 会让**空闲的服务器看起来一直在卡 10 ms**。
 *   ⇒ 默认 2 ms（地板 2.3 ms，真滞后仍能顶上去），`max` / `p99` **不受分辨率影响**（它们是真实滞后）。
 *   ★ 代价实测（本机 3 s 窗口、进程 CPU 占单核百分比）：关掉 0.53% · res 10 = 0.50% · **res 2 ≈ 1.1%** ·
 *   res 1 = 1.60% —— 在 350% 配额、约 0.06~0.13 核/房的 6150 上，这点开销可接受；要更省就把它调大。
 */
export function resolveMetricsConfig(env = process.env) {
  const num = (name, def, min, max) => {
    const v = Number(env[name]);
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  const dir = String(env.SP_ADMIN_METRICS_DIR || '').trim();
  return {
    intervalSec: num('SP_ADMIN_METRICS_INTERVAL', 60, 5, 3600),
    capacity: num('SP_ADMIN_METRICS_MAX', 4320, 120, 43200),
    peakEverySec: num('SP_ADMIN_METRICS_PEAK_SEC', 2, 1, 10),
    elResMs: num('SP_ADMIN_METRICS_EL_RES', 2, 1, 100),
    dir: dir || null,
    fileBytes: num('SP_ADMIN_METRICS_FILE_MB', 4, 1, 64) * 1024 * 1024,
    keep: num('SP_ADMIN_METRICS_KEEP', 3, 1, 10),
    /** ★ 磁盘纪律：随时留 ≥5 GB（拿不到空间信息时不拦 —— 绝不因此把服务搞挂）。 */
    minFreeBytes: 5 * 1024 * 1024 * 1024,
  };
}

/**
 * 系统级读数：**Linux 读 /proc**（loadavg / MemAvailable），其它平台**优雅降级**成 os 或 null。
 * ★ 拿不到就写 null（管理页显示「不可得」），**绝不拿 0 冒充**「负载 0」。
 *
 * ★ 实测的优雅降级（本机 Windows，见 114 报告 §本地证据）：
 *   · `loadavg` = **null**（Windows 的 `os.loadavg()` 恒为 `[0,0,0]`，那不是「负载 0」而是「没有这个数」）
 *     —— 线上是 Linux ⇒ 读 `/proc/loadavg`，`loadavgSource: "proc"`；
 *   · `memFreeMB` = `os.freemem()`（跨平台都真有值）。
 * @param {string} [platform]
 * @param {(p:string)=>string} [read]
 */
export function readSystemStats(platform = process.platform, read = (p) => fs.readFileSync(p, 'utf8')) {
  let load1 = null;
  let memFreeMB = null;
  let loadavgSource = null;
  if (platform === 'linux') {
    try {
      const m = /^([0-9.]+)/.exec(read('/proc/loadavg').trim());
      if (m) { load1 = Number(m[1]); loadavgSource = 'proc'; }
    } catch { /* 没有 /proc（容器）⇒ 降级 */ }
    try {
      const m = /MemAvailable:\s+(\d+)\s+kB/.exec(read('/proc/meminfo'));
      if (m) memFreeMB = Number(m[1]) / 1024;
    } catch { /* 同上 */ }
  }
  if (load1 === null && platform !== 'win32') {
    // ★ Windows 的 os.loadavg() 恒为 [0,0,0] —— 那不是「负载 0」，是「没有这个数」⇒ 不入库。
    try {
      const la = os.loadavg();
      if (Array.isArray(la) && Number.isFinite(la[0]) && la[0] > 0) { load1 = la[0]; loadavgSource = loadavgSource || 'os'; }
    } catch { /* ignore */ }
  }
  if (memFreeMB === null) {
    try { memFreeMB = os.freemem() / 1048576; loadavgSource = loadavgSource || 'os'; } catch { /* ignore */ }
  }
  return { load1, memFreeMB, loadavgSource };
}

/** 拿得到就是数字，拿不到一律 NaN（入库成 null；面板显示「不可得」）。 */
function numOrNaN(v) { return typeof v === 'number' && Number.isFinite(v) ? v : NaN; }
/** 保留 3 位小数（接口体积 + 面板读数都够用）。 */
function round3(v) { return Number.isFinite(v) ? Math.round(v * 1000) / 1000 : null; }
/** 秒数 → 人话（日志用）。 */
function spanText(sec) {
  if (!Number.isFinite(sec) || sec <= 0) return '0 秒';
  if (sec >= 86400) return (sec / 86400).toFixed(1) + ' 天';
  if (sec >= 3600) return (sec / 3600).toFixed(1) + ' 小时';
  return Math.round(sec) + ' 秒';
}

/**
 * 建一个指标采样器（★ 只有 `createModAdmin` 会建它 ⇒ 没令牌 = 连对象都不存在）。
 *
 * 内存：`capacity × METRIC_FIELDS.length × 8 B` —— 默认 4320 × 18 × 8 = **622,080 B ≈ 607 KiB**（定长，不增长）。
 * 磁盘（仅当设了 `dir`）：`fileMB × keep` 为硬上界，默认 4 MB × 3 = **≤12 MB**；
 * 实测一行 ≈ 150 B × 1440 点/日 ≈ **213 KB/日** ⇒ 3 日 ≈ **0.63 MB**（单文件 4 MB 够装 ≈19 天）。
 *
 * @param {{env?:object, intervalSec?:number, capacity?:number, peakEverySec?:number, elResMs?:number,
 *   dir?:string|null, fileBytes?:number, keep?:number, minFreeBytes?:number, log?:object,
 *   getCounts?:()=>object, now?:()=>number}} [opts]
 */
export function createMetricsSampler(opts = {}) {
  const cfg = resolveMetricsConfig(opts.env || process.env);
  const intervalSec = Number.isFinite(opts.intervalSec) ? opts.intervalSec : cfg.intervalSec;
  const capacity = Number.isFinite(opts.capacity) ? opts.capacity : cfg.capacity;
  const elResMs = Number.isFinite(opts.elResMs) ? opts.elResMs : cfg.elResMs;
  const dir = opts.dir === undefined ? cfg.dir : opts.dir;
  const fileBytes = Number.isFinite(opts.fileBytes) ? opts.fileBytes : cfg.fileBytes;
  const keep = Number.isFinite(opts.keep) ? opts.keep : cfg.keep;
  const minFreeBytes = Number.isFinite(opts.minFreeBytes) ? opts.minFreeBytes : cfg.minFreeBytes;
  const log = opts.log || console;
  const getCounts = typeof opts.getCounts === 'function' ? opts.getCounts : () => ({});
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  // ★ 窗口内要至少 2 次子采样才谈得上「峰值」：子采样间隔不许超过窗口的一半。
  const peakEverySec = Math.max(1, Math.min(
    Number.isFinite(opts.peakEverySec) ? opts.peakEverySec : cfg.peakEverySec,
    Math.max(1, Math.floor(intervalSec / 2))));

  const stride = METRIC_FIELDS.length;
  const buf = new Float64Array(capacity * stride);
  let count = 0;
  let head = 0;
  let timer = 0;
  let peakTimer = 0;
  let running = false;
  let restoreCount = 0;
  let lastSys = { load1: null, memFreeMB: null, loadavgSource: null };

  // 窗口级基线（均值）与子采样基线（峰值）**各自独立**，互不干扰。
  let meanCpu = process.cpuUsage();
  let meanTs = now();
  let subCpu = process.cpuUsage();
  let subTs = meanTs;
  let peak = { v: NaN, bots: NaN, humans: NaN, at: NaN };

  let el = null;
  try {
    el = monitorEventLoopDelay({ resolution: elResMs });
    // ★★ 必须显式 enable()：**不 enable 的直方图 count 恒为 0、mean 是 NaN**（Windows / Linux 都一样；
    //    实测不 enable 时阻塞事件循环 220 ms 也读不到任何样本）⇒ 「卡不卡」就会永远不可得。
    el.enable();
  } catch { el = null; }

  const persist = {
    configured: !!dir, active: false, errors: 0, rotates: 0, freeBytes: null, gateAt: 0,
    reason: dir ? '尚未启动' : '未设 SP_ADMIN_METRICS_DIR（默认不落盘）',
  };

  const slotOf = (i) => ((head - count + i) % capacity + capacity) % capacity;
  const tsOf = (i) => buf[slotOf(i) * stride];

  /** 写一个点到环形缓冲（满了就覆盖最老的那个）。 */
  function record(rec) {
    const base = head * stride;
    for (let c = 0; c < stride; c++) buf[base + c] = numOrNaN(rec[METRIC_FIELDS[c]]);
    head = (head + 1) % capacity;
    if (count < capacity) count++;
    return rec;
  }

  /** 环形缓冲里第 i 个点（0 = 最老）→ 普通对象（NaN → null）。 */
  function pointAt(i) {
    const base = slotOf(i) * stride;
    const out = {};
    for (let c = 0; c < stride; c++) {
      const v = buf[base + c];
      out[METRIC_FIELDS[c]] = Number.isFinite(v) ? v : null;
    }
    // 派生值（现算，不占内存）：每 AI 的 CPU 均值（没有 AI ⇒ null，绝不除出 Infinity）
    out.cpuPerAi = (out.cpuMean !== null && out.bots) ? round3(out.cpuMean / out.bots) : null;
    return out;
  }

  // ---- 可选落盘（JSONL + 轮转；不设 dir 时这些函数一次都不会跑）------------------------------------

  const filePath = (i) => path.join(dir, i ? 'metrics.jsonl.' + i : 'metrics.jsonl');

  function freeBytesOf(p) {
    try {
      if (typeof fs.statfsSync !== 'function') return null;
      const st = fs.statfsSync(p);
      const bs = Number(st.bsize);
      const avail = Number(st.bavail);
      if (!Number.isFinite(bs) || !Number.isFinite(avail)) return null;
      return bs * avail;
    } catch { return null; }
  }

  /** ★ 磁盘门禁：可用空间 < 5 GB ⇒ 停写（每小时后复核一次，恢复到 5 GB 以上再自动续写）。 */
  function diskGate(force) {
    if (!dir) return false;
    const t = now();
    if (!force && persist.gateAt && t - persist.gateAt < 3600 * 1000) return persist.active;
    persist.gateAt = t;
    const free = freeBytesOf(dir);
    persist.freeBytes = free;
    if (free !== null && free < minFreeBytes) {
      if (persist.active || force) {
        log.warn?.('[admin] 指标落盘已停写：可用空间 ' + (free / 1073741824).toFixed(2) + ' GB < 5 GB（' + dir + '）');
      }
      persist.active = false;
      persist.reason = '可用空间 < 5 GB，已停写';
      return false;
    }
    persist.active = true;
    persist.reason = null;
    return true;
  }

  /** 满了就轮转：metrics.jsonl → .1 → .2 …，最多留 keep 个（磁盘上界 = fileBytes × keep）。 */
  function rotateIfNeeded(addBytes) {
    let size = 0;
    try { size = fs.statSync(filePath(0)).size; } catch { size = 0; }
    if (size + addBytes <= fileBytes) return;
    try { fs.rmSync(filePath(keep - 1), { force: true }); } catch { /* 没有就算了 */ }
    for (let i = keep - 2; i >= 1; i--) {
      try { fs.renameSync(filePath(i), filePath(i + 1)); } catch { /* 没有就算了 */ }
    }
    try { fs.renameSync(filePath(0), filePath(1)); } catch { /* 没有就算了 */ }
    persist.rotates++;
    log.info?.('[admin] 指标落盘轮转：metrics.jsonl → metrics.jsonl.1（单文件上限 ' + Math.round(fileBytes / 1048576) + ' MB，最多留 ' + keep + ' 个）');
  }

  function appendLine(rec) {
    if (!persist.configured) return;
    if (!diskGate(false)) return;
    const line = JSON.stringify(METRIC_FIELDS.map((k) => { const v = rec[k]; return Number.isFinite(v) ? v : null; })) + '\n';
    const bytes = Buffer.byteLength(line);
    try {
      fs.mkdirSync(dir, { recursive: true });
      rotateIfNeeded(bytes);
      fs.appendFile(filePath(0), line, (err) => {
        if (!err) return;
        persist.errors++;
        if (persist.errors === 1) log.warn?.('[admin] 指标落盘失败（不再重复刷日志）：' + (err && err.message ? err.message : err));
      });
    } catch (e) {
      persist.errors++;
      if (persist.errors === 1) log.warn?.('[admin] 指标落盘失败（不再重复刷日志）：' + (e && e.message ? e.message : e));
    }
  }

  /** 重启不丢历史：把最近 keep 个文件里的点读回环形缓冲（先老后新，只留最后 capacity 个）。 */
  function restore() {
    if (!dir) return 0;
    const lines = [];
    for (let i = keep - 1; i >= 0; i--) {
      try {
        const text = fs.readFileSync(filePath(i), 'utf8');
        for (const l of text.split('\n')) if (l.trim()) lines.push(l);
      } catch { /* 没有这个文件就算了 */ }
    }
    const from = Math.max(0, lines.length - capacity);
    let loaded = 0;
    for (let i = from; i < lines.length; i++) {
      let arr = null;
      try { arr = JSON.parse(lines[i]); } catch { continue; }
      if (!Array.isArray(arr) || arr.length !== stride) continue;
      const rec = {};
      for (let c = 0; c < stride; c++) rec[METRIC_FIELDS[c]] = typeof arr[c] === 'number' ? arr[c] : NaN;
      record(rec);
      loaded++;
    }
    return loaded;
  }

  // ---- 采样 ------------------------------------------------------------------------------------

  /**
   * 高频子采样：只算**瞬时 CPU%**（区间 = 两次子采样的实际墙钟，WORKBENCH 坑 14），
   * 并记下它出现那一刻的 bots / humans 与窗口内秒偏移。**不写环形缓冲**（只在窗口结束时报峰值）。
   */
  function subSample() {
    const ts = now();
    const dt = ts - subTs;
    const cpu = process.cpuUsage();
    const dUs = (cpu.user - subCpu.user) + (cpu.system - subCpu.system);
    subCpu = cpu;
    subTs = ts;
    if (!(dt > 0)) return;
    const pct = (dUs / 1000) / dt * 100;
    // ★ 只记"更高的那个"：峰值还空着（NaN）时必须收下第一个有限值，之后才逐次比大小。
    //   （NaN 参与比较恒为 false ⇒ 判据里必须显式写 Number.isFinite(peak.v)，否则会把第一个值也丢掉。）
    if (Number.isFinite(pct) && Number.isFinite(peak.v) && pct <= peak.v) return;
    let counts = {};
    try { counts = getCounts() || {}; } catch { counts = {}; }
    peak = { v: pct, bots: numOrNaN(counts.bots), humans: numOrNaN(counts.humans), at: (ts - meanTs) / 1000 };
  }

  /**
   * 取一个窗口的样本：均值（窗口 CPU 总增量 ÷ **实际墙钟**）× + 峰值（窗口内子采样 max）
   * + event-loop 直方图（mean / max / p99，读后 reset ⇒ 就是**本窗口内**的统计）。
   */
  function sample() {
    const ts = now();
    const dt = ts - meanTs;
    const cpu = process.cpuUsage();
    const dUs = (cpu.user - meanCpu.user) + (cpu.system - meanCpu.system);
    meanCpu = cpu;
    meanTs = ts;

    let counts = {};
    try { counts = getCounts() || {}; } catch { counts = {}; }
    let rssMB = NaN;
    try { rssMB = process.memoryUsage().rss / 1048576; } catch { /* ignore */ }
    let mean = NaN; let max = NaN; let p99 = NaN;
    if (el) {
      try { mean = el.mean / 1e6; max = el.max / 1e6; p99 = el.percentile(99) / 1e6; el.reset(); } catch { /* ignore */ }
    }
    lastSys = readSystemStats();
    const rec = {
      ts,
      humans: numOrNaN(counts.humans), bots: numOrNaN(counts.bots), matches: numOrNaN(counts.matches),
      rooms: numOrNaN(counts.rooms), spectators: numOrNaN(counts.spectators),
      cpuMean: dt > 0 ? (dUs / 1000) / dt * 100 : NaN,
      cpuPeak: peak.v,
      rssMB, elMeanMs: mean, elMaxMs: max, elP99Ms: p99,
      sockets: numOrNaN(counts.sockets), load1: numOrNaN(lastSys.load1), memFreeMB: numOrNaN(lastSys.memFreeMB),
      peakBots: peak.bots, peakHumans: peak.humans, peakAtSec: peak.at,
    };
    record(rec);
    appendLine(rec);
    // 开新窗口：子采样基线归零，峰值清空。
    peak = { v: NaN, bots: NaN, humans: NaN, at: NaN };
    subCpu = process.cpuUsage();
    subTs = ts;
    return rec;
  }

  /** 起采样器（幂等）。★ 定时器 unref ⇒ 采样器**不会**把进程钉住（测试里也不会因此挂住）。 */
  function start() {
    if (running) return false;
    restoreCount = restore();
    meanCpu = process.cpuUsage();
    meanTs = now();
    subCpu = process.cpuUsage();
    subTs = meanTs;
    peak = { v: NaN, bots: NaN, humans: NaN, at: NaN };
    if (el) { try { el.reset(); } catch { /* ignore */ } }
    timer = setInterval(() => { try { sample(); } catch (e) { log.warn?.('[admin] 指标采样失败：' + (e && e.message ? e.message : e)); } }, intervalSec * 1000);
    if (typeof timer.unref === 'function') timer.unref();
    peakTimer = setInterval(() => { try { subSample(); } catch { /* ignore */ } }, peakEverySec * 1000);
    if (typeof peakTimer.unref === 'function') peakTimer.unref();
    running = true;
    if (persist.configured) diskGate(true);
    log.info?.('[admin] 指标采样器已启动：每 ' + intervalSec + ' 秒 1 点（窗口内每 ' + peakEverySec + ' 秒取一次瞬时峰值）'
      + ' · 环形缓冲 ' + capacity + ' 点（回溯 ' + spanText(capacity * intervalSec) + '，约 ' + (capacity * stride * 8 / 1024).toFixed(0) + ' KiB 内存）'
      + ' · 落盘' + (persist.active ? '开（单文件 ' + Math.round(fileBytes / 1048576) + ' MB × 最多 ' + keep + ' 个 = ≤' + Math.round(fileBytes * keep / 1048576) + ' MB）' : '关（' + persist.reason + '）')
      + (restoreCount ? ' · 已从磁盘恢复 ' + restoreCount + ' 点' : ''));
    return true;
  }

  /** 停采样器（管理面本进程不需要调；测试与优雅退出用得着）。 */
  function dispose() {
    if (timer) { clearInterval(timer); timer = 0; }
    if (peakTimer) { clearInterval(peakTimer); peakTimer = 0; }
    running = false;
    if (el) { try { el.disable(); } catch { /* ignore */ } }
  }

  function diskStats() {
    if (!persist.configured) return { files: 0, bytes: 0, rotates: 0 };
    let files = 0; let bytes = 0;
    for (let i = 0; i < keep; i++) {
      try { const st = fs.statSync(filePath(i)); files++; bytes += st.size; } catch { /* 没有就算了 */ }
    }
    return { files, bytes, rotates: persist.rotates };
  }

  function info() {
    return {
      running, intervalSec, peakEverySec, capacity, spanSec: capacity * intervalSec,
      points: count, oldestTs: count ? tsOf(0) : null, newestTs: count ? tsOf(count - 1) : null,
      restored: restoreCount, env: { platform: process.platform, loadavgSource: lastSys.loadavgSource },
      persist: { configured: persist.configured, active: persist.active, reason: persist.reason, errors: persist.errors },
    };
  }

  /**
   * 查询窗口 → 序列（列式数组，前端直接喂 Canvas；空白桶 = null ⇒ 折线断开）。
   *
   * @param {{since?:number, until?:number, stepSec?:number, raw?:boolean}} [q] `since`/`until` 是 **ms epoch**；
   *   不传 `since` ⇒ 默认**过去 6 小时**（服主口径：可调范围 1/3/6/12/24/72 小时，默认 6）。
   */
  function snapshot(q = {}) {
    const newest = count ? tsOf(count - 1) : null;
    const oldest = count ? tsOf(0) : null;
    // ★ 一个点都还没有（刚重启且没落盘）⇒ 回一个「过去 6 小时」的**空**窗口（前端据此画空状态，不崩）。
    let until = newest === null ? now() : (Number.isFinite(q.until) ? Math.min(q.until, newest) : newest);
    let since = Number.isFinite(q.since) ? q.since : until - 6 * 3600 * 1000;
    if (since > until) { const t = since; since = until; until = t; }
    // ★ 缓冲里没有更早的点 ⇒ 窗口左端贴住最老的点（否则 72 小时窗口在刚起服时会算出一个荒谬的步长）。
    if (oldest !== null && since < oldest) since = oldest;
    const spanMs = Math.max(0, until - since);

    const maxBuckets = 720;
    let stepSec;
    if (q.raw) stepSec = intervalSec;
    else if (Number.isFinite(q.stepSec) && q.stepSec > 0) stepSec = Math.max(intervalSec, q.stepSec);
    else stepSec = Math.max(intervalSec, Math.ceil((spanMs / maxBuckets) / intervalSec / 1000) * intervalSec);
    const stepMs = stepSec * 1000;
    const buckets = Math.min(20000, Math.max(1, Math.ceil(spanMs / stepMs) + (spanMs === 0 ? 1 : 0)));

    const sums = new Float64Array(buckets * stride);
    const colMax = new Float64Array(buckets * stride).fill(NaN);   // ★ 峰值类指标桶内取 max（均值会把瞬时高压抹平）
    const ns = new Int32Array(buckets);
    const bestPeak = new Float64Array(buckets).fill(NaN);
    // ★ atMax 三列（峰值那一刻的 AI 数 / 真人 / 秒偏移）单独存：它们不是"求平均"，而是"取峰值那一点的值"。
    const atMax = new Float64Array(buckets * 3).fill(NaN);
    const atCols = [15, 16, 17];   // peakBots / peakHumans / peakAtSec 在 METRIC_FIELDS 里的列号

    for (let i = 0; i < count; i++) {
      const ts = tsOf(i);
      if (ts < since || ts > until) continue;
      const b = Math.min(buckets - 1, Math.max(0, Math.floor((ts - since) / stepMs)));
      const base = slotOf(i) * stride;
      for (let c = 0; c < stride; c++) {
        const v = buf[base + c];
        if (!Number.isFinite(v)) continue;
        sums[b * stride + c] += v;
        const m = colMax[b * stride + c];
        if (!(v <= m)) colMax[b * stride + c] = v;
      }
      ns[b]++;
      const pk = buf[base + 7];                        // cpuPeak
      if (Number.isFinite(pk) && !(pk <= bestPeak[b])) {
        bestPeak[b] = pk;
        for (let k = 0; k < atCols.length; k++) atMax[b * 3 + k] = buf[base + atCols[k]];
      }
    }

    const tsArr = new Array(buckets).fill(null);
    for (let b = 0; b < buckets; b++) if (ns[b]) tsArr[b] = since + b * stepMs;

    const series = METRIC_SERIES.map((s) => {
      const values = new Array(buckets).fill(null);
      for (let b = 0; b < buckets; b++) {
        if (!ns[b]) continue;
        const n = ns[b];
        let v = null;
        if (s.agg === 'max' && s.col >= 0) {
          const m = colMax[b * stride + s.col];
          v = Number.isFinite(m) ? m : null;
        } else if (s.agg === 'atMax' && s.col >= 0) {
          const idx = atCols.indexOf(s.col);
          v = idx >= 0 && Number.isFinite(atMax[b * 3 + idx]) ? atMax[b * 3 + idx] : null;
        } else if (s.col >= 0) {
          v = sums[b * stride + s.col] / n;
        } else {
          const num = sums[b * stride + s.from] / n;
          const den = sums[b * stride + s.by] / n;
          v = den > 0 ? num / den : null;
        }
        values[b] = round3(v);
      }
      return {
        key: s.key, chart: s.chart, label: s.label, unit: s.unit, tone: s.tone,
        axis: s.axis || 'l', agg: s.agg, band: s.band || null, tipOnly: !!s.tipOnly, values,
      };
    });

    const ds = diskStats();
    return {
      sampling: {
        intervalSec, peakEverySec, capacity, spanSec: capacity * intervalSec,
        points: count, oldestTs: oldest, newestTs: newest,
        elResMs, platform: process.platform, loadavgSource: lastSys.loadavgSource,
        persist: {
          configured: persist.configured, active: persist.active, reason: persist.reason,
          files: ds.files, bytes: ds.bytes, rotates: ds.rotates, errors: persist.errors,
          fileMB: Math.round(fileBytes / 1048576), keep,
          freeGB: persist.freeBytes === null ? null : round3(persist.freeBytes / 1073741824),
        },
      },
      query: { since, until, stepSec, buckets, raw: !!q.raw },
      ts: tsArr,
      charts: METRIC_CHARTS,
      readouts: METRIC_READOUTS,
      series,
      latest: count ? pointAt(count - 1) : null,
    };
  }

  return {
    start, dispose, info, snapshot, sample, subSample, record, restore,
    get running() { return running; },
    get points() { return count; },
  };
}

// =============================================================================================
// ★★ 官方 release 追踪 + 更新提示（工序 host-024）
//
// 服主需求（原话，2026-10-13）：
//   「为了避免以后再次出现**未跟上官方 github 进度**的问题，能够在 mod 管理页直接**部署一个定期追踪
//     官方 release 版本和更新说明**，并在管理页**给出对应的更新提示**的小组件吗」
//
// 四条纪律：
//   1. **只在管理面挂载后才有**：追踪器由 createModAdmin 创建，写在 `if (!modsDir || !token) return null;`
//      **之后** ⇒ 没设 SP_ADMIN_TOKEN 时连对象都不建、**一个定时器都不会起**、
//      /admin/api/upstream-release 与 /admin 一起 404（与上游逐字节等价）。
//   2. **只读出网、不改服务器状态**：只用 GitHub 的**只读** release API（GET），不下载任何资产、
//      不写 app / mods / 金标准。资产清单只报名字 / 大小 / digest。
//   3. **零凭据**：不认证即可。将来若要 token ⇒ **只能从环境变量读**（SP_ADMIN_UPSTREAM_TOKEN），
//      绝不落盘、绝不进响应、绝不进报告。
//   4. **失败不伤任何现有功能**：短超时（默认 10 s）+ 失败只写 error 字段，
//      继续把**上一次成功的缓存**展示出来；定时器 unref ⇒ 不钉住进程。
//
// ★ 为什么走 api.github.com 而不走 github.com（2026-10-13 在 s10-2 上的只读实测）：
//   `api.github.com/repos/.../releases/latest` ⇒ **200 / 0.80 s**；
//   同一台机上 `https://github.com/` ⇒ **8 s 超时（curl exit 28，只收到 555776 B 的首页 HTML）**。
//   ⇒ **只有 API 这一条路**（也正是服主说的「官方 github 进度」能被程序读到的唯一入口）。
// =============================================================================================

/** GitHub 仓库（服主口径：官方仓就是它；package.json 的 repository 也是同一个）。 */
export const UPSTREAM_REPO = 'sganggs/Stronghold-Protocol';
/** 默认间隔 **60 分钟**（≥30 分钟硬下限；未认证 API 限额 60 次/小时 ⇒ 60 分钟档最稳）。 */
export const UPSTREAM_DEFAULT_INTERVAL_MIN = 60;
/** 间隔硬下限 **30 分钟**（认证限额 60/h ⇒ 30 分钟 = 2 次/小时，留足余量）。 */
export const UPSTREAM_MIN_INTERVAL_MIN = 30;
/** 请求超时上限 10 s（GitHub API 实测 0.8~1.3 s；给足但不拖住事件循环）。 */
export const UPSTREAM_MAX_TIMEOUT_MS = 10000;
/** 更新说明摘要的字数上限（正文太长就截断 + truncated 标记，前端再接「展开全文」）。 */
export const UPSTREAM_BODY_CHARS = 700;
/** 随响应下发的**完整**正文上限（点了「展开全文」用；再长就只保留下载链接，不把响应撑大）。 */
export const UPSTREAM_BODY_MAX = 20000;
/** 最新一次成功轮询的落盘文件名（只在设了 SP_ADMIN_UPSTREAM_DIR 时写）。 */
export const UPSTREAM_FILE = 'upstream-release.json';

const UPSTREAM_UA = 'stronghold-protocol-mod-admin';

/**
 * 解析一个 release tag / 版本串 → 可比对的结构。**绝不抛异常**（奇怪 tag 一律当「解析不出来」）。
 *
 * 认得的形态：`v0.2.5` · `0.2.5` · `0.2.5-hotfix` · `0.2.5+build.7` · `0.2.5-rc.1`（pre 段另存）。
 * 认不出来的（`nightly` / `2026-10-12` / `v2` / 空串）⇒ `{ raw, version: null, pre: null, parts: [] }`。
 * ★ 判据是「**点分数字**开始」 + **至少两段**（`0.2` / `0.2.5`），不是「必须以 v 开头」——
 *   官方哪天去掉 v 前缀也照常工作。
 * ★★ 为什么要「至少两段」：`2026-10-12` 这种**日期 tag** 会被单段规则当成版本「2026」，
 *   于是和 `0.2.5` 一比就得出「我们落后 2024 个版本」这种荒谬结论。宁可**认不出来**
 *   （⇒ 不判定落后、如实写 warning），也不要**误报有新版本** —— 提示的准确性优先于覆盖率。
 * @param {unknown} s
 * @returns {{raw:string, version:string|null, pre:string|null, parts:number[]}}
 */
export function parseVersionTag(s) {
  const raw = String(s == null ? '' : s).trim();
  const m = /^v?(\d+(?:\.\d+)+)(?:[-+](.+))?$/.exec(raw);
  if (!m) return { raw, version: null, pre: null, parts: [] };
  return {
    raw,
    version: m[1],
    pre: m[2] || null,
    parts: m[1].split('.').map((x) => Number(x)),
  };
}

/** 逐段比较两个数字数组（缺段按 0；NaN 段按 0）。返回 -1 / 0 / 1。 */
function compareParts(a, b) {
  const n = Math.max(a.length, b.length, 1);
  for (let i = 0; i < n; i++) {
    const x = Number.isFinite(a[i]) ? a[i] : 0;
    const y = Number.isFinite(b[i]) ? b[i] : 0;
    if (x < y) return -1;
    if (x > y) return 1;
  }
  return 0;
}

/**
 * 「我们 / 部署版」vs「官方 latest tag」的比对（**纯函数**，返回给接口的 `versionCheck` 形状）。
 *
 * @param {string} currentRaw 当前版本（`/healthz` 的 app，即部署版；或树的 package.json version）
 * @param {string} latestRaw  官方 tag
 * @returns {{current:string, latest:string, currentVersion:string|null, latestVersion:string|null,
 *   latestPre:string|null, compare:number|null, behind:boolean, behindCount:number|null,
 *   note:string|null, warning:string|null}}
 *
 * `behind` 的三条口径（**诚实 > 聪明**）：
 *   · 两边都解析得出来 ⇒ 逐段比大小；`behindCount` = 首段差异的数值差（0.2.4 vs 0.2.5 ⇒ 1）；
 *   · 数字段完全相等但官方带 pre 段（`0.2.5` vs `0.2.5-hotfix`）⇒ compare 0、**behind=false**、
 *     但给 `note` 说明「官方同版本另有 pre 标记」—— 这是**同名修订**，不是落后一个版本；
 *   · 任一边解析不出来（`nightly` 之类）⇒ compare=null、**behind=false**、`warning` 写明原因
 *     （绝不在信息不足时喊「有更新」，也绝不崩）。
 */
export function compareVersionTags(currentRaw, latestRaw) {
  const cur = parseVersionTag(currentRaw);
  const lat = parseVersionTag(latestRaw);
  const out = {
    current: cur.raw || null, latest: lat.raw || null,
    currentVersion: cur.version, latestVersion: lat.version, latestPre: lat.pre,
    compare: null, behind: false, behindCount: null, note: null, warning: null,
  };
  if (!cur.version || !lat.version) {
    out.warning = '版本号解析不出来（当前 ' + (cur.raw || '（空）') + ' / 官方 ' + (lat.raw || '（空）') + '）；不做落后判定';
    return out;
  }
  const c = compareParts(cur.parts, lat.parts);
  out.compare = c;
  out.behind = c < 0;
  if (c < 0) {
    for (let i = 0; i < Math.max(cur.parts.length, lat.parts.length); i++) {
      const x = Number.isFinite(cur.parts[i]) ? cur.parts[i] : 0;
      const y = Number.isFinite(lat.parts[i]) ? lat.parts[i] : 0;
      if (x !== y) { out.behindCount = Math.abs(y - x); break; }
    }
    if (out.behindCount === null) out.behindCount = 1;
    return out;
  }
  if (c === 0 && lat.pre) out.note = '官方同版本另有标记「' + lat.pre + '」（不是更高版本）';
  return out;
}

/** 把 GitHub 的 release JSON 收敛成管理页要的形状（**纯函数**，单测直接喂 fixture）。 */
export function summarizeRelease(json) {
  const j = json && typeof json === 'object' ? json : {};
  const body = typeof j.body === 'string' ? j.body.replace(/\r\n/g, '\n').trim() : '';
  const truncated = body.length > UPSTREAM_BODY_CHARS;
  const assets = Array.isArray(j.assets) ? j.assets : [];
  const missing = [];
  if (j.tag_name == null) missing.push('tag_name');
  if (j.published_at == null) missing.push('published_at');
  if (j.body == null) missing.push('body');
  if (!Array.isArray(j.assets)) missing.push('assets');
  return {
    tag: j.tag_name == null ? null : String(j.tag_name),
    name: j.name == null ? null : String(j.name),
    publishedAt: j.published_at == null ? null : String(j.published_at),
    url: j.html_url == null ? null : String(j.html_url),
    prerelease: j.prerelease === true,
    draft: j.draft === true,
    // ★ `bodySummary` = 给面板直接显示的那一段（超长截断，`bodyTruncated` 标记）；
    //   `body` = 完整正文（点了「展开全文」才用）—— 与服务端**同一个上限**，不在前端另算一份。
    bodySummary: truncated ? body.slice(0, UPSTREAM_BODY_CHARS) : body,
    body: body.length > UPSTREAM_BODY_MAX ? body.slice(0, UPSTREAM_BODY_MAX) : body,
    bodyChars: body.length,
    bodyTruncated: truncated,
    // 资产清单（**只报名字 / 大小 / digest，不下载任何东西**）。digest 是 GitHub 的 `sha256:…`；
    // 老资产没有它 ⇒ 如实写 null，**不伪造**摘要。
    assets: assets.map((a) => ({
      name: a && a.name != null ? String(a.name) : null,
      size: a && Number.isFinite(a.size) ? a.size : null,
      digest: a && typeof a.digest === 'string' && a.digest ? a.digest : null,
    })),
    /** 少了哪些字段（透明登记：管理页据此知道这份元数据不全，而不是静默显示空）。 */
    missing,
  };
}

/**
 * 追踪配置（全部环境变量可选；**默认值就是契约**）。
 *
 * | 环境变量 | 默认 | 夹取范围 | 含义 |
 * |---|---|---|---|
 * | `SP_ADMIN_UPSTREAM` | `1`（开） | — | 设成 `0` / `off` / `false` / `no` ⇒ **整块关掉**（接口回 enabled:false，定时器不起） |
 * | `SP_ADMIN_UPSTREAM_INTERVAL` | **60** | **30..1440** | 轮询间隔（分钟）—— 未认证 API 限额 60 次/小时 |
 * | `SP_ADMIN_UPSTREAM_TIMEOUT` | 10000 | 1000..**10000** | 单次请求超时（ms） |
 * | `SP_ADMIN_UPSTREAM_DIR` | （空） | — | ★ **设了才落盘**上次成功结果（104 的 `SP_ADMIN_METRICS_DIR` 同一风格） |
 * | `SP_ADMIN_UPSTREAM_URL` | api.github.com 的 latest | — | ★ **测试 / 排障用**：换端点（本机模拟网络失败就指它） |
 * | `SP_ADMIN_UPSTREAM_TOKEN` | （空） | — | ★ 可选：将来 GitHub 限流时填。**只从环境变量读，绝不落盘 / 进响应 / 进报告** |
 * @param {Record<string,string|undefined>} [env]
 */
export function resolveUpstreamConfig(env = process.env) {
  const num = (name, def, min, max) => {
    const v = Number(env[name]);
    if (!Number.isFinite(v)) return def;
    return Math.min(max, Math.max(min, Math.round(v)));
  };
  const off = String(env.SP_ADMIN_UPSTREAM || '').trim().toLowerCase();
  const dir = String(env.SP_ADMIN_UPSTREAM_DIR || '').trim();
  const url = String(env.SP_ADMIN_UPSTREAM_URL || '').trim();
  return {
    enabled: !(off === '0' || off === 'off' || off === 'false' || off === 'no'),
    intervalMin: num('SP_ADMIN_UPSTREAM_INTERVAL', UPSTREAM_DEFAULT_INTERVAL_MIN, UPSTREAM_MIN_INTERVAL_MIN, 1440),
    timeoutMs: num('SP_ADMIN_UPSTREAM_TIMEOUT', UPSTREAM_MAX_TIMEOUT_MS, 1000, UPSTREAM_MAX_TIMEOUT_MS),
    dir: dir || null,
    url: url || ('https://api.github.com/repos/' + UPSTREAM_REPO + '/releases/latest'),
    /** ★ 只放内存，**永不**进响应 / 日志 / 磁盘（有值 ⇒ 请求多一个 Authorization 头）。 */
    token: String(env.SP_ADMIN_UPSTREAM_TOKEN || '').trim() || null,
    repo: UPSTREAM_REPO,
  };
}

/**
 * 建一个官方 release 追踪器（★ 只有 `createModAdmin` 会建它 ⇒ 无令牌实例里连对象都不存在）。
 *
 * 状态机（单一真相 = `store`）：
 *   · `store.latest`  最近一次**成功**读到的 release 摘要（失败时**原样保留** ⇒ 面板继续显示上次的缓存）；
 *   · `store.okAt`    最近一次成功的时刻（ms）；`store.checked` 最近一次**真的发出请求**的时刻；
 *   · `store.etag`    上一条响应的 ETag（下次带 `If-None-Match`；**304 只更新 `okAt`**，不重解析正文）；
 *   · `store.error`   最近一次失败的原因（成功即清空）。
 *
 * @param {{env?:object, getCurrent?:()=>string|null, treeVersion?:string|null, log?:object,
 *   fetchImpl?:Function, url?:string, intervalMin?:number, timeoutMs?:number, dir?:string|null,
 *   now?:()=>number, autostart?:boolean, forceRespect?:boolean, minFreeBytes?:number}} [opts]
 */
export function createUpstreamPoller(opts = {}) {
  const cfg = resolveUpstreamConfig(opts.env || process.env);
  const log = opts.log || console;
  const now = typeof opts.now === 'function' ? opts.now : () => Date.now();
  const fetchImpl = opts.fetchImpl || (typeof fetch === 'function' ? fetch : null);
  const url = opts.url || cfg.url;
  const intervalMin = Number.isFinite(opts.intervalMin) ? opts.intervalMin : cfg.intervalMin;
  const timeoutMs = Number.isFinite(opts.timeoutMs) ? opts.timeoutMs : cfg.timeoutMs;
  const dir = opts.dir === undefined ? cfg.dir : opts.dir;
  const minFreeBytes = Number.isFinite(opts.minFreeBytes) ? opts.minFreeBytes : 5 * 1024 * 1024 * 1024;
  const getCurrent = typeof opts.getCurrent === 'function' ? opts.getCurrent : () => null;
  const treeVersion = opts.treeVersion === undefined ? null : opts.treeVersion;
  const file = dir ? path.join(dir, UPSTREAM_FILE) : null;
  /** ★ 最小重试间隔 = 1 分钟：`?refresh=1` 也**不破**这个闸（限额 60/h 是硬约束）。 */
  const minRetryMs = 60 * 1000;
  const intervalMs = intervalMin * 60 * 1000;

  const store = {
    latest: null, okAt: null, checked: null, etag: null, error: null,
    fetched: 0, notModified: 0, failures: 0, restoredAt: null, restoredFrom: null,
  };
  let timer = 0;
  let running = false;
  let busy = false;
  let inflight = null;

  // ---- 可选落盘（只在设了 dir 时跑；与指标落盘同一套磁盘纪律：≥5 GB）----------------------------

  function freeBytesOf(p) {
    try {
      if (typeof fs.statfsSync !== 'function') return null;
      const st = fs.statfsSync(p);
      const bs = Number(st.bsize); const avail = Number(st.bavail);
      return (Number.isFinite(bs) && Number.isFinite(avail)) ? bs * avail : null;
    } catch { return null; }
  }

  function persist() {
    if (!file) return false;
    const free = freeBytesOf(dir);
    if (free !== null && free < minFreeBytes) {
      log.warn?.('[admin] 官方 release 缓存未落盘：可用空间 ' + (free / 1073741824).toFixed(2) + ' GB < 5 GB（' + dir + '）');
      return false;
    }
    try {
      fs.mkdirSync(dir, { recursive: true });
      const tmp = file + '.tmp-' + process.pid;
      fs.writeFileSync(tmp, JSON.stringify({ v: 1, latest: store.latest, okAt: store.okAt, etag: store.etag }, null, 2) + '\n', 'utf8');
      fs.renameSync(tmp, file);
      return true;
    } catch (e) {
      log.warn?.('[admin] 官方 release 缓存落盘失败（不再重复刷日志）：' + (e && e.message ? e.message : e));
      return false;
    }
  }

  /** 启动时读回上一次的成功结果（**重启不丢**，离线也有东西可展示）。 */
  function restore() {
    if (!file) return false;
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || typeof j !== 'object' || !j.latest) return false;
      store.latest = j.latest;
      store.okAt = Number.isFinite(j.okAt) ? j.okAt : null;
      store.etag = typeof j.etag === 'string' && j.etag ? j.etag : null;
      store.restoredAt = now();
      store.restoredFrom = UPSTREAM_FILE;
      return true;
    } catch { return false; }
  }

  // ---- 拉取 ------------------------------------------------------------------------------------

  /** 现在该不该发请求？（interval 闸；`force` 仍受 `minRetryMs` 约束） */
  function dueIn(force) {
    const base = store.checked || 0;
    const gap = force ? minRetryMs : intervalMs;
    const left = base ? (base + gap) - now() : 0;
    return left > 0 ? left : 0;
  }

  async function doFetch(force) {
    if (!fetchImpl) { store.error = '本进程没有可用的 fetch'; return; }
    const headers = { accept: 'application/vnd.github+json', 'user-agent': UPSTREAM_UA };
    if (store.etag) headers['if-none-match'] = store.etag;
    // ★ 令牌（可选）只从环境变量来，加在这里；**绝不**进任何响应 / 日志。
    if (cfg.token) headers.authorization = 'Bearer ' + cfg.token;
    const signal = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function'
      ? AbortSignal.timeout(timeoutMs) : undefined;
    store.checked = now();
    let res;
    try {
      res = await fetchImpl(url, { method: 'GET', headers, signal, redirect: 'follow' });
    } catch (e) {
      store.failures++;
      store.error = '请求失败：' + ((e && e.message) ? e.message : String(e));
      log.warn?.('[admin] 官方 release 检查失败（沿用上次缓存）：' + store.error);
      return;
    }
    const etag = res.headers && typeof res.headers.get === 'function' ? res.headers.get('etag') : null;
    if (res.status === 304) {
      // ★ 304：内容没变 ⇒ **只更新 checkedAt / okAt**，保留旧 latest 与 etag（不重解析正文）。
      store.notModified++;
      store.okAt = store.checked;
      store.error = null;
      if (etag) store.etag = etag;
      return;
    }
    if (res.status === 403 || res.status === 429) {
      store.failures++;
      const left = res.headers && typeof res.headers.get === 'function' ? res.headers.get('x-ratelimit-reset') : null;
      store.error = 'GitHub 限流（HTTP ' + res.status + '）' + (left ? '，额度重置时刻 ' + new Date(Number(left) * 1000).toISOString() : '');
      log.warn?.('[admin] 官方 release 检查被限流：HTTP ' + res.status);
      return;
    }
    if (res.status !== 200) {
      store.failures++;
      store.error = 'HTTP ' + res.status;
      log.warn?.('[admin] 官方 release 检查失败：HTTP ' + res.status);
      return;
    }
    let json;
    try { json = await res.json(); } catch (e) {
      store.failures++;
      store.error = '响应不是合法 JSON：' + ((e && e.message) ? e.message : String(e));
      return;
    }
    store.latest = summarizeRelease(json);
    store.okAt = store.checked;
    store.etag = etag || null;
    store.error = null;
    store.fetched++;
    persist();
    log.info?.('[admin] 官方 release 已更新：' + (store.latest.tag || '(无 tag)')
      + ' · published ' + (store.latest.publishedAt || '(无)')
      + ' · 资产 ' + store.latest.assets.length + ' 个 · 每 ' + intervalMin + ' 分钟检查一次'
      + (dir ? '（落盘 ' + UPSTREAM_FILE + '）' : '（未落盘）'));
  }

  /** 拉一次（**并发合并**：同一时刻只有一个请求在飞；`force` 只用来放宽 interval 闸）。 */
  function check(force) {
    if (!cfg.enabled) return Promise.resolve(false);
    if (inflight) return inflight;
    if (dueIn(force) > 0) return Promise.resolve(false);
    inflight = doFetch(!!force).catch((e) => {
      store.failures++;
      store.error = '未预期错误：' + ((e && e.message) ? e.message : String(e));
    }).finally(() => { inflight = null; });
    return inflight;
  }

  function start() {
    if (running || !cfg.enabled) return false;
    const restored = restore();
    timer = setInterval(() => { void check(false); }, intervalMs);
    if (typeof timer.unref === 'function') timer.unref();
    running = true;
    // 启动 3 秒后先拉一次（不阻塞启动路径；失败也只是 error 字段）。
    const first = setTimeout(() => { void check(false); }, 3000);
    if (typeof first.unref === 'function') first.unref();
    log.info?.('[admin] 官方 release 追踪已启动：仓库 ' + cfg.repo + ' · 每 ' + intervalMin + ' 分钟检查一次'
      + '（第一次在 3 秒后）· 超时 ' + timeoutMs + ' ms · 落盘' + (dir ? '开（' + UPSTREAM_FILE + '）' : '关（未设 SP_ADMIN_UPSTREAM_DIR）')
      + (restored ? ' · 已从磁盘恢复上次结果：' + ((store.latest && store.latest.tag) || '(无 tag)') : ''));
    return true;
  }

  function dispose() {
    if (timer) { clearInterval(timer); timer = 0; }
    running = false;
  }

  /** 当前版本（部署版 `/healthz.app` 优先，回落树的 package.json version）。 */
  function currentInfo() {
    let deployed = null;
    try { const g = getCurrent(); deployed = g && g.app != null ? String(g.app) : null; } catch { deployed = null; }
    return { deployedApp: deployed, treeVersion: treeVersion == null ? null : String(treeVersion) };
  }

  /** 接口响应体（`GET /admin/api/upstream-release` 的 data 部分）。 */
  function status() {
    const cur = currentInfo();
    const cmp = compareVersionTags(cur.deployedApp || cur.treeVersion, store.latest ? store.latest.tag : null);
    const retryAfterSec = Math.ceil(dueIn(false) / 1000);
    return {
      enabled: cfg.enabled,
      repo: cfg.repo,
      url: cfg.url,
      source: 'github-api',
      checkedAt: store.checked,
      okAt: store.okAt,
      ok: !!store.latest && store.okAt !== null && !store.error,
      error: store.error,
      // ★ `cached` = 「现在展示的这份**不是本进程刚拉到的**」：要么是从磁盘恢复的（本进程还没成功出网），
      //   要么刚出的那次拉取失败了、展示的仍是上一次成功的结果。一次都没成功过 ⇒ latest 为 null、也无所谓缓存。
      cached: !!(store.latest && store.fetched === 0),
      etag: store.etag,
      intervalMin,
      timeoutMs,
      nextCheckAt: store.checked ? store.checked + intervalMs : null,
      retryAfterSec,
      current: cur,
      latest: store.latest,
      behind: cmp.behind,
      behindCount: cmp.behindCount ?? null,
      versionCheck: cmp,
      stats: { fetched: store.fetched, notModified: store.notModified, failures: store.failures },
      persist: { dir: !!dir, file: dir ? UPSTREAM_FILE : null, restoredAt: store.restoredAt },
    };
  }

  return {
    start, dispose, check, status,
    get running() { return running; },
    get enabled() { return cfg.enabled; },
    get state() { return store; },
    /** 只给测试看：当前是否有一个请求在飞。 */
    get busy() { return !!inflight; },
  };
}

/** 常量时间比较（长度不同也先做一次定长比较，避免长度侧信道）。 */
function tokenOk(given, want) {
  if (typeof given !== 'string' || !given) return false;
  const a = Buffer.from(given, 'utf8');
  const b = Buffer.from(want, 'utf8');
  if (a.length !== b.length) {
    timingSafeEqual(b, b);
    return false;
  }
  return timingSafeEqual(a, b);
}

function mimeJson() { return 'application/json; charset=utf-8'; }

/**
 * 建一个 Mod 管理处理器。
 *
 * @param {{
 *   root: string,                       // 仓库根（cli 与 ui 文件都相对它解析）
 *   modsDir: string|null,               // Mod 仓库；null ⇒ 不启用
 *   token: string|null,                 // 管理口令；null ⇒ 不启用
 *   log?: object,
 *   label?: string,                     // 展示给管理页的实例名（不回显真实路径）
 *   allowRestart?: boolean,             // 是否允许「退出进程让 systemd 重拉」
 *   uiFile?: string|null,               // 单文件管理页（GET /admin 时下发）
 *   getGameInfo?: () => object,         // index.js 提供的运行态快照（已脱敏）
 *   getRooms?: () => object,            // index.js 提供的**房间明细**快照（每房间 + 汇总；已脱敏，见 §4.17）
 *   reload?: () => Promise<object>,     // 热重载（重置数据单例 + 重装 L3 内容）
 *   exitFn?: (code:number) => void,     // 便于测试注入
 *   upstreamFetch?: Function,           // ★ 官方 release 追踪的 fetch（**只给测试 / 排障注入**；不给就用全局 fetch）
 *   upstreamEnv?: object,               // ★ 官方 release 追踪的环境变量（只给测试注入；不给就读 process.env）
 * }} opts
 * @returns {{ enabled:boolean, handle:(req:any,res:any,rawPath:string,query:string)=>Promise<boolean>,
 *             info:()=>object } | null}
 */
export function createModAdmin(opts = {}) {
  const {
    root, modsDir = null, token = null, log = console, label = '本机实例',
    allowRestart = false, uiFile = null, getGameInfo = () => ({}), getRooms = null,
    reload = null, exitFn = (c) => process.exit(c),
    upstreamFetch = null, upstreamEnv = null,
  } = opts;

  if (!modsDir || !token) return null;

  // ★ CORS 白名单的**附加**项（工序 73）：基线永远是「同源 + 字面量 null」，这里只把 SP_ADMIN_ORIGIN
  //   读进来。构造时读一次（进程生命周期里环境变量不变）⇒ 每个请求不用重解析。
  const extraOrigins = resolveAdminOrigins(process.env);

  // ★★ 指标采样器（工序 114）：**只有走到这一行**（= 有 modsDir 且有令牌）才会有它 ——
  //   `if (!modsDir || !token) return null;` 在它上面 ⇒ 没设 SP_ADMIN_TOKEN 时这个对象**根本不存在**，
  //   更不会有任何定时器 / 任何磁盘写入（这就是「默认严格等于上游」的机制，不是靠分支判断）。
  const metrics = createMetricsSampler({
    log,
    getCounts: () => { try { return getGameInfo() || {}; } catch { return {}; } },
  });
  metrics.start();

  // ★★ 官方 release 追踪器（工序 host-024）：同样在这一行**之后** ⇒ 没设 SP_ADMIN_TOKEN 时
  //   `createModAdmin` 已经 return null，这个对象**根本不会存在**（没有定时器、没有出网、没有落盘）。
  //   ★ 只读出网：GET api.github.com 的 releases/latest（可选择带 ETag 的 304 快路径）。
  const upstream = createUpstreamPoller({
    log,
    env: upstreamEnv || process.env,
    ...(upstreamFetch ? { fetchImpl: upstreamFetch } : {}),
    treeVersion: TREE_VERSION,
    getCurrent: () => { try { return getGameInfo() || {}; } catch { return {}; } },
  });
  upstream.start();

  const modCli = path.join(root, 'tools', 'mod.mjs');
  const exportDir = path.join(modsDir, EXPORT_SUBDIR);
  const uploadDir = path.join(modsDir, UPLOAD_SUBDIR);
  let restartAt = 0;

  // ---------------------------------------------------------------------------------------------
  // 小工具
  // ---------------------------------------------------------------------------------------------

  function cors(res, req) {
    // ★★ 白名单（工序 73），**不是**反射。Vary 恒发：同一个 URL 的响应依赖 Origin（命中发头、不命中不发头），
    //   缓存必须按 Origin 分开；它本身不是 Access-Control-* 头。
    res.setHeader('Vary', 'Origin');
    const allow = allowedOrigin(req);
    if (!allow) return false;              // 不命中 ⇒ 一个 CORS 头都不发（401 / 错误响应走同一条路）
    res.setHeader('Access-Control-Allow-Origin', allow);
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'authorization, content-type, x-sp-admin-token');
    res.setHeader('Access-Control-Max-Age', '600');
    res.setHeader('Access-Control-Expose-Headers', 'content-disposition');
    return true;
  }

  /**
   * 这个请求的 Origin 命中白名单吗？命中 ⇒ 回**它自己**（逐字节），否则 null。
   *
   * 三条判据（顺序即优先级）：
   *   1. `Origin: null`（`file://` / 沙箱）：基线放行，回 `Access-Control-Allow-Origin: null`；
   *   2. **同源**：Origin 的 host 与本请求的 `Host` **逐字相同**（scheme 不参与 —— 反代做 TLS 终止时
   *      `req.socket.encrypted` 与 `x-forwarded-proto` 都可能与浏览器的 Origin 对不上，拿 scheme 判会**假阴性**
   *      把正经的同源管理页关掉；host 相同已经足够说明"就是本站自己的页面"）；
   *   3. `SP_ADMIN_ORIGIN` 里列出的源（逐字比较）。
   * ★ 没有任何 Origin 头（curl / Node 验收脚本 / 浏览器同源 GET）⇒ 不发 CORS 头，请求照常处理：
   *   CORS 只约束**浏览器**的跨源读取，不是鉴权（鉴权永远是 SP_ADMIN_TOKEN）。
   */
  function allowedOrigin(req) {
    const origin = req.headers.origin;
    if (typeof origin !== 'string' || !origin) return null;
    if (origin === 'null') return 'null';
    const host = String(req.headers.host || '').trim().toLowerCase();
    let originHost = null;
    try {
      const u = new URL(origin);
      if (u.protocol === 'http:' || u.protocol === 'https:') originHost = u.host.toLowerCase();
    } catch { originHost = null; }
    if (originHost && host && originHost === host) return origin;
    if (extraOrigins.has(origin)) return origin;
    return null;
  }

  function send(req, res, status, body, ctype = mimeJson(), extra = null) {
    cors(res, req);
    const buf = Buffer.isBuffer(body) ? body : Buffer.from(typeof body === 'string' ? body : JSON.stringify(body));
    res.writeHead(status, {
      'Content-Type': ctype,
      'Content-Length': buf.length,
      'Cache-Control': 'no-store',
      'X-Content-Type-Options': 'nosniff',
      ...(extra || {}),
    });
    res.end(req.method === 'HEAD' ? undefined : buf);
  }

  const ok = (req, res, obj) => send(req, res, 200, { ok: true, admin: ADMIN_API_VERSION, ...obj });
  const fail = (req, res, status, error, extra = null) => send(req, res, status, { ok: false, error, ...(extra || {}) });

  function parseQuery(q) {
    const out = {};
    for (const part of String(q || '').replace(/^\?/, '').split('&')) {
      if (!part) continue;
      const i = part.indexOf('=');
      const k = i < 0 ? part : part.slice(0, i);
      const v = i < 0 ? '' : part.slice(i + 1);
      try { out[decodeURIComponent(k)] = decodeURIComponent(v.replace(/\+/g, ' ')); } catch { /* skip */ }
    }
    return out;
  }

  function tokenFrom(req) {
    const h = req.headers.authorization || '';
    const m = /^Bearer\s+(.+)$/i.exec(h.trim());
    if (m) return m[1].trim();
    const x = req.headers['x-sp-admin-token'];
    return typeof x === 'string' ? x.trim() : '';
  }

  /** 跑 CLI。@returns {Promise<{rc:number,out:string}>} */
  function runCli(args, { timeoutMs = 90000 } = {}) {
    return new Promise((resolve) => {
      let child;
      try {
        child = spawn(process.execPath, [modCli, ...args, '--mods', modsDir], {
          cwd: root, stdio: ['ignore', 'pipe', 'pipe'],
        });
      } catch (e) {
        resolve({ rc: 127, out: `无法启动 CLI: ${e.message}` });
        return;
      }
      let buf = '';
      let done = false;
      const t = setTimeout(() => {
        if (done) return;
        done = true;
        try { child.kill('SIGKILL'); } catch { /* ignore */ }
        resolve({ rc: 124, out: `${buf}\n(CLI 超时 ${timeoutMs}ms)` });
      }, timeoutMs);
      child.stdout.on('data', (d) => { buf += d.toString('utf8'); });
      child.stderr.on('data', (d) => { buf += d.toString('utf8'); });
      child.on('error', (e) => { if (done) return; done = true; clearTimeout(t); resolve({ rc: 127, out: `CLI 执行失败: ${e.message}` }); });
      child.on('close', (code) => { if (done) return; done = true; clearTimeout(t); resolve({ rc: code == null ? 1 : code, out: buf.trim() }); });
    });
  }

  function readState() {
    try {
      const j = JSON.parse(fs.readFileSync(path.join(modsDir, STATE_FILE), 'utf8'));
      return {
        disabled: (j.disabled || []).filter((x) => typeof x === 'string'),
        order: (j.order || []).filter((x) => typeof x === 'string'),
      };
    } catch { return { disabled: [], order: [] }; }
  }

  function opCount(file) {
    try {
      const j = JSON.parse(fs.readFileSync(file, 'utf8'));
      if (!j || typeof j !== 'object' || !Array.isArray(j.ops)) return { n: null, err: '顶层必须是 { "ops": [ … ] }' };
      return { n: j.ops.length, err: null };
    } catch (e) { return { n: null, err: `JSON 解析失败: ${e.message}` }; }
  }

  function dirSize(dir, cap = 64 * 1024 * 1024) {
    let total = 0;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let ents;
      try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) {
        const p = path.join(cur, e.name);
        if (e.isDirectory()) stack.push(p);
        else if (e.isFile()) { try { total += fs.statSync(p).size; } catch { /* ignore */ } }
        if (total > cap) return total;
      }
    }
    return total;
  }

  /** 唯一键过滤：只接受 pattern 内的合法 id，杜绝路径穿越。 */
  function safeId(id) { return typeof id === 'string' && MOD_ID_RE.test(id) ? id : null; }

  // ---------------------------------------------------------------------------------------------
  // 磁盘侧 Mod 清单（不启 node，秒回）
  // ---------------------------------------------------------------------------------------------

  /**
   * 读并解析一个 Mod 的 `CHANGELOG.md`（没有这个文件 ⇒ null；解析不出任何版本 ⇒ null）。
   * ★ 真值来源**只有这一份文件**：管理页的「版本更新日志」入口直接读它，
   *   `mod.json` 里**不写**日志（docs/MODS.md §4.12.5 的最后一行）。
   * @param {string} dir Mod 目录
   * @returns {{file:string, versions:Array<any>}|null}
   */
  function readChangelog(dir) {
    const file = path.join(dir, CHANGELOG);
    let text;
    try { text = fs.readFileSync(file, 'utf8'); } catch { return null; }
    const parsed = parseChangelog(text);
    if (!parsed) return { file: CHANGELOG, versions: [] };
    return { file: CHANGELOG, versions: parsed.versions };
  }

  function listMods() {
    const state = readState();
    const disabled = new Set(state.disabled);
    const rows = [];
    let names = [];
    try {
      names = fs.readdirSync(modsDir, { withFileTypes: true })
        // `.` = 本机状态/导出/上传缓存；`_` = 回收站（_removed/）。两者都不是 Mod，不列出来。
        .filter((d) => d.isDirectory() && !d.name.startsWith('.') && !d.name.startsWith('_'))
        .map((d) => d.name).sort();
    } catch { return rows; }

    for (const mid of names) {
      const dir = path.join(modsDir, mid);
      const row = {
        id: mid, name: null, version: null, author: null, description: null, summary: null,
        apiVersion: null, gameVersion: null, loadAfter: [],
        enabled: !disabled.has(mid), errors: [], warnings: [],
        files: [], ops: 0, hasContent: false, hasClient: false, hasAssets: false,
        // ★ 版本更新日志入口（「待更新③」）：`changelog` 只给**最近几版**（新的在前，列表够用就行），
        //   完整日志走 `GET /admin/api/changelog?id=<mod>`。没有日志文件 ⇒ null。
        changelog: null,
        mtime: 0, sizeBytes: 0,
      };
      try { row.mtime = Math.round(fs.statSync(dir).mtimeMs); } catch { /* ignore */ }

      const mp = path.join(dir, MANIFEST);
      if (!fs.existsSync(mp)) {
        row.errors.push(`缺少 ${MANIFEST}`);
        rows.push(row);
        continue;
      }
      let man;
      try { man = JSON.parse(fs.readFileSync(mp, 'utf8')); } catch (e) {
        row.errors.push(`${MANIFEST} 解析失败: ${e.message}`);
        rows.push(row);
        continue;
      }
      for (const k of ['name', 'version', 'author', 'summary', 'description', 'apiVersion', 'gameVersion']) row[k] = man[k] ?? null;
      if (Array.isArray(man.loadAfter)) row.loadAfter = man.loadAfter.filter((x) => typeof x === 'string');
      // ★ 清单校验**复用 CLI 那一份**（tools/mod.mjs validate 走的 server/mods/loader.js: validateManifest），
      //   避免「网页说没问题、命令行说有错」这种两套口径。原来这里是另一份手写的必填字段检查，
      //   它漏了 id 命名规则 / version 语义化版本 / loadAfter 类型 / author·description 建议项。
      const v = validateManifest(man, mid);
      row.errors.push(...v.errors);
      row.warnings.push(...v.warnings);

      const dataDir = path.join(dir, 'data');
      if (fs.existsSync(dataDir)) {
        for (const f of fs.readdirSync(dataDir).sort()) {
          if (!f.toLowerCase().endsWith('.json')) continue;
          const { n, err } = opCount(path.join(dataDir, f));
          if (err) { row.errors.push(`data/${f}: ${err}`); row.files.push({ name: f, ops: 0 }); }
          else { row.ops += n; row.files.push({ name: f, ops: n }); }
        }
      }
      // 注意：「没有 data/」本身不是问题（纯界面/美术 Mod 就没有 data/）——真正的「空 Mod」在下面统一判定。
      row.hasContent = fs.existsSync(path.join(dir, CONTENT_SUBDIR));
      row.hasClient = fs.existsSync(path.join(dir, CLIENT_SUBDIR));
      row.hasAssets = fs.existsSync(path.join(dir, ASSETS_SUBDIR));
      if (row.hasAssets) {
        const n = countFiles(path.join(dir, ASSETS_SUBDIR));
        row.warnings.push(`自带美术 ${n} 个文件（/assets/ 未命中时按 Mod 顺序兜底）`);
      }
      // 与 server/mods/loader.js 同口径：三条通道都没有才算空 Mod
      if (!row.files.length && !row.hasContent && !row.hasClient) {
        row.warnings.push('既没有 data/ 补丁、content/ 行为模块，也没有 client/ 界面扩展（空 Mod？）');
      }
      // ★ 版本更新日志（docs/MODS.md §4.12.5）：快照里只回**最近几版**，完整日志走 /admin/api/changelog。
      //   缺文件不是错误（存量 Mod 可能还没补），所以不进 errors / warnings —— 前端据此不显示入口。
      const log = readChangelog(dir);
      if (log && log.versions.length) {
        row.changelog = {
          file: log.file,
          total: log.versions.length,
          versions: log.versions.slice(0, CHANGELOG_VERSIONS_IN_SNAPSHOT),
        };
      }
      row.sizeBytes = dirSize(dir);
      rows.push(row);
    }
    return rows;
  }

  function countFiles(dir) {
    let n = 0;
    const stack = [dir];
    while (stack.length) {
      const cur = stack.pop();
      let ents;
      try { ents = fs.readdirSync(cur, { withFileTypes: true }); } catch { continue; }
      for (const e of ents) { if (e.isDirectory()) stack.push(path.join(cur, e.name)); else if (e.isFile()) n++; }
    }
    return n;
  }

  function listExports() {
    const out = [];
    let names = [];
    try { names = fs.readdirSync(exportDir); } catch { return out; }
    for (const f of names.sort().reverse().slice(0, 20)) {
      const p = path.join(exportDir, f);
      try { if (fs.statSync(p).isFile()) out.push({ file: f, bytes: fs.statSync(p).size }); } catch { /* ignore */ }
    }
    return out;
  }

  // ---------------------------------------------------------------------------------------------
  // 路由
  // ---------------------------------------------------------------------------------------------

  /** 本实例开放了哪些能力（前端据此灰掉按钮）。`download` 恒为真：有导出包就有下载端点。 */
  const caps = () => ({
    reload: !!reload, restart: !!allowRestart, ui: !!uiFile,
    verify: true, install: true, download: true,
    // ★ 实时文档通道（工序 61）：恒为真（本端点不需要任何额外能力，只要有 modsDir 就有它）。
    live: true,
    // ★ 房间明细（工序 69）：只有嵌入口把 `getRooms` 接进来时才有（本进程走 server/index.js ⇒ 恒为真）。
    rooms: !!getRooms,
    // ★ 趋势指标（工序 114）：采样器跟着本模块一起存在 ⇒ 恒为真（老前端据此不显示「趋势」栏）。
    metrics: true,
    // ★ 官方 release 追踪（工序 host-024）：追踪器跟着本模块一起存在；
    //   `SP_ADMIN_UPSTREAM=0` 时整块关掉 ⇒ 这里回 false（老前端据此不显示这一栏）。
    upstream: upstream.enabled,
  });

  /** @returns {Promise<boolean>} true = 已处理（无论成败） */
  async function handle(req, res, rawPath, query) {
    if (!rawPath.startsWith(ADMIN_PREFIX)) return false;

    // 预检不需要口令（浏览器不会在预检里带自定义头）。
    // ★ 工序 73：`cors()` 现在只对白名单里的 Origin 发头 ⇒ 不在名单里的源，预检拿到的是
    //   「204 + 一个 CORS 头都没有」= 浏览器直接判 CORS 失败（这就是"拒"）。
    if (req.method === 'OPTIONS') { cors(res, req); res.writeHead(204, { 'Content-Length': '0' }); res.end(); return true; }

    if (!tokenOk(tokenFrom(req), token)) {
      // 401 不带任何提示，避免泄露「这里确实有个管理接口」之外的任何信息
      send(req, res, 401, { ok: false, error: 'unauthorized' });
      return true;
    }

    const sub = rawPath.slice(ADMIN_PREFIX.length) || '/';
    const q = parseQuery(query);

    try {
      if (sub === '/ping' && (req.method === 'GET' || req.method === 'HEAD')) {
        return ok(req, res, { apiVersion: ADMIN_API_VERSION, label, capabilities: caps() }), true;
      }

      if (sub === '/snapshot' && (req.method === 'GET' || req.method === 'HEAD')) {
        return ok(req, res, {
          label, revision: (getGameInfo() || {}).revision ?? 0,
          game: getGameInfo(),
          mods: listMods(),
          exports: listExports(),
          modsDirLabel: path.basename(modsDir),
          caps: caps(),
        }), true;
      }

      if (sub === '/download' && req.method === 'GET') {
        const name = path.basename(String(q.f || ''));
        const p = path.join(exportDir, name);
        if (!name || !name.endsWith('.spmod') || !fs.existsSync(p)) return fail(req, res, 404, 'not found'), true;
        return send(req, res, 200, fs.readFileSync(p), 'application/octet-stream', {
          'Content-Disposition': `attachment; filename="${name}"`,
        }), true;
      }

      // ★ 实时文档的**读**端点（写端点在下面 POST 段里）：管理页靠它把「现在发布的是什么」画出来。
      //   文件不存在不是错误 —— 回 `present: false, doc: null`（消费者据此回落到自己的数据补丁默认值）。
      if (sub === '/live' && (req.method === 'GET' || req.method === 'HEAD')) {
        const id = safeId(String(q.id || ''));
        if (!id) return fail(req, res, 400, `非法的 Mod id: ${q.id || ''}`), true;
        const dir = path.join(modsDir, id);
        if (!fs.existsSync(path.join(dir, MANIFEST))) return fail(req, res, 404, `没有这个 Mod: ${id}`), true;
        const file = path.join(dir, LIVE_FILE);
        let doc = null;
        let savedAt = null;
        let bytes = 0;
        try {
          const buf = fs.readFileSync(file);
          bytes = buf.length;
          savedAt = fs.statSync(file).mtimeMs;
          doc = JSON.parse(buf.toString('utf8'));
        } catch { doc = null; }
        return ok(req, res, { id, file: LIVE_FILE, present: doc !== null, bytes, savedAt, doc, url: `/mods/${id}/${LIVE_FILE}` }), true;
      }

      // ★★ 「待更新③」的版本更新日志入口：**完整**日志（快照里只回最近 3 版）。
      //   真值来源仍然只有 `mods/<id>/CHANGELOG.md` 一份（docs/MODS.md §4.12.5），这里只是把它结构化下发。
      //   id 走 safeId（唯一键过滤 ⇒ 杜绝路径穿越）；日志不存在时回一个空的 versions（不是 404，
      //   免得前端要区分"没有这个 Mod"与"这个 Mod 没写日志"两种 404）。
      if (sub === '/changelog' && (req.method === 'GET' || req.method === 'HEAD')) {
        const id = safeId(String(q.id || ''));
        if (!id) return fail(req, res, 400, `非法的 Mod id: ${q.id || ''}`), true;
        const dir = path.join(modsDir, id);
        if (!fs.existsSync(path.join(dir, MANIFEST))) return fail(req, res, 404, `没有这个 Mod: ${id}`), true;
        const log = readChangelog(dir);
        return ok(req, res, {
          id, file: log ? log.file : null, versions: log ? log.versions : [],
          version: (() => { try { return JSON.parse(fs.readFileSync(path.join(dir, MANIFEST), 'utf8')).version ?? null; } catch { return null; } })(),
        }), true;
      }

      // ★★ 「房间 / 在线人数」明细（工序 69，服主口径）：**管理员专用**的只读快照 ——
      //   每个房间的房号 / 创建时间 / 是否开局 / 对局开始时间 / 回合 / 阶段 / 座位 / 真人 / AI / 观战 /
      //   每人的在座状态，外加顶层汇总与 `safeToRestart`（**0 真人 · 0 对局 · 0 观战** ⇒ 现在推公告 /
      //   推更新最安全；口径见 `server/match/roomDetail.js`，工序 73 起把观战也算进来）。
      //   ★ 它排在**口令检查之后**（上面那一段 `tokenOk`）：没令牌 / 错令牌一律 401 且**响应体里没有任何
      //     房间或玩家信息** —— 这正是这一页与 `/healthz` 的区别（后者是玩家可见的公开计数）。
      //   ★ 真值来源是 `getRooms()` → `server/match/roomDetail.js`，本文件一个字段都不自己算。
      if (sub === '/rooms' && (req.method === 'GET' || req.method === 'HEAD')) {
        if (!getRooms) return fail(req, res, 503, '本实例未提供房间明细能力'), true;
        const snap = getRooms() || {};
        return ok(req, res, { ts: snap.ts ?? Date.now(), summary: snap.summary ?? null, rooms: snap.rooms ?? [] }), true;
      }

      // ★★ 趋势指标（工序 114；docs/MODS.md §4.21）：**管理员只读**的采样序列。
      //   `?since=&until=` 是 ms epoch；`?step=` 是降采样步长（秒，缺省按窗口自动选，桶数 ≤720）；
      //   `?raw=1` = 不降采样（导出 CSV/JSON 用）。★ 本端点**不做任何写操作**。
      if (sub === '/metrics' && (req.method === 'GET' || req.method === 'HEAD')) {
        const nOrNull = (v) => { const n = Number(v); return Number.isFinite(n) ? n : null; };
        const raw = q.raw === '1' || q.raw === 'true';
        return ok(req, res, metrics.snapshot({
          since: nOrNull(q.since), until: nOrNull(q.until), stepSec: nOrNull(q.step), raw,
        })), true;
      }

      // ★★ 官方 release 追踪 + 更新提示（工序 host-024；docs/MODS.md §4.22）：**管理员只读**的
      //   「官方最新版 vs 我们这一版」快照。服务端每 60 分钟带 ETag 拉一次 api.github.com 的
      //   releases/latest（304 时只更新 checkedAt）；失败**不影响任何现有功能**，只填 `error`
      //   并继续展示上一次成功的缓存（`latest` 保留 + `cached:true`）。
      //   `?refresh=1` = 管理页「立即检查」按钮：触发一次检查（**不阻塞本响应**），
      //   ★ 但仍受最小重试间隔 1 分钟约束（未认证 API 限额 60 次/小时，`retryAfterSec` 会告诉前端还要等多久）。
      //   ★ 两段式判定（路径 / 方法分开走）：这样 `POST /upstream-release` 回的是**方法不允许 405**
      //     而不是「未知的管理接口 404」—— 与整页 §管理面「鉴权 / 401 / 405 / 404 口径一致」对齐。
      if (sub === '/upstream-release' || sub.startsWith('/upstream-release/')) {
        if (req.method !== 'GET' && req.method !== 'HEAD') {
          return fail(req, res, 405, `method not allowed: ${req.method}`), true;
        }
        if (q.refresh === '1' || q.refresh === 'true') void upstream.check(true);
        const st = upstream.status();
        // ★ 顺序要紧：`ok: true` 显式写在最后 —— `st.ok` 是「这次上游检查成功了吗」，
        //   与信封的 `ok`（这个响应成功了吗）是两个东西，绝不能被它盖掉。
        //   ★ 端点就是 `url`（同一个值，不再另发一份 `target` 字段）。
        return ok(req, res, { ...st, checking: upstream.busy, ok: true }), true;
      }

      if (req.method !== 'POST') return fail(req, res, 405, `method not allowed: ${req.method}`), true;

      if (sub === '/live') {
        // ★ 「实时文档」（见 LIVE_FILE 的说明）：`id` 必须是一个**当前安装着**的 Mod 目录
        //   （有 mod.json），写入固定文件名 live.json。id 走 safeId ⇒ 结构上不可能穿出 modsDir。
        const id = safeId(String(q.id || ''));
        if (!id) return fail(req, res, 400, `非法的 Mod id: ${q.id || ''}`), true;
        const dir = path.join(modsDir, id);
        if (!fs.existsSync(path.join(dir, MANIFEST))) return fail(req, res, 404, `没有这个 Mod: ${id}`), true;
        const file = path.join(dir, LIVE_FILE);
        const len = Number(req.headers['content-length'] || 0);
        if (!len) return fail(req, res, 400, '空请求体'), true;
        if (len > MAX_LIVE) return fail(req, res, 413, `实时文档过大（${len} 字节 > ${MAX_LIVE}）`), true;
        const raw = await readBody(req, len, MAX_LIVE);
        let doc;
        try { doc = JSON.parse(raw.toString('utf8')); } catch (e) { return fail(req, res, 400, `不是合法 JSON: ${e.message}`), true; }
        if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return fail(req, res, 400, '实时文档必须是一个 JSON 对象'), true;
        // 原子落盘：先写同目录临时文件再 rename（读取方永远看到完整的一份，不会读到半个文件）。
        const body = Buffer.from(`${JSON.stringify(doc, null, 2)}\n`, 'utf8');
        const tmp = `${file}.tmp-${process.pid}`;
        try {
          fs.writeFileSync(tmp, body);
          fs.renameSync(tmp, file);
        } catch (e) {
          try { fs.unlinkSync(tmp); } catch { /* ignore */ }
          return fail(req, res, 500, `写入失败: ${e && e.message ? e.message : e}`), true;
        }
        return ok(req, res, { id, file: LIVE_FILE, bytes: body.length, savedAt: Date.now(), url: `/mods/${id}/${LIVE_FILE}` }), true;
      }

      if (sub === '/verify') {
        const { rc, out } = await runCli(['validate', '--json'], { timeoutMs: 180000 });
        let rows = null;
        try { rows = JSON.parse(out); } catch {
          const i = out.indexOf('['), j = out.lastIndexOf(']');
          if (0 <= i && i < j) { try { rows = JSON.parse(out.slice(i, j + 1)); } catch { rows = null; } }
        }
        if (!Array.isArray(rows)) return fail(req, res, 200, `CLI 输出无法解析（rc=${rc}）`, { raw: out.slice(0, 2000) }), true;
        return ok(req, res, { rows, ts: Date.now() }), true;
      }

      if (sub === '/reload') {
        if (!reload) return fail(req, res, 503, '本实例未提供热重载能力'), true;
        const r = await reload();
        return ok(req, res, { ...r, note: '服务端已重载；客户端本地跑战斗，玩家需刷新页面才能拿到同一份数据' }), true;
      }

      if (sub === '/restart') {
        if (!allowRestart) {
          return fail(req, res, 403, '本实例未开启「重启进程」（需要 SP_ADMIN_ALLOW_RESTART=1，且服务由 systemd Restart=always 托管）'), true;
        }
        if (restartAt && Date.now() - restartAt < 10000) return fail(req, res, 429, '刚重启过，请稍候'), true;
        restartAt = Date.now();
        ok(req, res, { restarting: true, note: '进程即将退出；systemd 会在 1~2 秒内重拉' });
        // 先把响应刷出去，再自杀 → 交给 systemd Restart=always 重拉。
        // 这条路不需要任何 privileges（单元是 User=stronghold + NoNewPrivileges=true，跑不了 systemctl）。
        setTimeout(() => { log.info?.('[admin] 按管理页请求退出进程，等待 systemd 重拉'); exitFn(0); }, 400);
        return true;
      }

      if (sub === '/install') {
        const name = path.basename(String(q.name || 'pkg.spmod'));
        if (!/\.(spmod|zip)$/i.test(name)) return fail(req, res, 400, `只接受 .spmod / .zip（收到 ${name}）`), true;
        const len = Number(req.headers['content-length'] || 0);
        if (!len) return fail(req, res, 400, '空请求体'), true;
        if (len > MAX_UPLOAD) return fail(req, res, 413, `包过大（${len} 字节 > ${MAX_UPLOAD}）`), true;
        const buf = await readBody(req, len);
        fs.mkdirSync(uploadDir, { recursive: true });
        const tmp = path.join(uploadDir, `${Date.now()}-${name}`);
        fs.writeFileSync(tmp, buf);
        const { rc, out } = await runCli(['install', tmp], { timeoutMs: 180000 });
        if (rc !== 0) return fail(req, res, 200, `安装失败（包留在服务器 ${path.basename(tmp)} 供排查）：${out.slice(-700) || `rc=${rc}`}`), true;
        try { fs.unlinkSync(tmp); } catch { /* ignore */ }
        return ok(req, res, { installed: true, detail: out.split('\n')[0] || 'ok' }), true;
      }

      const m = /^\/mods\/([^/]+)\/(enable|disable|remove|pack)$/.exec(sub);
      if (m) {
        const id = safeId(decodeURIComponent(m[1]));
        if (!id) return fail(req, res, 400, `非法的 Mod id: ${m[1]}`), true;
        const action = m[2];
        if (action === 'pack') {
          fs.mkdirSync(exportDir, { recursive: true });
          const outFile = path.join(exportDir, `${id}.spmod`);
          const { rc, out } = await runCli(['pack', id, '-o', outFile], { timeoutMs: 180000 });
          if (rc !== 0 || !fs.existsSync(outFile)) return fail(req, res, 200, `打包失败：${out.slice(-600) || `rc=${rc}`}`), true;
          return ok(req, res, { file: path.basename(outFile), bytes: fs.statSync(outFile).size }), true;
        }
        const args = action === 'remove' ? ['uninstall', id] : [action, id];
        const { rc, out } = await runCli(args);
        const last = out.split('\n').filter(Boolean).pop() || `rc=${rc}`;
        if (rc !== 0) return fail(req, res, 200, last), true;
        return ok(req, res, { detail: last }), true;
      }

      return fail(req, res, 404, `未知的管理接口: ${sub}`), true;
    } catch (e) {
      log.error?.('[admin] 处理失败', e);
      return fail(req, res, 500, `服务器内部错误: ${e && e.message ? e.message : e}`), true;
    }
  }

  /**
   * 读请求体。`cap` 是本端点能接受的上限（默认上传包上限）：`Content-Length` 是客户端自己报的，
   * 不能只信它 —— 超限就地 destroy（不把超长 body 读进内存）。
   */
  function readBody(req, len, cap = MAX_UPLOAD) {
    return new Promise((resolve, reject) => {
      const chunks = [];
      let got = 0;
      req.on('data', (c) => {
        got += c.length;
        if (got > cap) { reject(new Error('请求体过大')); req.destroy(); return; }
        chunks.push(c);
      });
      req.on('end', () => resolve(Buffer.concat(chunks)));
      req.on('error', reject);
    });
  }

  function info() {
    return { apiVersion: ADMIN_API_VERSION, label, allowRestart: !!allowRestart, ui: !!uiFile, modsDirLabel: path.basename(modsDir) };
  }

  return { enabled: true, handle, info, metrics, dispose: () => metrics.dispose() };
}
