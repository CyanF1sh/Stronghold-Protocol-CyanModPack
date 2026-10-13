// server/sim/mechanics.js — 规则接缝（rule seams）：Mod **只提供数据**，基座在这里读它。
//
// 为什么需要这个文件（而不是让 Mod 改代码）：Mod 拿到的引擎句柄是 **ESM 命名空间**
// （server/sim/content/index.js 的 modHostApi 暴露 support/targeting/dir/body/damage/constants），
// 而命名空间对象的绑定是**只读**的 —— Mod 包不了、也换不掉 `support.unitBonds` / `support.gainLayers`
// 或 不屈 的触发点。所以「改机制」的唯一可行姿势是：**基座留一条中性的数据缝（默认 = 上游行为），
// Mod 用 L2 数据补丁把开关打开**。docs/MODS.md §4.4 的施工清单与 `config.coop`（cyanfish.max-seats）
// 是这条路的先例。
//
// ---------------------------------------------------------------------------------------------------------------------
// ★ 为什么接缝挂在 `data/backups.json` 的 `mechanics` 上，而**不是** `data/config.json`（施工任务原建议）
//
// 两条以**实际代码**为准的理由（不是风格偏好）：
//
//   1. **浏览器读不到 config.json。** 客户端本地跑战斗（DESIGN §14；public/js/battle/runner.js 的
//      `loadBrowserSim`），它只取 `SIM_DATA_FILES` 那 11 个数据文件：
//        chess, enemies, tokens, stages, waves, bonds, items, garrisons, bands, effects, **backups**
//      —— **不含 config**；而 `/data.js` 的浏览器替身（server/http/static.js 的 `DATA_SHIM_JS`）把基座 sim 的
//      `getData()` 接到 `/sim/simdata.js` 的 `getSimData()`（= 那份被注入的 11 个文件）上。
//      ⇒ 挂在 config.json 的开关在**浏览器 sim 里永远是「缺省」**，同一场战斗会算成两个结果
//      （服务端验算拒收战报）。sim 侧（server/sim/**）是两端共享的代码，它的读法必须在两端都拿得到同一份值。
//
//   2. **部署层不部署 `data/`。** <开发期脚本>/deploy_base_021.py 的 `SKIP_PREFIXES` 含 `data/`：
//      线上 app 目录的 data/*.json 是**官方整合包**（`本地部署目录/_release-v0.2.1/Stronghold-Protocol/data`）那份。
//      ⇒ 基座**不能**靠在仓库的 data/ 里写默认值来提供接缝（写了也上不了线，还会造成「本地有、线上没有」的分裂）。
//      接缝必须**缺省即上游**，由 Mod 自己用 `{"op":"add","path":"mechanics",…}` 加进去
//      （与 `cyanfish.max-seats` 往 config.json 里 `add coop` 完全同一个姿势）。
//
// `data/backups.json` 满足上面两条：它同时是 Node sim（server/data.js）、浏览器 sim（SIM_DATA_FILES）、
// server/match（GameData.raw）与客户端界面（public/js/data.js `data.get('backups')`）四者都读到的那一份
// —— 与 §4.9 的 `diy.slots` 接缝同一个落点。
//
// ---------------------------------------------------------------------------------------------------------------------
// 口径（三条铁律，照 §4.2 / §4.5）
//   · **默认 = 上游**：数据里没有这一节、字段缺失、类型不对 ⇒ 一律按「关」处理（`=== true` 才算开；
//     名单只认非空字符串项）。绝不抛错，绝不静默改名。
//   · **不做公式、不做默认档**：数据里只有布尔与名单，没有表达式。
//   · **两端各夹一次**：服务端用本文件；客户端在 public/js/ui/gameLogic/bonds.js 里有一份同义的
//     `bondCopyLayersSeam()`（两端口径由 test/content/morph-dual-bonds.test.js 的对读断言钉住）。
//
// 当前两个开关（详见 docs/MODS.md §4.10）：
//   bondCopyLayers  双转职（变形同构体授予一个干员他已经有的盟约）：所属盟约清单**保留重复条目**，
//                   `gainLayers` 的「每场作战至多N层」**每份各记一份**，展示层（详情卡 / 成员表）也显示两份。
//                   默认 false ⇒ 去重 + 旧上限键，逐值等于上游。
//   indomRaidSp     不屈 tier 2「地面干员被击倒时使场上所有干员技力+5」把**突袭飞走**（`death.reason='raid'`）
//                   也算作一次「被击倒」——**只补技力，不参与 tier 1 的「立刻重新部署」roll**。
//                   默认 false ⇒ `raid` 既不 roll 也不补技力，逐值等于上游。
//
// ★ 曾经还有第三个开关，**已在工序 54（2026-10-10）撤除**：它不在本文件里，而是**特质自己数据上的一枚旗标**
// `bb.doll_swap_deploy`（「换体时也算一次部署」），由 server/sim/content/garrisons/battle.js 的
// `act2autochess_gar_event_onstart` 安装器读。撤除原因：上游 **0.2.3** 自己在该安装器里内建了同一条
// （GitHub #415 / PR #429），两边并存会让傀儡师换体 `fireGain` 两次 ⇒ 该安装器已回到与
// `<官方源码参照>/v0.2.2` 逐字节相同，`mods/cyanfish.fix-operator/data/garrisons.json` 已删除。
// ⇒ 本文件（`mechanics` 这条接缝）**不受影响**，仍只有下面两个开关。

/** 接缝的缺省值 = 上游行为（冻结；任何「数据里没有」都返回它）。 */export const MECHANICS_DEFAULTS = Object.freeze({
  bondCopyLayers: false,
  indomRaidSp: false,
});

/** raw `mechanics` 对象 → 归一化结果（按对象身份缓存；数据是 deepFreeze 的，身份稳定）。 */
const NORMALIZED = new WeakMap();

/**
 * 归一化 `data/backups.json` 的 `mechanics` 一节。非法 / 缺省一律回 {@link MECHANICS_DEFAULTS}。
 * @param {Readonly<Record<string, any>>|null|undefined} data 合并后的游戏数据（`{ chess, bonds, …, backups }`）
 * @returns {{ bondCopyLayers: boolean, indomRaidSp: boolean }}
 */
export function readMechanics(data) {
  const backups = data && typeof data === 'object' ? data.backups : null;
  const raw = backups && typeof backups === 'object' ? backups.mechanics : null;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return MECHANICS_DEFAULTS;
  const hit = NORMALIZED.get(raw);
  if (hit) return hit;
  const out = Object.freeze({
    bondCopyLayers: raw.bondCopyLayers === true,
    indomRaidSp: raw.indomRaidSp === true,
  });
  NORMALIZED.set(raw, out);
  return out;
}

/** 双转职接缝（默认 false = 上游去重）。 */
export const bondCopyLayers = (data) => readMechanics(data).bondCopyLayers;
/** 不屈 raid 技力接缝（默认 false = 上游不认 raid）。 */
export const indomRaidSp = (data) => readMechanics(data).indomRaidSp;
