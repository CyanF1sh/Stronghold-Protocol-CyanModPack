// mods/cyanfish.skinvoice/client/index.js — 「皮肤与语音 · 全干员」（客户端界面扩展 Mod）。
//
// 装载路径：页面启动 → GET /mods → import('/mods/cyanfish.skinvoice/client/index.js') → setup(hostApi)
// （public/js/ui/extensions.js 的 loadClientMods）。
//
// 这个 Mod 做什么：
//   · ★★ 0.19.0（工序 72）皮肤控件固定在**两处**（都在宿主插槽里，都是"就地改"）：
//       ① **详情面板**（`loadout.detailVoice`）—— 官方「此干员语音」控件的**下一行**（★ 宽屏窄屏都在：
//          详情面板本来就开着；服主裁定「把干员时装放在干员独立语音配置下一行」）；
//       ② **名单行内**（`loadout.rowActions`）—— 「潜能 / 练度」右侧那一格（≥1600px，服主先前明确要的）。
//     ★ **顶栏不再有皮肤入口**（服主裁定「顶栏左侧的皮肤控件不用留，顶栏只保留一个和官方相同的设置入口」）
//       ⇒ 顶栏里我们最多只剩**一颗齿轮**（没装 `cyanfish.mod-settings` 时的兜底设置入口）。
//   · ★★ 第三页「自选编队」里四个槽位**各有一个皮肤控件**（插槽 `loadout.diySlotActions`，见下）。
//   · ★★ 0.15.0 起语音播放整体交回官方（`public/js/audio.js`），本 Mod 只保留"该用哪份语音资源"这一层；
//     0.17.0 起"单干员语种"那条轴也交回官方（上游 0.2.3 原生提供，见下面 20 轮那段）⇒ 本 Mod 没有语音控件。
//   · ★★ 0.10.0（服主口径「自选编队的皮肤选择需要在自选页面进行单独的皮肤选择 UI 适配」）：
//     干员调配的**第三页「自选编队」**里，四个槽位（5 阶 ×2 / 6 阶 ×2）**各有一个皮肤控件**，
//     放在宿主新开的插槽 `loadout.diySlotActions`（= 该槽位操作区 `.diy-slot__acts` 里、官方
//     「更换 / 清空」之后）。为什么不能复用顶栏那条：顶栏跟随的是「名单里选中的干员」，
//     而自选页**没有「名单选中」这个概念**，且自选池干员**按设计不在名单里** ⇒ 顶栏永远指不到他们。
//     两条控件**共用同一份配置**（cfg.skins）与同一个 applier（skins.choose）⇒ 天然同步。
//     没有可选时装的干员画**禁用态**（不写配置、不报错）；槽位为空时宿主压根不画操作区。见 client/diy.js。
//   · ★ 参数（随机皮肤 2 项 + 素材上游 / 配置备份）注册进「模组设置」的一栏；
//     ★★ 语音那 6 项（语种 / 总开关 / 播放间隔 / 声道模式 / 同时播放上限 / 音量）0.15.0 已随旧播放器退场；
//        "单干员语种"那一档 0.17.0 也整体删除（上游 0.2.3 原生提供 ⇒ 我们不再有语音相关设置项）。
//   · ★★ v0.9.2 / 更新①（2026-10-08 服主口径「mod-setting 应与官方游戏内设置（左下角）使用同一入口，
//     而非右下角入口」）：**战斗内不再挂右下角浮动入口**。战斗内改走
//     「左下角官方设置齿轮 → 官方设置弹窗 → `settings.sections` 里的『模组设置』→ 皮肤与语音」。
//     ★ 干员调配界面那个 `--loadout` 浮动入口（顶栏放不下皮肤下拉时的完整入口）**保留**。
//   · ★★ 更新②（同一份服主需求）：模组设置里新增「随机皮肤」一组 ——
//     「立即为所有干员随机皮肤」按钮（局外，当场生效）+「每局开始时随机」开关（局内）。
//     随机范围 = **该干员已有的时装**（`skinvoice.json` 的 `operators[charId].skins`），空的不参与、不报错；
//     结果写进**现有存储**（`sp.pref.skinvoice` 的 `skins`），不动"皮肤 ↔ 战斗小人"的绑定、不改导入导出形状。
//     见 skins.js 的 `randomizeAll` / `restore` 与 battlerandom.js（触发点与幂等性）。
//   · ★ 0.7.1：**版本自证**（三处：栏位底部一行 / console 一行 / `globalThis.__SP_SKINVOICE__`），
//     用来回答「页面上加载的到底是哪一版」——见下面 `FALLBACK_VERSION` 与 setup() 的「0) 版本自证」。
//   · ★★ 0.9.0（语音轴重构，皮肤轴一行未动）：
//       ① CN 那 896 条改指**宿主同源** `/assets/audio/voice/cn/…`（与官方 `assets.json` 逐条对得上，
//          换路径脚本 内部验收脚本，可重跑）；JP 896 条一个字节没动；
//       ② 选**中文**时战斗内语音全交宿主（voice.js 的 `hostOwnsBattle()`），我们只补宿主静音的两处：
//          整备期拖动/转向的「部署」与调配界面点干员的「选中」⇒ **中文不再双播**；
//       ③ 选**日文**时用宿主现成闸门 `audio.setVolumes({ voice: 0 })` 压掉它那一路中文
//          （hostvoice.js；不猴补丁、不改基座），只听日配；
//       ④ 「关闭」档与改动前一致（我们不出声、宿主照旧）。
//
// ★ 为什么从"两个图标按钮 + 两个独立面板"改成下拉栏：用户明确说
//   「调皮肤的时候每个干员都要点开单独页面感觉很麻烦」⇒ 切换要就地，参数才进设置页。
// ★ 为什么下拉只列当前干员（v0.6.0）：用户说「直接显示所有干员皮肤列表很卡而且不好翻页与定位」。
//
// ★ 性质：**纯界面 Mod**。没有 data/ 补丁、没有 content/ 战斗行为、不动 public/**。
//   皮肤走"改内存材质清单 + 触发重渲染"，语音只做"这套时装下该用哪份语音资源"（改的是官方那张
//   内存语音表，播放时机/优先级/打断/音量 100% 由官方 `public/js/audio.js` 负责）。
//
// ★ 跨 Mod 通道（v0.5.0 新增）：别的 Mod 可以在**自己包根**放一份 `skinvoice-pack.json`（纯数据），
//   本 Mod 启动时读 `GET /mods` 快照、对每个「已启用且未跳过」的其它 Mod 试取一次、
//   把里面的 `operators` 并进数据表 ⇒ 干员的皮肤/语音可以**跟着干员包走**，不必改本 Mod 的大 JSON。
//   约定、合并口径、以及"为什么未装本 Mod 时它是零请求零副作用" ⇒ `packs.js` 文件头。
//
// ★ 依赖面（零改基座的全部代价，都在这里说清）：
//   1. hostApi 的 ui / slots / loadout / data（正式契约，extensions.js 的 CLIENT_MOD_API=1）。
//      —— 跨 Mod 通道只用 `snapshot`（或 `getMods()`）拿 Mod 列表 + 一次同源 fetch，不额外依赖任何东西。
//   2. ★★ 0.15.0 起**不再**依赖 `globalThis.__SP_RUNNER__`：那个战斗运行器只服务"我们自己播语音"
//      （`voice.js` 已整文件退场）⇒ 这里保留一条说明，免得下一个人以为还得去拿它。
//   3. `globalThis.__SP__.store`（main.js:356）+ `/js/store.js` 的 selectRoute ——
//      · ★ 更新②：「每局开始时随机皮肤」的**触发点**（路由进入 `'game'` ⇒ 抽一次，幂等；battlerandom.js）；
//      · ★ 0.16.0（工序 51）：设置栏位读"现在在不在局内"（决定「立即随机」那一行画不画）。
//      ★ 更新① 之前这里还负责"战斗内浮动入口的显示条件"——入口删了，那条用途随之消失。
//      拿不到 ⇒ 每局随机不可用、栏位退化成"按打开那一刻的路由渲染一次"（其余照常）。
//   4. ★★ 0.15.0 起**不再**需要 `/data/assets.json` 与离屏 `Audio`：那两件只服务我们自己的
//      SFX 降噪窗口（`sfxmeta.js` 已整文件退场）。
//   5. `/vendor/preact.module.js` 的 render —— 只在**没装「模组设置」**时用（兜底弹窗）+ 干员调配的浮动入口，
//      渲染进挂在 <body> 的独立容器（同源同 URL ⇒ 与宿主共用同一个 Preact 实例，hooks 正常）。
//   6. `globalThis.__SP_MODSETTINGS__`（本 Mod 自己引导的注册表，见 registry.js）——跨 Mod 联动的唯一通道。
//      ★ 更新① 之后它还要承担「点名看哪一栏」（`requestSection`）：官方设置弹窗由宿主控制，
//        Mod 无法替它切栏，所以意图挂在注册表上，由正在画这一页的实例自己接。
//   7. `/js/audio.js` 的 audio 单例 —— ★★ 0.15.0 起**只读**：它曾经用来 `audio.setVolumes({ voice: 0 })`
//      压掉宿主那一路中文（`hostvoice.js`），那条路已随旧播放器删除；0.17.0 起连"单干员语种"的
//      猴补丁代理也不再有。现在 `officialroute.js` 只 **import 它一次**、读两个只读字段
//      （`state().hasAudio` / `state().global`），**不写任何官方设置、不挂任何实例属性**。
//      拿不到 ⇒ 那两条内省为空，时装专属语音照常生效（它只依赖官方那张语音表）。
//   8. ★ 更新② 新增：`/shared/i18n.js` —— 新加的界面文案走宿主的 t()（msgid = 中文原文）。
//      拿不到 ⇒ 文案退回中文原文（那本来就是 msgid，玩家看到的东西没错）。见 i18n.js。
//   以上 2~8 全部是「拿不到就降级」，绝不报错、绝不影响页面、更不影响别的 Mod。

import { installStyle } from './style.js';
import { createConfig } from './config.js';
import { createSkinApplier } from './skins.js';
import { createOfficialRoute } from './officialroute.js';
import { attachBattleRandomizer } from './battlerandom.js';
import { settingsRegistry } from './registry.js';
import { applyPacks } from './packs.js';
import { buildNames, nameOf } from './panels.js';
import { iconVNode } from './icons.js';
import { installImgFallback } from './mirrors.js';
import { SkinSelect, IconBar } from './menu.js';
import { DiySlotSkin } from './diy.js';
import { SkinVoiceControls, SkinDetailRow } from './controls.js';
import { SkinVoiceSection, mountFallbackPanel } from './section.js';

const MOD_ID = 'cyanfish.skinvoice';
const DATA_URL = `/mods/${MOD_ID}/client/skinvoice.json`;

/**
 * 取宿主的 `selectRoute`（`/js/store.js`，与宿主 main.js 解析到同一个模块 URL）。
 * ★ 更新① 之后它**只**服务于「每局开始时随机皮肤」的触发点（原有的"战斗内浮动入口"已删）。
 * ★ 拿不到就返回 null，调用方按降级处理（见 battlerandom.js）；这里绝不抛错。
 */
async function loadSelectRoute() {
  try { const m = await import('/js/store.js'); return typeof m?.selectRoute === 'function' ? m.selectRoute : null; }
  catch { return null; }
}

/**
 * 内置版本号 —— **仅**在拿不到服务端 `/mods` 清单时兜底（静态托管 / 老服务器 / 离线）。
 * ★★ 必须与 `mod.json` 的 `version` **逐字符相同**：`内部验收脚本`
 *    有一条断言专门比对这两处，改版本号时两边一起改，漂移即报红。
 *
 * ★ 15 轮（2026-10-08，皮肤覆盖补齐）只为抬版号动了**这一行常量**：
 *   `mod.json` 0.10.0 → 0.11.0 时按上面那条约定必须同步改这里，否则 `verify_skinvoice.mjs`
 *   的"两处版本号一致"断言会直接报红。**除这一行外本文件一字未改**（自选编队/语音轴
 *   那两位同事的在途改动不受影响）。
 *
 * ★ 16 轮（2026-10-08，日文档两个哑掉的槽位）0.11.1 → **0.12.0**：同样两边一起改。
 *   本文件另有四处实质改动（都在这份 diff 里，逐条有注释）：
 *     ① 闸门（`createHostVoiceGate`）**提前到 `createVoicePlayer` 之前** —— 它的 `state().muted`
 *        是「作战中点干员」补播的唯一判据；
 *     ② `createVoicePlayer({ …, hostSuppressed: () => hostVoice.state().muted === true })`
 *        ⇒ 日文档才补播官方 `select`（中文档一个字节都不加）；
 *     ③ `attachHostRelease({ gate, runner, store, selectRoute })` ⇒ 结算临时放行宿主（中文兜底）；
 *     ④ `__SP_SKINVOICE__` 多挂三件只读内省（voice / hostVoice / runner）+ 卸载时摘掉 ③ 的三个订阅。
 *
 * ★ 17 轮（2026-10-10，issue 清单 v1.3「待修复② + 待修复⑧」）0.12.0 → **0.13.0**：两边一起改。
 *   本文件五处实质改动：
 *     ① 新建 `client/officialvoice.js`（官方「干员语音」那一路的**默认值**策略，三档 auto/off/on），
 *        并在闸门之前 `boot()/apply()`；
 *     ② `createHostVoiceGate({ …, releaseVoice })` ⇒ 结算放行放到"玩家自己想要的音量"
 *        （而不是被我们按成 0 的现值）；
 *     ③ `createVoicePlayer({ …, hostVoiceTakingOver })` ⇒ 官方那一路被我们接管时，战斗内 7 个槽位
 *        与"作战中点干员"的 `select` 都改由我们播（玩家把音量调回来则立刻交还宿主）；
 *     ④ 新建 `client/dragorigin.js`（指针线索）并传给 `createPrepDeployer({ draggedUidOf })`
 *        ⇒ 整备期交换位置时**只响被拖的那一个**；
 *     ⑤ `__SP_SKINVOICE__` 多挂 `officialVoice` / `dragOrigin` 两件内省，卸载时摘掉 ④ 的监听 +
 *        调 `officialVoice.dispose()` 还原玩家的官方音量。
 *   ★ 整备期"新音效打断旧音效"在 `voice.js`（`PREP_DEPLOY_GROUP` 一个组）与 `prep.js`（归属判定），
 *     本文件只负责把依赖接上。
 *
 * ★ 18 轮（2026-10-10，批次 6：语音轴两条收尾）0.13.0 → **0.14.0**：两边一起改。本文件三处实质改动：
 *     ① `createHostVoiceGate({ …, takingOver })` ⇒ 官方那一路的 0 是**我们写的**时候，结算
 *        （`result*`，只有宿主能播）也走"临时放行"⇒ 接管档下不再整段哑（A）；
 *     ② `createVoicePlayer({ …, reclaimHost })` ⇒ 每条战斗事件先把上一局的结算放行收回来（A 的配套，
 *        把"放行窗口内双播"从"依赖 12s 计时器 + 监听器注册序"变成每次事件先回收）；
 *     ③ 官方语音那一档的"本 Mod 语音关掉 ⇒ 交还宿主"全在 `officialvoice.js`（B），本文件不需要接线：
 *        它读的就是同一个 `cfg`。
 * ★ 19 轮（2026-10-10，工序 51：UI / 行为收尾）0.15.0 → **0.16.0**：两边一起改。本文件两处实质改动：
 *     ① `appStore` / `routeSel` 的求值**上移到第 3b 步**（新增 `isInMatchNow` / `onMatchChange`），
 *        因为注册给「模组设置」的那一栏要在 render 时读"在不在局内"（工序 51 反馈 ③ 的判据）；
 *        第 8 步不再重复声明（重复声明 = SyntaxError = 整个 Mod 不装）。
 *     ② `mountFallbackPanel` 多传 `isInMatch` / `onMatchChange`，与注册栏位那条路径**同一份**依赖。
 *
 * ★ 20 轮（2026-10-10，阶段 0 第二半：**删掉「单干员语种」轴**）0.16.0 → **0.17.0**：两边一起改。
 *   上游 0.2.3 **原生实现了逐干员语音语言**（`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`，
 *   存 `sp.pref.settings.voiceOverrides`，覆盖官方 12 个语音槽位），与本 Mod 那一档**逐点等价**；
 *   两份并存时官方那份在 `audio.voice()` **内层**读 `voiceOverrides`、我们那条在外层临时改
 *   `audio.voiceLang` ⇒ 10 格真值表里有 2 格我们的设置被**静默吃掉**
 *   （`内部工序记录` §3.4）⇒ **整条轴删除**，没有"保留差异化子集"这个选项。
 *   本文件三处改动：
 *     ① 第 1c 步：`boot()` 的日志不再报"单干员语种代理已装/不可用"（`state().proxied` 已随之退场）；
 *     ② 第 5c 步：传进 `SkinVoiceControls` 的 `hasVoice` 参数删除（语音那一件控件已不存在）；
 *     ③ 本段说明与顶部文件头的相应处更新。★ 时装专属语音轴（官方没有覆盖）**一条未动**。
 *
 * ★ 21 轮（2026-10-11，工序 64：**顶栏入口左移**）0.17.0 → **0.18.0**：两边一起改。
 *   服主口径原文：「你指的是顶栏的皮肤下拉吗，那个**如果右侧吃光宽度可以移动到顶栏左侧**，那边**暂时还没东西**。」
 *   ★ 前提已由工序 60 真机实测证实（`内部验收数据`）：1920px 宿主右簇列宽 810px、
 *     别人占 ≈748px ⇒ **余量 62px**，`.sp-sv__top` 被判成 `gear` 档、**0 个子节点**（2560~1024 全部如此）
 *     ⇒ 桌面宽度下入口完全不可见。**阈值救不了余量为 0 的列**，只能换列。
 *   本文件四处改动：
 *     ① 第 5 步：注册目标从 `loadout.topbar`（右簇）换成宿主新插槽 `loadout.topbarLeft`（左簇）；
 *        ★ 只有**老宿主没有这条插槽**时才整簇退回右簇（一条 warn），绝不出现"两边各一个下拉"；
 *     ② 档位判据换成 `LEFT_TIER_BY_BUDGET`，`budgetOf()` 改成量**本簇**（`root.parentElement`）余量
 *        ⇒ 同一条代码在左簇 / 右簇都成立；右簇时代的 `MIN_BUDGET` / `TIER_BY_BUDGET` 保留为历史口径、
 *        已无调用方；
 *     ③ `tierBus.isDegraded()` 只认 `gear`（22px 图标现在是**可用入口**，点击展开同一个列表浮层）⇒
 *        干员调配那个浮动入口只在"一个节点都画不出来"时才补位；
 *     ④ 根节点多两个属性：`class="sp-sv__top sp-sv__top--left"` 与 `data-sp-sv-slot="left|right"`
 *        （浮层方向由此类名决定，见 style.js 的 `.sp-sv__iconwrap--left`）。
 *   ★ **只动位置**：控件本体（`SkinSelect` / `IconBar` / 皮肤选择语义 / 配置键 / 与行内·自选编队两处
 *     控件同源）、行内插槽、详情面板插槽、语音轴、随机皮肤、官方路线在本次改动里**一个字未动**。
 *   ★ **设置齿轮留在右簇**（归 `cyanfish.mod-settings`，不在本次施工范围）⇒ 左簇只放皮肤下拉。
 *
 * ★ 22 轮（2026-10-11，工序 72：**皮肤控件移到官方语音的下一行 + 顶栏入口摘除**）0.18.0 → **0.19.0**：两边一起改。
 *   服主裁定原文：「我看官方把**干员独立配置语音放在了右侧的干员详情页**中，这可能**推翻了我们很早之前的
 *   『皮肤切换没法做到右侧干员详情页』中的论断**。**把干员时装放在干员独立语音配置下一行**可能会好一些。」
 *   + 「**顶栏左侧的皮肤控件不用留**，顶栏**只保留一个和官方相同的『设置』入口**即可，因为**右侧干员详情页是
 *   默认展示的**。」
 *   本文件四处改动：
 *     ① 第 5 步：**皮肤下拉从顶栏摘除**。现行只注册"设置入口"（`FallbackGear`：装了 `cyanfish.mod-settings`
 *        时它自己画齿轮、我们这一件返回 `null`）⇒ 顶栏里**没有本 Mod 的皮肤节点**；
 *        ★ 没有 `loadout.detailVoice` 的老宿主仍走 0.18.0 那一支（顶栏入口），**本树不执行**；
 *     ② 第 5c 步：详情面板的落点从 `loadout.detailActions`（潜能与练度之后）换成**新插槽**
 *        `loadout.detailVoice`（官方「此干员语音」的**下一行**）；旧插槽只作老宿主降级；
 *     ③ 第 9 步：有 `loadout.detailVoice` 时**不挂**浮动入口（`tierBus` 恒 null ⇒ 它会一直显示，
 *        等于第三个入口；详情面板/行内已经有控件）；
 *     ④ 本段说明与顶部文件头、`SLOT_*` 常量注释更新。
 *   ★ **只动位置**：皮肤选择语义 / 配置键 / 与行内·自选编队两处控件同源、官方语音路线、随机皮肤，
 *     以及**行内那一格（`loadout.rowActions`，服主先前明确要的）**在本次改动里**一个字未动**。
 */
const FALLBACK_VERSION = '0.20.0';
/** 宿主给 Selector 用的插槽名常量（api.slots.names 里也有一份，这里写常量让本文件自解释）。 */
const SLOT = 'loadout.topbar';
/** ★★ 0.18.0：顶栏**左组**的插槽（ui/extensions.js 的 LOADOUT_TOPBAR_LEFT，紧随官方「返回」之后）。
 *  ★★ 0.19.0：宿主侧那条插槽**已撤除**（工序 72，服主裁定"顶栏左侧的皮肤控件不用留"）⇒ 这里的常量
 *     只在**老宿主**（还没有 `loadout.detailVoice` 的版本）那条降级分支里还会命中（`api.slots.names` 里没有它）。 */
const SLOT_LEFT = 'loadout.topbarLeft';
/** ★ 0.10.0：自选编队（第三页）**按槽位**的操作区插槽（ui/extensions.js 的 LOADOUT_DIY_SLOT_ACTIONS）。 */
const SLOT_DIY_ACTIONS = 'loadout.diySlotActions';
/**
 * ★★ 0.19.0（工序 72）：详情面板里「官方语音控件**下一行**」的插槽
 * （ui/extensions.js 的 LOADOUT_DETAIL_VOICE = 'loadout.detailVoice'）。
 * 服主裁定原文：「把干员时装放在干员独立语音配置下一行可能会好一些。」⇒ 详情面板是皮肤控件的**常驻**落点。
 */
const SLOT_DETAIL_VOICE = 'loadout.detailVoice';
/** ★ 0.15.0：详情面板里「潜能与练度之后」那条**旧**落点（0.2.2 的 LOADOUT_DETAIL_ACTIONS）—— 老宿主降级用。 */
const SLOT_DETAIL_ACTIONS = 'loadout.detailActions';

/**
 * 顶栏到底能塞下几件 —— **运行时实测**，不是猜断点。
 *
 * ★★ 0.18.0：我们**不在右簇了**。下面这一整段（`MIN_BUDGET` / `TIER_BY_BUDGET`）是**右簇口径**的
 *   历史标定，保留它是因为它记录着"为什么要换位置"这件事的原始证据，**不再有调用方**。
 *   现行入口挂在**左簇**（插槽 `loadout.topbarLeft`），档位由下面的 `LEFT_TIER_BY_BUDGET` 定。
 *
 * ★★ 为什么换位置（工序 60 真机实测，`内部验收数据`）：
 *   宿主 `.lo-top` 是三列 grid（`minmax(max-content,1fr) auto minmax(max-content,1fr)`），
 *   左右两列对称。右簇 1920px 时列宽 ≈810px，而官方的「已调整 N/112 / 导出 / 导入 / 全部恢复默认」+
 *   别的 Mod 的节点合计 ≈748px ⇒ 余量 **62px**，再被 `.sp-sv__top` 自己的 gap 与齿轮一除就归零：
 *   实测 `data-sp-sv-tier="gear"`、`bud:0`、**一个子节点都没有**（2560/1920/1600/1440/1366/1280/1180/
 *   1100/1024 全部如此）⇒ 桌面宽度下这个入口**玩家根本看不到**（只有 900x500 这类窄屏宿主收起
 *   chip 时才露出来）。**阈值救不了余量本来就是 0 的列**，只能换到有余量的列去。
 *
 * ★ 为什么不能写死断点：`.lo-top` 是三列 grid，内容超过列宽就**溢出**去盖中间那列
 *   （CSS grid 不裁它；`.lo-top__right` 的 `justify-self:end` 让它向左压标题，
 *     `.lo-top__left` 的 `justify-self:start` 让它向右压标题）。
 *
 * ★★ 右簇历史实测（`probe_topo_fit.mjs`，带 8 个 Mod 的测试实例，19 个宽度档）说明"写死断点必翻车"：
 *   我们的簇当时是 `.lo-top__right` 的**第 2 个子项**（宿主把 `已同步/已调整/全部恢复默认` 渲染在插槽
 *   **之后**，loadout-io 的「导入/导出」在插槽之内、我们之前），所以左右都被占：
 *
 *   | 视口 | rem | 右列宽 | 别人占 | 我们的余量 | rem 归一 |
 *   |---|---|---|---|---|---|
 *   | 1920x1080 | 100 | 810 | 531 | **279** | 2.79 |
 *   | 1440x900  | 75  | 608 | 399 | **208** | 2.77 |
 *   | 1280x860  | 66.7| 540 | 373 | **167** | 2.50 |
 *   | 1100x640  | 57.3| 464 | 354 | **110** | 1.92 |
 *   | 1024x768  | 53.3| 432 | 347 | **85**  | 1.59 |
 *   | 860x414   | 40  | 361 | 274 | **87**  | 2.18 |
 *   | 760x480   | 40  | 319 | 166 | **153** | 3.83 ← 宿主 <=760px 收起「已同步/已调整」⇒ 余量反而变大
 *   | 667x375   | 40  | 272 | 166 | **106** | 2.65 ← 余量随宽度**非单调**：667 比 800(57) 多一倍
 *
 *   余量本身在 rem 单位下大致稳定（≈2.8rem），但会被宿主的断点（760px 收起、1100px 收 chip）打断，
 *   所以**只信实测**：右列宽和"别人占了多少"都是量出来的。
 *
 * ★ 阈值怎么定的：不是"最小能塞下"，而是"塞下的还**能用**"。四个量（都与 style.js 的 CSS 对齐，
 *   且跟 rem 一起长 —— 4K 屏上 rem 能到 240，写死 px 会一头错）：
 *     gear  = max(.48rem, 29px)  齿轮（= 我们图标的 .16rem 加上宿主 .btn 的 0 .16rem、再乘 3 边）
 *     gap   = max(.06rem, 5px)   .sp-sv__top 的 gap
 *     voice = max(.88rem, 58px)  语音下拉（单字标签）的自然宽
 *     skin  = max(1rem, 70px)    皮肤下拉**至少要这么宽**才算能用（≈5~8 个汉字）
 *   ⇒ skin 档 = gear + gap + skin；full 档 = gear + 2gap + voice + skin。
 *   实测这套阈值在 19 个宽度档上的结果（probe_topo_fit.mjs）：
 *     1920 → full（皮肤下拉 149px）· 1600 → full · 1440 → full（96px）· 1366 → full（86px）
 *     1280 → skin（129px）· 1180 → skin（99px）· 1100 → skin（72px）
 *     1024 / 960 / 900 / 860 / 800 / 600 / 500 / 414 / 390 / 360 → gear
 *     760 → skin（117px）· 667 → skin（70px，刚好卡在可用下限）
 *
 * ★★ v0.7.0 加了 `icon` / `mini` 两档后（上面那组 `'gear'` 里的非竖屏档都被它们接管；
 *   ★ 竖屏 <768px 被宿主「请将设备横屏」遮罩挡住，不是真实场景）——
 *   重测余量（probe_mobile_topbar2.mjs，本机 9 个 Mod 的实例）：
 *     1100x640 余 68 ⇒ icon（两个图标）· 1024x768 余 46 ⇒ mini（一个图标）
 *     960x600 余 27 ⇒ mini · 900x500 余 60 ⇒ icon · 896x414 余 72 ⇒ icon
 *     860x414 余 54 ⇒ icon · 844x390 余 46 ⇒ mini · 667x375 余 73 ⇒ icon
 *     800x360 余 24 / 780x360 余 14 ⇒ gear（真的一个都放不下：宿主自己的右簇就吃掉 300px）
 *   ★ 这些数字**随别的 Mod 与宿主断点变化**（余量对宽度非单调），所以只作参考；
 *     权威仍是每帧现量的 `budgetOf()` 与 `el.style.maxWidth`。
 *
 * ★ **绝不盖标题的硬保证不是阈值，而是 `maxWidth = budget`**：我们不可能比余量更宽 ⇒ 整簇不可能
 *   超出右列 ⇒ 不可能压到标题。阈值只决定"要不要少放一件"，偏保守最多让下拉窄一点，不会翻车。
 *   （唯一的例外是"齿轮都不够放"的极窄屏：齿轮 flex:0 0 auto 不能被压缩，它会**向右**溢出到
 *    「全部恢复默认」上 —— 实测 414x896 时右列本来就被宿主自己的内容撑爆 20px，此时宿主也没位置了。
 *     它向右溢出正好**躲开**标题，比压标题好。）
 * ★★ 0.18.0：以下阈值是**右簇**口径的**历史**标定（保留为"为什么要换位置"的证据），
 *   `MIN_BUDGET` / `TIER_BY_BUDGET` **已无调用方**。现行口径 = `LEFT_TIER_BY_BUDGET`（左簇，见下）。
 *   若有人要动这里，请先读上面那两段"为什么换位置"。
 */
export const MIN_BUDGET = (rem, ownGear = true) => {
  // ★★ v0.6.0：齿轮不再一定由我们画 —— 装了「模组设置」时是它画（同一个插槽里的**兄弟节点**，
  //   已经被 budgetOf() 的 `others` 算进去了）。此时若还把 gear 加进阈值，就是**重复扣减**：
  //   实测 1600x900 余量 173px，本身够放下两个下拉（voice+skin+2gap = 166.6），却因为多扣 40px
  //   被误判成 skin 档、白白少一个语音下拉。所以只在「我们自己画兜底齿轮」时才预留它。
  const gear = ownGear ? Math.max(0.48 * rem, 29) : 0;
  const gap = Math.max(0.06 * rem, 5);
  const voice = Math.max(0.88 * rem, 58);
  const skin = Math.max(1 * rem, 70);
  // ★★ v0.7.0：仅图标档。icon 宽 22px / 两个之间 4px —— 与 style.js 的
  //   `.sp-sv__iconbtn{width:max(.22rem,22px)}` + `.sp-sv__icons{gap:max(.04rem,4px)}` **同一组数**，
  //   改一处必须改另一处（否则"档位说放得下、实际向右溢出屏幕"）。
  const icon = Math.max(0.22 * rem, 22);
  const gapIcon = Math.max(0.04 * rem, 4);
  return {
    mini: gear + gap + icon,                        // 一个图标（浮层里含皮肤 + 语音两段）
    icon: gear + gap + icon + gapIcon + icon,       // 两个图标
    skin: gear + gap + skin,
    full: gear + 2 * gap + voice + skin,
  };
};

/**
 * 余量（px）+ 当前 rem ⇒ 档位。`ownGear=false` = 齿轮由「模组设置」画，我们不必为它留位。
 *
 * ★★ 0.18.0：**已无调用方**（保留为历史口径，见上面 `MIN_BUDGET` 那段）。现行 = `LEFT_TIER_BY_BUDGET`。
 * ★★ v0.7.0 新增 `icon` / `mini` 两档（用户口径：「手机网页端画面紧张不好显示的话可以仅显示图标，
 *   点击时在图标左下展开列表」）。此前窄屏落到 `'gear'` = **什么都不画**，所以手机横屏上
 *   皮肤/语音切换彻底消失（实测右簇余量只有 46~73px，连 70px 的皮肤下拉都放不下）。
 */
export const TIER_BY_BUDGET = (px, rem = 16, ownGear = true) => {
  const need = MIN_BUDGET(rem, ownGear);
  if (px >= need.full) return 'full';
  if (px >= need.skin) return 'skin';
  if (px >= need.icon) return 'icon';
  if (px >= need.mini) return 'mini';
  return 'gear';
};

/**
 * ★★ 0.18.0：**左簇**口径的档位阈值。
 *
 * 为什么另开一套：上面那套（`MIN_BUDGET`）是照**右簇**标定的 —— 那一簇里除了我们还站着
 * 宿主自己的「已调整 / 导出 / 导入 / 全部恢复默认」和别的 Mod，齿轮的归属也会影响扣减
 * （`ownGear` 那一整套逻辑）。左簇里只有官方「返回」一个按钮，且齿轮**永远留在右簇**
 * （0.18.0 起我们不再往左簇画兜底齿轮，见下面第 5 步）⇒ 左簇只剩"皮肤控件本身"这一个量：
 *   micro = max(.14rem,14px) 最后一档的极小图标（只在 375px 竖屏这种"宿主自己都快没位置"时出现）
 *   icon  = max(.22rem,22px) /.sp-sv__iconbtn 的宽（与 style.js 同一组数字）
 *   skin  = max(1rem,70px)   皮肤下拉至少这么宽才算能用（≈5~8 个汉字）
 * 四个字号档（rem）各一条：
 *   full  余量 ≥ skin + .6rem  ⇒ 下拉 + 一点余量（不顶到中间那列去）
 *   skin  余量 ≥ skin          ⇒ 下拉（原生 <select>，手机端走系统选择器）
 *   icon  余量 ≥ icon          ⇒ 22px 图标按钮 + 点击展开的列表浮层
 *   micro 余量 ≥ micro         ⇒ 14px 极小图标（同一个浮层，见 style.js 的 --micro）
 *   gear  连 14px 都放不下 ⇒ 一个节点都不画（此时干员调配界面的浮动入口接管，见 mountFab）
 * @param {number} px 左簇实测余量
 * @param {number} rem 根字号（px）
 */
export const LEFT_TIER_BY_BUDGET = (px, rem = 16) => {
  const micro = Math.max(0.14 * rem, 14);
  const icon = Math.max(0.22 * rem, 22);
  const skin = Math.max(1 * rem, 70);
  if (px >= skin + 0.6 * rem) return 'full';
  if (px >= skin) return 'skin';
  if (px >= icon) return 'icon';
  if (px >= micro) return 'micro';
  return 'gear';
};

/**
 * 首帧的猜测值（实测前的兜底，见上面那张表）。故意**偏保守**：多放一件的代价是"可能压到标题"，
 * 少放一件只是一个下拉晚出现一帧，而且它在设置弹窗里随时能改。
 * ★ v0.7.0：<1024px 的首帧初值从 `'gear'` 改成 `'icon'`（窄屏默认就该给图标，而不是空白）。
 * ★★ 0.18.0：左簇余量天然富余（1fr 列减去一个「返回」），所以首帧直接给 `'full'` ——
 *   首帧的 max-width 兜底（CSS 的 13.6vw）本来就不会溢出，实测完再落到真实档位。
 */
export const TOPBAR_TIERS = [
  ['full', '(min-width:1px)'],
];

/**
 * ★ v0.9.1：顶栏档位的**对外广播**（浮动入口订阅它）。
 *
 * 为什么需要：0.2.1 的宿主自己往「干员调配」顶栏右簇里加了 4 件东西
 * （`已调整 N/112` / `导出` / `导入` / `全部恢复默认`），右簇余量从 0.1.2 时代的 149px
 * 掉到**真机实测 44px** ⇒ 档位落到 `mini`，**皮肤下拉消失、只剩一个 22px 图标**。
 * 用户口径（2026-10-08）：「加一个浮动入口」⇒ 窄档位时在干员调配界面额外挂一个
 * 写着「皮肤与语音」的浮动按钮（复用战斗里那个 `.sp-sv__fab`），**不改基座、不加插槽**。
 *
 * ★★ 0.18.0：`icon` **不再算降级** —— 入口搬到左簇以后，22px 图标本身就是"看得见、点得到"的
 *   完整入口（点击展开列表，与 `skin` / `full` 两档同一个浮层）。只有 `gear` 档（连 22px 都放不下，
 *   一个节点都没画）才算降级、才需要浮动入口兜底。右簇时代的 `mini` 档已随右簇口径一起退场。
 */
export const tierBus = (() => {
  let tier = null;
  const subs = new Set();
  return {
    get: () => tier,
    /** 皮肤入口是否**一个节点都没画出来**（只有 `gear` 档如此；`icon` 档的图标是可用入口）。 */
    isDegraded: () => tier === 'gear' || tier == null,
    set(t) {
      if (t === tier) return;
      tier = t;
      for (const fn of [...subs]) { try { fn(t); } catch { /* ignore */ } }
    },
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
  };
})();

/**
 * 量出**我们所在那一簇**还剩多少宽度，返回 [根节点 ref, 档位]。
 * 同时负责「当前观看的干员」跟随（名单卡 aria-selected / loadoutStore）—— 两者共用一个观察者，
 * 少挂一个 MutationObserver。
 *
 * ★★ 0.18.0 改法：不再假设"我们在右簇"。簇 = `el.parentElement`（`UiSlot` 渲染成**兄弟节点、无包装**，
 *   所以我们的根节点的父节点就是宿主那一簇），其余子节点的实际宽度 + gap 就是"别人占的"，
 *   `parent.clientWidth` 减去它就是我们的余量。父节点是 flex 容器（`display:flex`，不是 grid item
 *   的隐式盒）⇒ `clientWidth` 就是这个 flex 容器的内容盒宽（padding 已经排除），不需要再减 padding。
 *   ⇒ 同一条代码在左簇、右簇都成立，宿主换布局也不用改这里。
 */
function useTopbarFit(api, onTick, reg) {
  const { useState, useEffect, useRef } = api.ui.hooks;
  const ref = useRef(null);
  const [tier, setTier] = useState(() => {
    try { for (const [name, q] of TOPBAR_TIERS) if (window.matchMedia(q).matches) return name; } catch { /* ignore */ }
    return 'full';
  });

  useEffect(() => {
    let alive = true;
    let budgetDbg = null;

    /**
     * 本簇余量（px）。全部是从宿主 DOM 上量的，不碰基座、不写死数字。
     *
     * ★★ 0.18.0 的**关键坑（工序 64 真机踩到；第一版验收五个体积全停在 gear / 0 宽）**：
     *   宿主 `.lo-top` 是 `minmax(max-content,1fr) auto minmax(max-content,1fr)` 三列 grid，而
     *   **fr 的分配依赖各列内容的 max-content** ⇒ "我们的 max-width ← 量出来的余量"是个闭环：
     *     量到小 ⇒ max-width 小 ⇒ 列分得小 ⇒ 下次量还是小 —— **死锁在 0**，
     *     连 ResizeObserver 都救不了（列宽确实没变）。真机现象：1920 能自愈，844 及以下永远 0。
     *   ★ 还踩到第二层：`.lo-top__left` 有 `justify-self:start` ⇒ **它不撑满自己的列**，
     *     所以 `cluster.clientWidth` 量到的是"内容宽"，**不是**"我们可用宽"（实测 844px 时
     *     列 298px 而 clientWidth 只有 131px）⇒ 拿 clientWidth 当额度会严重低估。
     *
     * ⇒ 现口径（**不依赖我们自己的宽度**，因此没有闭环）：
     *   ① 列宽从 `getComputedStyle(.lo-top).gridTemplateColumns` 读**解析后的轨道尺寸**
     *      （三列 grid ⇒ 三个 px 值；解析不了就退回 .lo-top 的内容宽 × 1/3）。
     *   ② 我们的额度 = 本簇那一列的宽 − 同簇里别人占的宽（官方「返回」等）− 它们之间的 gap。
     *      `justify-self:start` 不影响这个上界：列是 1fr、我们靠左，列宽就是我们能伸到的极限。
     *   ③ 再乘一道 **0.6 的保守系数**：真机还要留页面边距、别的 Mod 后到、字体变化等余量。
     *      ★ 实测（工序 64 五分辨率）：额度 ≈ 105px（1920）/ 85px（1600）/ 68px（1280）/ 46px（844）——
     *        与"皮肤下拉 ≥70px 才算能用"这条老口径对照，1920~1600 落 `full`、1280 落 `skin`、
     *        844 / 375 落 `icon`（22px 图标按钮 + 点击展开的列表浮层）。全部可见可点。
     *   ★ `others` 里**不含我们自己**：这是"没有闭环"的另一半（右簇旧算法把已经被压过的自己
     *     也算进 `others` 的兄弟集合里，但那没问题；问题是用了会随我们变化的 `col` 推算）。
     */
    const budgetOf = () => {
      const el = ref.current;
      const cluster = el?.parentElement;
      const top = document.querySelector('.lo-top');
      if (!el || !cluster || !top) return null;
      // ① 本簇那一列的宽度（三列 grid：left / center / right）
      let col = 0;
      try {
        const tracks = String(getComputedStyle(top).gridTemplateColumns || '').trim().split(/\s+/)
          .map((v) => parseFloat(v)).filter((v) => Number.isFinite(v));
        if (tracks.length === 3) {
          const center = document.querySelector('.lo-top__center');
          const left = document.querySelector('.lo-top__left');
          const isLeft = !center || !left || el.getBoundingClientRect().left <= center.getBoundingClientRect().left;
          col = isLeft ? tracks[0] : tracks[2];
        }
      } catch { col = 0; }
      if (!(col > 0)) {
        // 退路：三列等分（两侧是 1fr）。偏保守，不会溢出。
        const tcs = getComputedStyle(top);
        const pad = (parseFloat(tcs.paddingLeft) || 0) + (parseFloat(tcs.paddingRight) || 0);
        const g = parseFloat(tcs.columnGap || tcs.gap) || 0;
        col = Math.max(0, (top.clientWidth - pad - 2 * g) / 3);
      }
      // ② 同簇里别人占的宽（不含我们）+ **别人之间**的真实间隙
      const ccs = getComputedStyle(cluster);
      const gap = parseFloat(ccs.columnGap || ccs.gap) || 0;
      const others = [...cluster.children].filter((e) => e !== el);
      const othersW = others.reduce((a, e) => a + e.getBoundingClientRect().width, 0)
        + Math.max(0, others.length - 1) * gap;
      // ③ 保守系数：只在"余量本来就很富余"时打折（给页面边距 / 后到的 Mod / 字体变化留余量）；
      //    余量已经很小的时候**不打折** —— 否则 375px 那种"刨掉「返回」只剩几个像素"的场景
      //    会被 0.6 直接抹成 0（真机实测：不打折时 6px ⇒ micro 档，打得只剩 0 ⇒ gear 档、一个节点都没有）。
      //    不打折也不会溢出：列宽是硬上界，我们最多占满自己那一列，绝不到中间那列去。
      const SLACK = 0.32 * rem0(); // rem 的 0.32 倍当作"这就算富余了"的门槛
      const raw = Math.max(0, col - othersW);
      const factor = raw >= 70 + SLACK ? 0.6 : 1;
      budgetDbg = { col: Math.round(col), othersW: Math.round(othersW), raw: Math.round(raw), factor };
      return Math.max(0, Math.floor(raw * factor));
    };
    /** 当前根字号（px）。 */
    function rem0() {
      try { return parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch { return 16; }
    }

    const fit = () => {
      if (!alive) return;
      let budget = null;
      try { budget = budgetOf(); } catch { /* 量不到就别动，CSS 的 13.6vw 兜底 */ }
      const el = ref.current;
      if (el && budget != null) {
        const w = `${budget}px`;
        // ★ 只在真的变了才写：写 style 会触发一次 layout ⇒ 观察者又回调 ⇒ 不设防会自激。
        //   （写的是 max-width，不影响"别人占多少"，所以量出来的 budget 稳定，天然收敛。）
        if (el.style.maxWidth !== w) el.style.maxWidth = w;
      }
      if (budget != null) {
        // ★ 阈值是 rem 量纲：控件尺寸跟着 rem 走（手机端 rem=40，桌面 4K 能到 240）。
        let rem = 16;
        try { rem = parseFloat(getComputedStyle(document.documentElement).fontSize) || 16; } catch { /* ignore */ }
        // ★★ 0.18.0：左簇口径（齿轮留在右簇、不参与这里的扣减）⇒ 不再需要 ownGear 这个量。
        //   `reg` 形参保留只为兼容调用点（订阅那一条仍有意义：别的 Mod 置位 host 会改重画）。
        setTier((t) => { const n = LEFT_TIER_BY_BUDGET(budget, rem); return t === n ? t : n; });
      }
      onTick?.();
    };
    // 验收 / 自查用（只读内省）：最近一次额度量测的拆解 —— `{ budget:{col,othersW,raw,factor}, tier }`
    try {
      globalThis.__SP_SKINVOICE_FIT__ = () => ({
        budget: budgetDbg,
        tier: ref.current?.getAttribute?.('data-sp-sv-tier') || null,
        clusterW: ref.current?.parentElement?.clientWidth ?? null,
        elW: ref.current ? Math.round(ref.current.getBoundingClientRect().width) : null,
        rem: rem0(),
      });
    } catch { /* 极端环境下 globalThis 只读，忽略 */ }

    fit();
    const on = () => fit();
    window.addEventListener('resize', on);
    // ★★ 0.18.0 修一个**真机踩到的坑**：进程 64 的第一次验收里，五个体积全部停在 `gear` 档、0 宽。
    //   成因：`fit()` 在挂载那一刻可能量到"布局还没落定"的 `parent.clientWidth`（0 或很小），
    //   于是写出了 `max-width: 0px`；而 MutationObserver / resize / store 三条路**都不会因为
    //   "父容器尺寸变了"而触发** ⇒ 档位永远停在 `gear`（只有在别的 DOM 变动恰好撞上时才自愈）。
    //   ⇒ 补一个 ResizeObserver 盯**本簇**（父容器）与文档根（rem 变化）：
    //     几何一变就重量一次。`max-width` 变化**不会**改变父容器的尺寸（它是 flex 子项的上限，
    //     而父容器宽度由 grid 列决定）⇒ 天然收敛，不会自激。
    let ro = null;
    try {
      if (typeof ResizeObserver === 'function') {
        ro = new ResizeObserver(on);
        const cluster = ref.current?.parentElement;
        if (cluster) ro.observe(cluster);
        ro.observe(document.documentElement);
      }
    } catch { /* 老浏览器没有 ResizeObserver ⇒ 退回 resize / MO / store 三条路 */ }
    // ★ 再兜两层"首帧量早了"的情况：rAF 一帧后重量一次 + 400ms 后终检一次（都是幂等的）。
    let raf = 0; let timer = 0;
    try { raf = requestAnimationFrame(() => { try { fit(); } catch { /* ignore */ } }); } catch { /* ignore */ }
    try { timer = setTimeout(() => { try { fit(); } catch { /* ignore */ } }, 400); } catch { /* ignore */ }
    let mo = null;
    try {
      // 覆盖三件事：① 名单整块出现 ② 选中态翻转（玩家点了别的干员）
      // ③ 宿主/别的 Mod 改顶栏（本簇里别人占了多宽 ⇒ 我们的额度要跟着重算）
      mo = new MutationObserver(on);
      mo.observe(document.body, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-selected'] });
    } catch { /* 老浏览器没有 MutationObserver ⇒ 退回只靠 resize */ }
    let un = () => {};
    try { un = api.loadout.store.subscribe(on) || (() => {}); } catch { /* ignore */ }
    // ★★ v0.6.0：别的 Mod（模组设置）置位 `host` 会改变"设置齿轮归谁画"⇒ 界面要重算一次。
    //   ★ 0.18.0：这个量**已经不影响额度**（齿轮留在右簇、不在左簇的扣减里），但订阅保留 ——
    //     注册表变化意味着"设置入口长什么样"可能变了，重画一次是廉价的正确做法；加载顺序无关。
    let unreg = () => {};
    try { if (typeof reg?.subscribe === 'function') unreg = reg.subscribe(on) || (() => {}); } catch { /* ignore */ }
    return () => {
      alive = false;
      window.removeEventListener('resize', on);
      try { un(); } catch { /* ignore */ }
      try { unreg(); } catch { /* ignore */ }
      try { mo?.disconnect(); } catch { /* ignore */ }
      try { ro?.disconnect(); } catch { /* ignore */ }
      try { if (raf) cancelAnimationFrame(raf); } catch { /* ignore */ }
      try { if (timer) clearTimeout(timer); } catch { /* ignore */ }
    };
  }, []);

  return [ref, tier];
}

/**
 * Mod 入口。extensions.js 会 await 它；抛错 = 该 Mod 被跳过（其余 Mod 不受影响）。
 * @param {any} api hostApi
 */
export default async function setup(api) {
  installStyle();
  const { html } = api.ui;
  const log = api.log || console;

  // ---- 0) 版本自证 ---------------------------------------------------------------------------------
  // ★★ 用户口径（2026-10-08）：「我自己在 PC 网页测试服和手机测试服均未看见应用的修改，是没有自动
  //    刷新还是没有部署新版本」—— 这个疑问**玩家自己无法回答**，因为界面上没有任何地方显示版本号。
  //    于是加三处自证，任选一处可见即可判定"浏览器这次加载的是哪一版"：
  //      ① console.info 一行 —— 开 DevTools 就能看到（格式与宿主 [mods] 日志对齐）；
  //      ② globalThis.__SP_SKINVOICE__ —— 给验收脚本 / 用户在 Console 里敲一行自查；
  //      ③ 「模组设置 → 皮肤与语音」栏位底部一行 `vX.Y.Z` —— 不装任何工具，肉眼可见。
  //    ★ 版本号**优先取服务端 `/mods` 清单**里本 Mod 的 version（= 浏览器本次真正拿到的清单，
  //      这也是唯一能区分"服务端装的是哪版"与"浏览器缓存了哪版"的来源）；拿不到才回落内置常量。
  //    ★ 三处都只读、不报错，绝不因为版本号缺失影响装载。
  const VERSION = String(api?.mod?.version || FALLBACK_VERSION);
  const VERSION_SRC = api?.mod?.version ? 'server' : 'builtin';
  try {
    globalThis.__SP_SKINVOICE__ = {
      id: MOD_ID,
      version: VERSION,
      source: VERSION_SRC,          // server = 来自 GET /mods 清单；builtin = 清单不可用
      apiVersion: api?.apiVersion ?? null,
      at: new Date().toISOString(),
    };
  } catch { /* 极端环境下 globalThis 只读，忽略 */ }
  log.info?.(`[${MOD_ID}] v${VERSION} 已装载`
    + (VERSION_SRC === 'server' ? '（版本号取自服务端 /mods 清单）' : '（/mods 清单不可用，用内置版本号：可能是静态托管）'));

  // ---- 1) 数据表（Mod 自带，随 Mod 目录下发）--------------------------------------------------
  // ★★ 0.11.1 修：**表必须带版本号取，否则会被浏览器永久缓存住**。
  //   症状（2026-10-08 服主实报）：Mod 升到 0.11.0、皮肤表从 162 套扩到 271 套之后，
  //   已经打开过页面的浏览器里，**自选编队页几乎每个干员都显示「该干员无时装」** ——
  //   因为 `force-cache` 的含义是「用缓存、**不校验**」，而这里原来的 URL 没有版本号，
  //   于是老浏览器一直拿着旧的那份 1.4 MB 表（旧表 112 名里**没有一个**属于自选池 ⇒ 全军覆没）。
  //   为什么代码是新的、表却是旧的：`client/` 目录下的 `.js` 由宿主按 `Cache-Control: no-cache` + ETag 下发
  //   （每次都会校验），只有这个 `fetch` 显式绕过了校验。
  //   ⇒ 两道保险一起上：
  //     ① URL 拼上 `VERSION`（换版本必然换 URL）；
  //     ② `cache: 'no-cache'` —— 它的含义是「**可以**用缓存，但**必须先跟服务器校验**」，
  //        没变就是一次 304（~200 字节），变了就重新下载。
  //     ★ 只做①不做②是不够的：万一有人改了表却没抬版本号，同一个 URL 依然会把旧内容钉住
  //       （实测：把 `?v=` 同一个值先用旧表灌进缓存，再换新表，`force-cache` 读到的还是旧表）。
  let table = null;
  const dataUrl = `${DATA_URL}?v=${encodeURIComponent(VERSION)}`;
  try {
    const res = await fetch(dataUrl, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    table = await res.json();
  } catch (e) {
    throw new Error(`[${MOD_ID}] 数据表载入失败 ${dataUrl}：${e?.message || e}`);
  }
  if (!table || !table.operators) throw new Error(`[${MOD_ID}] 数据表缺少 operators`);

  // ---- 1b) 跨 Mod 的皮肤/语音包（约定：`<mod>/skinvoice-pack.json`，纯数据）------------------------
  // ★★ 用户口径（2026-10-08）：「把结城理的皮肤和语音补上，**放在结城理的干员包中**，
  //    未加载 skinvoice mod 时**静默丢弃**对应皮肤语音内容。」
  //   ⇒ 包由贡献方（如 `cyanfish.makoto`）随自己的干员包发布，本 Mod 在运行时**发现 + 合并**。
  //   ★ 包不含任何代码 ⇒ 没装本 Mod 时那个文件**一次请求都不会发生**，这就是"静默丢弃"最干净的形式
  //     （不是"载入后再忽略"，而是根本没有执行面）。
  //   ★ 这里做的只是把**别的已启用 Mod** 提供的包并进上面那张表；每一步都是"失败即跳过"，
  //     绝不因为某个 Mod 的包坏掉而让本 Mod 装载失败（与 extensions.js 对坏 Mod 的态度一致）。
  const packs = await applyPacks({ api, table, selfId: MOD_ID, log });
  if (packs.loaded.length) {
    log.info?.(`[${MOD_ID}] 已合并 ${packs.loaded.length} 个皮肤/语音包：${packs.loaded.join('、')}`
      + `（+${packs.operators} 干员 / +${packs.skins} 时装 / +${packs.voicelines} 条语音）`);
  }

  const cfg = createConfig({ log });
  const skins = createSkinApplier({ api, cfg, table, log });
  // ★★ 更新② / 更新①：宿主的 selectRoute（"每局开始时随机"的触发点要用；拿不到 ⇒ null ⇒ 安静降级）。
  //   在这里就发起（与后面的官方路线供给层初始化并行），第 8b 步 await 它 —— 不额外拖慢装载。
  const routeP = loadSelectRoute();

  // ---- 1c) ★★ 0.15.0（工序 48）：**把语音整合进官方路线**（我们只做"资源供给"这一层）------------------
  //   服主口径：「时装专属语音应保留，但其语音的**触发情况应整合进官方路线**」+「移除我们干员语音相关的
  //   整体功能，转用官方的干员语音」+「该 mod 现在**不应更改任何官方默认设置**」。
  //   ⇒ 我们**不再自己播**：`voice.js`（`new Audio()` 播放器 + 战斗事件流触发 + 打断/归属判断）、
  //     `hostvoice.js`（声道闸门）、`officialvoice.js`（把官方音量写成 0）、`sfxmeta.js` / `prep.js` /
  //     `dragorigin.js`（那三件只为"我们自己播"服务）**整文件删除**。
  //   ⇒ 只留 `officialroute.js` 一件事：**这套时装下、这个槽位该用哪份语音资源**。
  //     播放时机 / 槽位 / 优先级 / 打断 / 音量 100% 由官方 `public/js/audio.js` 负责。
  //   ★★ 0.17.0（阶段 0 · 第二半）：原先还有第二件事"单干员语种解析"（猴补丁代理），**整条轴删除** ——
  //     上游 0.2.3 原生提供逐干员语音语言（`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`），
  //     逐点等价；两份并存时 10 格真值表里有 2 格我们的设置被官方静默吃掉
  //     （`内部工序记录` §3.4）⇒ 能力交回官方。
  //   ★ 详细的口径、为什么不是 L2 静态数据补丁（实测官方表按 charId 索引、结构上表达不了"哪套时装"）、
  //     以及两条还原口径 ⇒ `officialroute.js` 的文件头。
  const officialRoute = createOfficialRoute({ cfg, log });
  void officialRoute.boot().then((st) => {
    log.info?.(`[${MOD_ID}] 时装专属语音已整合进官方路线：官方表改写 ${st.overlaid.length} 名；`
      + '逐干员语种由官方提供（0.2.3 起），本 Mod 不再参与；播放 / 优先级 / 打断 / 音量全部由官方负责');
  });

  // ---- 2) 「当前观看的干员」------------------------------------------------------------------------
  // ★ 需求："语音（与皮肤）都按当前观看的为准"。loadoutStore 里本来就有 sel（当前选中的 base chess id），
  //   而 hostApi 把整个 store 暴露给了 Mod —— 所以顶栏控件天然知道用户在边栏点了谁。
  let lastOp = null;
  let names = null;

  /** 保证 chess 数据在手（下拉栏与设置页要拿干员名字）。 */
  async function ensureChess() {
    try { await api.data.load('chess'); } catch { /* 名字回落 charId */ }
    if (!names) names = buildNames(api);
    return names;
  }

  /** chessId → charId（chess 记录按 chessId 索引，数据表按 charId 索引）。 */
  function charIdOf(chessId) {
    if (!chessId) return null;
    try { return api.data.lookup('chess', chessId)?.charId || chessId; } catch { return chessId; }
  }

  const firstWith = (key) => Object.entries(table.operators).find(([, o]) => Array.isArray(o[key]) && o[key].length)?.[0]
    || Object.keys(table.operators)[0];

  /**
   * 展示用名字。
   * ★ 必须优先用"当前选中的那张卡"自己的名字：别的 Mod 新增干员（如 cyanfish.makoto 的结城理）
   *   是 `chess` 记录改了 name、而 charId 仍是它借用的官方模板（char_498_inside）——
   *   若只查 charId→名 映射，会把玩家看到的"结城理"显示成模板干员名「隐现·改」，一眼就是错的。
   */
  function displayNameOf(op) {
    try {
      const sel = api.loadout.store.get().sel;
      const rec = sel ? api.data.lookup('chess', sel) : null;
      if (rec && charIdOf(sel) === op && rec.name) return rec.name;
    } catch { /* ignore */ }
    return nameOf(names, op);
  }

  /** 当前该作用在哪个干员上。 */
  function currentOp() {
    // ① store.sel —— 用户在名单里点过谁，最权威
    try {
      const cid = charIdOf(api.loadout.store.get().sel);
      if (cid && table.operators[cid]) return cid;
    } catch { /* store 还没就绪 */ }
    // ② 名单里"被选中"的那张卡 —— ★ 必须补这一步：**宿主从不写 store.sel**（实测恒为 null），
    //    它自己在 loadout.js:357 用 `st.sel ?? list[0].chessId ?? roster[0].chessId` 现算，
    //    Mod 复现不了那个筛选回落，所以直接读宿主渲染出来的结果：名单卡带
    //    `role="option" aria-selected data-chess`（loadout.js:104-105）。
    //    ★★ 但这一步**只能在提交后跑**：首次 render 时 .lo-grid 还没进 DOM（同一棵树里的后置兄弟），
    //    当时读必然落空 ⇒ 见下面 SkinVoiceTopbar 里 useEffect 的说明。
    try {
      const el = document.querySelector('.lo-grid [data-chess][aria-selected="true"]');
      const cid = charIdOf(el?.getAttribute('data-chess'));
      if (cid && table.operators[cid]) return cid;
    } catch { /* 静态托管 / 不在调配界面 */ }
    return lastOp || firstWith('skins');
  }

  // ★ 干员名字表尽早备好：下拉的 optgroup 标签要用它，否则玩家看到的是 `char_1012_skadi2` 这种裸 id。
  //   （`buildNames` 需要 chess 数据；loadoutStore 的 sel→charId 也需要 ⇒ 两处都靠它。）
  void ensureChess();

  // ---- 3) 皮肤套用 + 上游回退（面板与宿主 <img> 共用同一条链） -----------------------------------------
  /** 把配置里的皮肤写进 manifest 并让界面重渲染。切换上游线路时也必须重跑（URL 形态变了）。 */
  const reapply = () => {
    void skins.applyAll().then(() => skins.rerender()).catch((e) => log.warn?.(`[${MOD_ID}] 应用皮肤失败`, e));
  };
  // ★ 宿主自己渲染的 <img>（详情立绘/头像）Mod 拿不到 vnode，只能靠**捕获阶段**的 error 监听
  //   把它们推到链上的下一环（资源错误不冒泡，但会经过 window 的捕获阶段）。
  const offImgFallback = installImgFallback({ getMode: () => cfg.get().mirror, log });

  // ---- 3b) ★★ 0.16.0（工序 51）：「现在在不在局内」——**只**服务于"取消局内立刻随机"（服主反馈 ③）------
  //   为什么要它：那一栏的宿主是**官方设置弹窗**（左下角齿轮），它在**局内也打得开**；而「立即为所有干员
  //   随机皮肤」在局内是**不可靠**的 —— 真机实测：配置与材质清单确实改了、**语音跟着变**，但**战斗里
  //   已经建好的 spine 小人不会变**（小人是战斗场景建立时按当时的 manifest 建好的）。
  //   ⇒ 服主口径「取消局内的『立刻随机全部干员皮肤』功能，仅局外可随机」。
  //   ★ 判据复用**宿主自己的那一份真相** `/js/store.js` 的 `selectRoute`（就是 `battlerandom.js` 用的那个），
  //     不另造第二份"我在不在局内"：`selectRoute(s) === 'game'` 的口径是
  //     「m.public.phase ≠ LOBBY 或 room.inMatch」，与"每局开始时随机"的触发点**同一个定义**。
  //   ★ 拿不到 store / selectRoute ⇒ `isInMatch()` 恒 false ⇒ 退化成"永远画"（= 工序 51 之前的行为），
  //     绝不因为拿不到内省就把功能藏起来。
  //   ★★ 顺序是硬约束：`appStore` / `routeSel` 必须在**第 4 步之前**就位（注册栏位的 render 闭包会读它们）。
  //      `routeSel` 由第 1b 步发起的 `routeP` await 而来；原来这一对在第 8 步才求值。
  let appStore = null;
  try { appStore = globalThis.__SP__?.store ?? null; } catch { /* ignore */ }
  const routeSel = await routeP;
  const routeNow = () => {
    try {
      if (!appStore || typeof appStore.get !== 'function' || typeof routeSel !== 'function') return null;
      return routeSel(appStore.get());
    } catch { return null; }
  };
  /** @returns {boolean} 现在在不在局内（战斗 / 整备）；拿不到宿主路由时恒 false。 */
  const isInMatchNow = () => routeNow() === 'game';

  // ---- 4) 把本 Mod 的参数栏注册给「模组设置」（`cyanfish.mod-settings`） -----------------------------
  // ★★ 用户口径（2026-10-08）：「将设置页面独立为一个『模组设置』的 mod，其他 mod 通过联动该 mod
  //    实现修改对应参数，例如 skinvoice mod 仅单独列一个『皮肤与语音』的栏位」。
  //   ⇒ 外壳（齿轮 / 两栏面板 / 分栏切换）在 `cyanfish.mod-settings` 里，本 Mod 只交出一栏内容。
  //   ★ 联动通道 = globalThis 上一份幂等注册表（见 registry.js 文件头）；本 Mod **不依赖**它一定存在。
  const reg = settingsRegistry();
  /**
   * ★★ 0.16.0：「局内 / 局外」变化的订阅口 —— 交给**栏位自己**在 useEffect 里挂（见 section.js）。
   *   ★ 为什么不是"外面拿到重画句柄"：注册表把 `render` 当**零参组件**渲染（`registry.js:16`），
   *     外面拿不到那个组件的 forceUpdate；所以推给组件自己订阅最稳（Preact 会管挂载/卸载）。
   *   ★ 拿不到宿主 store ⇒ 返回一个空退订，栏位退化成"按打开那一刻的路由渲染一次"
   *     （官方设置弹窗每次打开都是**重新挂载** ⇒ 那一刻的值本来就是对的；这里只是补"弹窗开着时进出局"）。
   */
  const matchListeners = new Set();
  const onMatchChange = (fn) => {
    if (typeof fn !== 'function') return () => {};
    matchListeners.add(fn);
    return () => matchListeners.delete(fn);
  };
  const disposeSection = reg.register({
    id: 'skinvoice',
    title: '皮肤与语音',
    order: 20,
    // ★ 不传 micro：栏位列表里只留中文名（用户口径：英文 eyebrow 一律清掉，小字说明全删）
    // ★ 零参组件：依赖在本 Mod 的闭包里，设置页只负责渲染
    // ★ version 传进去只为了在栏位底部显示一行版本号（版本自证 ③），不参与任何逻辑
    // ★★ table / skins 是更新②（随机皮肤）新加的依赖：随机范围 = table（该干员已有的时装），
    //    写入存储 + 套用 + 重渲染 = skins；两个宿主（官方设置弹窗 / 本 Mod 的独立弹窗）用的是**同一份**组件。
    // ★★ isInMatch / onMatchChange 是工序 51 新加的：决定「立即随机」那一行画不画（见 section.js 文件头 ①）。
    render: () => html`<${SkinVoiceSection} api=${api} cfg=${cfg} table=${table} skins=${skins} onReapply=${reapply}
      version=${VERSION} isInMatch=${isInMatchNow} onMatchChange=${onMatchChange} />`,
  });
  /**
   * ★★ 0.16.0：路由**进出局**时通知栏位重画。
   *   为什么必须有：设置弹窗在局内也开着，而"那一行画不画"是 render 时才读的值；没有这条订阅，
   *   玩家在局内开着设置、打完之后那一段会停在旧结果上。
   *   ★ 与第 8 步的 `attachBattleRandomizer` 是**两个独立订阅**：那个管"到点抽一次"（幂等），
   *     这个只管"界面跟着路由重画"。两者互不影响。
   */
  let lastRoute = routeNow();
  let offRouteRepaint = () => {};
  if (appStore && typeof appStore.subscribe === 'function' && matchListeners) {
    try {
      offRouteRepaint = appStore.subscribe(() => {
        const r = routeNow();
        if (r === lastRoute) return;
        lastRoute = r;
        for (const fn of [...matchListeners]) { try { fn(); } catch { /* 一个订阅者坏掉不影响别人 */ } }
      }) || (() => {});
    } catch { offRouteRepaint = () => {}; }
  }
  // 没装「模组设置」时（注册表里 host 为 null）用**同一份**栏位渲染一个最小弹窗，别让参数没地方改
  const fallback = await mountFallbackPanel({ api, cfg, table, skins, onReapply: reapply, log, version: VERSION,
    isInMatch: isInMatchNow, onMatchChange });
  /** 打开设置页；点名要哪一栏（干员调配的浮动入口固定打开「皮肤」）。 */
  const openSettings = (sectionId = 'skinvoice') => {
    if (reg.host?.open) { try { reg.host.open(sectionId); return; } catch { /* 落到兜底 */ } }
    fallback.open();
  };

  // ---- 5) 顶栏：只剩「和官方相同的设置入口」（★★ 0.19.0 起皮肤下拉**不在顶栏**了）------------------
  // ★★ 服主裁定原文（2026-10-11，工序 72）：
  //   「**顶栏左侧的皮肤控件不用留**，顶栏**只保留一个和官方相同的『设置』入口**即可，
  //     因为**右侧干员详情页是默认展示的**。」
  //   ⇒ 皮肤控件此后固定在**两处**（都会在第 5c 步注册，都在宿主插槽里）：
  //       ① **详情面板** —— 官方「此干员语音」控件的**下一行**（`loadout.detailVoice`，★ 宽屏窄屏都在）；
  //       ② **名单行内** —— 「潜能 / 练度」右侧那一格（`loadout.rowActions`，≥1600px，服主先前明确要的）。
  //   ⇒ 顶栏里我们**最多只剩一个节点**：没装「模组设置」时补的那颗齿轮（外观与官方设置按钮同款：
  //     `Button variant="secondary" size="sm"` + 齿轮图标）。装了「模组设置」时它自己往**同一个插槽**
  //     `loadout.topbar` 注册齿轮，我们这一件返回 `null` ⇒ 顶栏里**一个本 Mod 的节点都没有**、
  //     同一时刻也**只有一个设置入口**（真机节点计数与截图见 `内部工序记录`）。
  //
  // ★ 历史（0.15.0 / 0.17.0 / 0.18.0）：顶栏曾经承载「皮肤下拉 + 语音下拉 + 齿轮」三件；语音那两件先退场
  //   （语种与总开关只有官方那一份），0.18.0 又把皮肤下拉从左簇搬到右簇再搬到左簇。本条把**皮肤下拉整件
  //   摘除**：它解决的是"玩家在调配界面找不到换肤入口"，而工序 72 之后详情面板（默认展示）里就有控件。
  //
  // ★★ 老宿主降级（**本树 0.2.3 不执行这一支**）：既没有 `loadout.detailVoice` 的宿主上，详情面板里没有
  //   按干员的落点 ⇒ 只能沿用 0.18.0 的顶栏入口（左簇优先）。保留它不是因为"还想放顶栏"，
  //   而是"拿不到新插槽时不要变成功能真空"（与 extensions.js 对老宿主的一贯态度一致）。
  // ★ 下面那一支里的 `useState + useEffect + useTopbarFit` 存在的理由（对老宿主依旧成立）：
  //   顶栏要的两个值**都是页面后置就绪的**，在 render 阶段取必然取不到（实测踩过）：
  //     · op    —— 首次 render 时 `.lo-grid` 还没进 DOM；且宿主**从不写** store.sel。
  //                结果下拉默认停在 `firstWith('skins')`（表里第一个干员），与详情面板显示的
  //                干员**不是一个人**：实测下拉 = char_1012_skadi2 而详情 = 隐现(char_498_inside)。
  //                玩家要是直接拉一下就会改错了人的皮肤。
  //     · names —— 干员名字表要等 chess 数据，异步就绪；render 阶段恒为 null ⇒ optgroup 标签
  //                显示成裸 charId（实测 group label 就是 "char_1012_skadi2"）。
  //     · tier/maxWidth —— 本簇余量要等布局落定才能量（见 useTopbarFit）。
  const leftSlot = api.slots.names?.LOADOUT_TOPBAR_LEFT || SLOT_LEFT;
  let hasLeftSlot = false;
  try { hasLeftSlot = !!api.slots.names && api.slots.names.LOADOUT_TOPBAR_LEFT === SLOT_LEFT; } catch { hasLeftSlot = false; }
  /** 老宿主那条降级分支里，我们的入口注册在哪一簇（`left` 优先）。★ 也用于浮层方向类名。 */
  const where = hasLeftSlot ? 'left' : 'right';
  /**
   * ★★ 0.19.0：详情面板有没有「官方语音下一行」那条新插槽 —— 它决定皮肤控件有没有**常驻**落点。
   * 有 ⇒ 顶栏只留设置入口（皮肤下拉摘除）；没有 ⇒ 退回 0.18.0 的顶栏入口（老宿主降级）。
   */
  let hasDetailVoiceSlot = false;
  try { hasDetailVoiceSlot = !!api.slots.names && api.slots.names.LOADOUT_DETAIL_VOICE === SLOT_DETAIL_VOICE; } catch { hasDetailVoiceSlot = false; }
  const topbarSlot = hasLeftSlot ? leftSlot : (api.slots.names.LOADOUT_TOPBAR || SLOT);

  if (hasDetailVoiceSlot) {
    // ---- 5a) 0.2.3 现行：顶栏只留「设置」入口（齿轮归谁画见上面的说明）------------------------------
    try {
      api.slots.register(api.slots.names.LOADOUT_TOPBAR || SLOT, function SkinVoiceTopbarGear() {
        return html`<${FallbackGear} api=${api} reg=${reg} onOpen=${() => openSettings()} />`;
      });
      log.info?.(`[${MOD_ID}] 顶栏只保留设置入口（皮肤入口已按服主裁定移到详情面板 ${SLOT_DETAIL_VOICE}`
        + ` 与行内 loadout.rowActions）`);
    } catch (e) {
      log.warn?.(`[${MOD_ID}] 顶栏的设置入口不可用（插槽 ${SLOT} 注册失败？），其余功能照常`, e);
    }
  } else {
    log.warn?.(`[${MOD_ID}] 宿主没有 ${SLOT_DETAIL_VOICE} 插槽（旧版本？）：皮肤入口退回顶栏 ${topbarSlot}，其余功能照常`);
    try {
      api.slots.register(topbarSlot, function SkinVoiceTopbar() {
        const { useState, useEffect } = api.ui.hooks;
        const [vm, setVm] = useState(() => ({ op: currentOp(), names: null }));

        // 每次 layout 落定 / 店铺变动都重算 op（与本簇余量共用一个观察者）
        // ★ 传 reg：别的 Mod（模组设置）接上/断开时重画一次（0.18.0 起它不再影响额度）。
        const [rootRef, tier] = useTopbarFit(api, () => {
          setVm((p) => { const op = currentOp(); return op === p.op ? p : { ...p, op }; });
        }, reg);

        // ★ v0.9.1：把档位广播出去（干员调配界面的浮动入口靠它决定要不要出现）
        useEffect(() => { tierBus.set(tier); }, [tier]);

        useEffect(() => {
          let alive = true;
          // 名字表就绪后重画（optgroup 标签从 charId 换成干员名），并借这次机会再对一次 op
          void ensureChess().then(() => {
            if (!alive) return;
            setVm((p) => { const op = currentOp(); return op === p.op && p.names ? p : { op, names: names || p.names }; });
          });
          return () => { alive = false; };
        }, []);

        // ★ data-sp-sv-version：把版本号也写到顶栏根上 —— 验收脚本不用打开设置页就能读到
        //   （这也让"用户看到的顶栏"和"服务端清单"可以逐个对账）。
        // ★ data-sp-sv-slot：写清楚这一簇是**左**还是**右**（回退到老宿主时便于对账 / 取证）。
        return html`<div class=${`sp-sv__top sp-sv__top--${where}`} ref=${rootRef} data-sp-sv-tier=${tier}
          data-sp-sv-slot=${where} data-sp-sv-version=${VERSION}>
          ${tier === 'full' || tier === 'skin' ? html`<${SkinSelect} api=${api} cfg=${cfg} skins=${skins} table=${table} names=${vm.names}
            op=${vm.op} display=${displayNameOf(vm.op)} onChanged=${() => { lastOp = vm.op; }} />` : null}
          ${tier === 'icon' || tier === 'micro' ? html`<${IconBar} api=${api} cfg=${cfg} skins=${skins} table=${table}
            names=${vm.names} op=${vm.op} display=${displayNameOf(vm.op)} align=${where} micro=${tier === 'micro'}
            onChanged=${() => { lastOp = vm.op; }} />` : null}
          ${where === 'right' ? html`<${FallbackGear} api=${api} reg=${reg} onOpen=${() => openSettings()} />` : null}
        </div>`;
      });
      log.info?.(`[${MOD_ID}] 顶栏皮肤入口已挂到 ${topbarSlot}（${where === 'left' ? '左簇，紧随官方「返回」' : '右簇（老宿主回退）'}）`);
    } catch (e) {
      log.warn?.(`[${MOD_ID}] 顶栏皮肤入口不可用（插槽 ${topbarSlot} 注册失败？），其余功能照常`, e);
    }
  }

  // ---- 5b) ★★ 0.10.0：自选编队（第三页）**每个槽位**的皮肤选择 -----------------------------------------
  // ★ 服主需求原文：「自选编队的皮肤选择需要在**自选页面进行单独的皮肤选择 UI 适配**。」
  //   为什么顶栏那条不够：它跟随的是「**名单里选中的干员**」（`currentOp()`：`loadoutStore.sel`，取不到再读
  //   宿主名单卡的 `aria-selected`），而**自选编队页没有「名单选中」这个概念** —— 那一页是四个槽位各一名干员，
  //   而且这些干员**按设计不在名单里**（`data/backups.json` 的 `diy.ownedPool` = 「名单外的 6★」+ 原型干员）
  //   ⇒ 顶栏那条永远指不到他们。所以宿主在每个已填充槽位的操作区 `.diy-slot__acts` 里开了插槽
  //   `LOADOUT_DIY_SLOT_ACTIONS`（props = `{ slotId, charId, tier, elite }`），我们往里放一个按**槽位**的控件。
  //   ★ 同一份 cfg / 同一个 skins applier ⇒ 与顶栏那条天然同源，不需要任何同步代码。
  //   ★ 空槽位宿主根本不画操作区（`.diy-slot__fill` 分支）⇒ 我们连挂载都不会发生；
  //     该干员没有可选时装 ⇒ diy.js 画禁用态（详见那里的说明）。
  //   ★ 老宿主没有这个插槽 ⇒ `api.slots.register` **大声抛错**，这里退化成不注册（一行 warn），其余功能照常。
  const diySlot = api.slots.names?.LOADOUT_DIY_SLOT_ACTIONS || SLOT_DIY_ACTIONS;
  try {
    api.slots.register(diySlot, function DiySlotSkinExtension(props) {
      // 闭包注入依赖（hostApi 只能由 setup 拿到）；宿主 props（slotId/charId/tier/elite）展开在最前面，
      // 保证它们**覆盖不了**下面这几个依赖。
      return html`<${DiySlotSkin} ...${props} api=${api} cfg=${cfg} skins=${skins} table=${table} />`;
    });
    log.info?.(`[${MOD_ID}] 已挂上自选编队页的按槽位皮肤控件（插槽 ${diySlot}）`);
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 自选编队的槽位皮肤控件不可用（宿主的 UI 插槽里没有 ${diySlot}？），其余功能照常`, e);
  }

  // ---- 5c) ★★ 0.15.0：**每一个干员自己那一行 / 该干员详情面板**里的控件 --------------------------------
  // ★ 服主需求原文：「侦察是否能将干员皮肤切换的下拉栏移动至潜能/练度调整下拉框右侧，且保持 UI 风格与其统一；
  //   注意手机端可能存在的因为分辨率导致窗口超出可显示范围的问题」+「在潜能/练度调整下拉框右侧新增
  //   可独立配置单干员语音」。
  //   ⇒ 宿主开了插槽（`public/js/ui/extensions.js`），我们只负责往里面放控件：
  //       · `LOADOUT_ROW_ACTIONS`（'loadout.rowActions'）= 一行最右侧那一格，紧跟官方第 4 列「潜能 · 练度」；
  //         **只在 ≥1600px 出现**（宿主 CSS 的条件式第 5 列，断点是量出来的，见 `loadout.css` 那一节的注释）；
  //       · `LOADOUT_DETAIL_VOICE`（'loadout.detailVoice'）= ★★ 0.19.0 新增：详情面板里
  //         **官方「此干员语音」控件的下一行**（`<OperatorVoice>` 是 `.lo-detail__body` 的第一个子节点）；
  //         ★ 这一处**宽屏也画**（详情面板本来就开着）—— 它不再是"窄屏降级"，而是**常驻**落点；
  //       · `LOADOUT_DETAIL_ACTIONS`（'loadout.detailActions'）= 0.15.0 的旧落点（官方「潜能与练度」段之后），
  //         ★ 0.19.0 起**只作老宿主降级**（没有新插槽时才注册到这里）。
  //   ★★ 0.17.0：「在潜能/练度调整下拉框右侧新增可独立配置单干员语音」这一半**已删除**（整条轴交回官方，
  //     见第 1c 步与 `controls.js` 文件头）。
  //   ★★ 0.19.0（工序 72）：服主裁定「顶栏左侧的皮肤控件不用留 …… 把干员时装放在干员独立语音配置下一行」
  //     ⇒ 详情面板那处从"窄屏降级"升为**主落点**，行内那处**一字不动**（服主先前明确要的）。
  //     ★ 两处（含老宿主那一支）用**同一份**配置与**同一个**组件（`controls.js`）⇒ 不需要任何同步代码。
  //     ★ 0.19.0 起详情面板那一处的外壳是 `.sp-sv__vrow`（与官方 `.lo-voice` 同一行体系：
  //       同 gap / 同 padding / 同字号 / 同控件高度），旧外壳 `.sp-sv__detailrow` 只留给老宿主那条支。
  //   ★ 为什么不能由 Mod 自己把控件塞进那一行：`ui/extensions.js` 文件头写明了 —— screens 是 Preact 组件，
  //     塞进去的节点会被下一次渲染冲掉；且 `.lo-card` 是 `display:grid`，多一个子节点就是多一个栅格项。
  //     全库 21 个 Mod 没有一处往官方屏幕注入 DOM。
  //   ★ 老宿主没有这些插槽 ⇒ `api.slots.register` 会**大声抛错**，这里退化成不注册（一行 warn），其余照常。
  const ROW_SLOT = api.slots.names?.LOADOUT_ROW_ACTIONS || 'loadout.rowActions';
  const DETAIL_VOICE_SLOT = api.slots.names?.LOADOUT_DETAIL_VOICE || SLOT_DETAIL_VOICE;
  const DETAIL_SLOT = api.slots.names?.LOADOUT_DETAIL_ACTIONS || SLOT_DETAIL_ACTIONS;
  try {
    api.slots.register(ROW_SLOT, function LoadoutRowSkinVoice(props) {
      // 表头那一格：宿主**也会**渲染这个插槽（`head: true`）。★ 我们必须交出一个**空的** `.lo-arow`
      //   ——不是为了观感，是为了**列对齐**：宿主这一列是条件式第 5 列
      //   （`.lo-list:has(> .lo-list__rows > .lo-card > .lo-arow:not(:empty))` 打开 `--cols` 的第 5 轨），
      //   表头 `.lo-list__head` 与行 `.lo-card` 是两个各自独立的 grid、共用同一个 `--cols`
      //   ⇒ 行里有第 5 格、表头只声明 4 格的话，表头会被 `justify-content:start` 的隐式列推歪。
      //   一个空 span 在 `--cols` 里不产生任何可见像素（`.lo-list__head` 本身 `aria-hidden`）。
      if (props?.head) return html`<span class="lo-arow"></span>`;
      const charId = props?.charId || null;
      if (!charId) return null;
      return html`<${SkinVoiceControls} api=${api} cfg=${cfg} skins=${skins} table=${table}
        charId=${charId} variant="row" />`;
    });
    log.info?.(`[${MOD_ID}] 已挂上按干员的皮肤控件（行插槽 ${ROW_SLOT}）`);
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 行内那一格的皮肤控件不可用（宿主的 UI 插槽里没有 ${ROW_SLOT}？），其余功能照常`, e);
  }
  // 详情面板：**新落点优先**（官方语音的下一行），新插槽不在才退回旧落点（潜能与练度之后）。
  // ★ 两条支只有一条会注册 ⇒ 详情面板里**永远只有一个**皮肤控件（不会"新旧两处各一个"）。
  const detailEntry = hasDetailVoiceSlot ? DETAIL_VOICE_SLOT : DETAIL_SLOT;
  try {
    api.slots.register(detailEntry, function LoadoutDetailSkinVoice(props) {
      const charId = props?.charId || null;
      if (!charId) return null;
      if (hasDetailVoiceSlot) {
        // 新落点：整行（短标签 + 「？」小圈 + 皮肤下拉）由 controls.js 的 SkinDetailRow 交出来。
        return html`<${SkinDetailRow} api=${api} cfg=${cfg} skins=${skins} table=${table} charId=${charId} />`;
      }
      // 老宿主（没有 loadout.detailVoice）：沿用 0.15.0 的外壳与落点（潜能与练度之后）。
      return html`<div class="sp-sv__detailrow" data-sp-sv-detail-row="actions">
        <${SkinVoiceControls} api=${api} cfg=${cfg} skins=${skins} table=${table}
          charId=${charId} variant="detail" />
      </div>`;
    });
    log.info?.(`[${MOD_ID}] 已挂上按干员的皮肤控件（详情面板插槽 ${detailEntry}`
      + `${hasDetailVoiceSlot ? '，官方语音控件的下一行' : '（老宿主：潜能与练度之后）'}）`);
  } catch (e) {
    log.warn?.(`[${MOD_ID}] 详情面板的皮肤控件不可用（宿主的 UI 插槽里没有 ${detailEntry}？），其余功能照常`, e);
  }

  // ---- 6) 配置变化 ⇒ 重算官方表（时装专属语音）-------------------------------------------------------
  // ★ 换时装 / 清掉某个干员的时装 / 导入别人的配置 / 换上游线路，都会走这里；
  //   `sync()` 自己从快照重建 ⇒ 幂等、反复切不漂移（见 officialroute.js 的还原一节）。
  // ★★ 这里**不写任何官方设置**：只改"该放哪个文件"这一层（`data/assets.json` 的内存副本）。
  const officialRouteSync = () => {
    try { officialRoute.sync(); } catch (e) { log.warn?.(`[${MOD_ID}] 同步官方语音表失败`, e); }
  };

  // ---- 7) 启动时套用一次；每次打开调配再套用一次（数据可能后到） -------------------------------------
  reapply();
  officialRouteSync();
  api.loadout.store.subscribe((s, prev) => { if (s.open && !(prev && prev.open)) { reapply(); officialRouteSync(); } });
  // 上游线路变了 ⇒ manifest 里的内容要重算，否则界面还指着旧值
  // ★（曾经还有 battleSkin 一并判断；该开关已按「皮肤和小人必须绑定」的口径删除）
  cfg.subscribe((c, prev) => {
    if (prev && prev.mirror !== c.mirror) reapply();
    // ★★ 皮肤选择变了（行内控件 / 自选编队页按槽位控件 / 随机皮肤 / 导入）⇒ 时装专属语音要跟着换
    if (!prev || prev.skins !== c.skins) officialRouteSync();
  });

  // ---- 8) ★★ 每局开始时随机皮肤（局内那一半）--------------------------------------------------------
  // 「每局开始时随机」开关在「模组设置 → 皮肤」；这里只负责**触发**（幂等，见 battlerandom.js）。
  // ★ 为什么放在第 7 步之后：`cfg.get().randomEachMatch` 的默认是关的，装载时即处于战斗中才会立刻抽一次，
  //   而那次抽签要等 reapply() 建立的 manifest 已经就绪（randomizeAll 内部自己 ensure，也能单独成立）。
  // ★ 拿不到 __SP__.store / selectRoute ⇒ 安静降级（只打一行 warn）。
  // ★★ 真机踩过的坑（已修）：`selectRoute` 在 setup() 里**没有同名局部变量**，必须先把 `routeP` await 到
  //    一个局部常量再往下传。原来第 9 步写的是 `mountFab({ …, selectRoute })` ⇒ 装载时
  //    `ReferenceError: selectRoute is not defined`，整个 Mod 被 extensions.js 跳过（console 里一条 warn）。
  //    现在两处都用 `routeSel`；这条留在这里当"别把它改回自由标识符"的备忘。
  // ★★ 0.16.0：`appStore` / `routeSel` 的求值已**上移到第 3b 步**（注册栏位的 render 闭包要读它们）
  //    ⇒ 这里不再重复声明（`let` 重复声明会直接 SyntaxError，整个 Mod 不装）。
  const offBattleRandom = attachBattleRandomizer({
    cfg, store: appStore, selectRoute: routeSel, randomize: () => skins.randomizeAll(), log,
  });

  // ★ 验收/自查用：Console 里一行就能自己抽一次（不依赖界面），也方便 E2E 断言
  //   `__SP_SKINVOICE__.randomizeNow()` → { n, skipped, changed, before }。
  //   ★ 0.15.0：`voice` / `hostVoice` / `officialVoice` / `dragOrigin` / `prepStats` 五件内省**删除**
  //     （它们指向的模块已经整文件退场）；换成 `officialRoute`（只读：`state()` 报
  //     `{ proxied, hasManifest, extrasReady, overlaid, snapKeys, global, counters }`）。
  try {
    if (globalThis.__SP_SKINVOICE__) {
      globalThis.__SP_SKINVOICE__.randomizeNow = () => skins.randomizeAll();
      globalThis.__SP_SKINVOICE__.skins = skins;
      globalThis.__SP_SKINVOICE__.cfg = cfg;
      globalThis.__SP_SKINVOICE__.officialRoute = officialRoute;
      // ★★ 0.16.0：只读内省 —— 现在在不在局内（验收脚本用它把"设置页那一行画不画"的判据钉在同一份真值上）。
      globalThis.__SP_SKINVOICE__.isInMatch = () => isInMatchNow();
      globalThis.__SP_SKINVOICE__.route = () => routeNow();
      globalThis.__SP_SKINVOICE__.runner = globalThis.__SP_RUNNER__ ?? null;  // 只在 E2E 里用；拿不到就是 null
    }
  } catch { /* 极端环境下 globalThis 只读，忽略 */ }

  // ---- 9) 干员调配界面的浮动入口（★ 更新① 之后战斗内不再有入口）-------------------------------------
  // ★★ 更新①：战斗内的右下角浮动齿轮**已删除**（`inBattle && route === 'game'` 那条）。
  //   新入口 = 左下角官方设置齿轮 → 官方设置弹窗 → `settings.sections` 里的「模组设置」。
  //   `.sp-sv__fab--loadout` 原本解决的是"**顶栏放不下皮肤下拉** ⇒ 玩家在调配界面找不到切换入口"。
  //   ★★ 0.19.0（工序 72）：顶栏**不再有**皮肤下拉（服主裁定），而详情面板（默认展示）与名单行内
  //     各有控件 ⇒ 那个"放不下"的前提消失了：
  //       · 有 `loadout.detailVoice` 的宿主（本树 0.2.3）⇒ **不挂**浮动入口（挂了就是第三个皮肤/设置入口，
  //         与"顶栏只留一个设置入口"的裁定直接冲突，而且 `tierBus` 此时恒为 null ⇒ 它会**一直**显示）；
  //       · 老宿主（没有新插槽，皮肤入口仍在顶栏）⇒ 照旧挂（那是 `tierBus.isDegraded()` 唯一还有意义的场合）。
  log.info?.(`[${MOD_ID}] 战斗内右下角浮动入口已按更新①移除：请用**左下角官方设置齿轮 → 模组设置**`);
  const unmountFab = hasDetailVoiceSlot
    ? () => {}
    : await mountFab({ api, cfg, html, log, openSettings, selectRoute: routeSel, requireRoute: false });

  // 卸载（extensions.js 会调）
  return () => {
    try { offBattleRandom(); } catch { /* ignore */ }
    try { offImgFallback(); } catch { /* ignore */ }
    // ★★ 0.16.0：摘掉"进出局通知栏位重画"的订阅与监听表（不摘的话停用本 Mod 后宿主 store 上还挂着闭包）。
    try { offRouteRepaint(); } catch { /* ignore */ }
    try { matchListeners.clear(); } catch { /* ignore */ }
    // ★★ 0.15.0：把官方语音表**还原**成我们动手前的样子（逐键重建）。
    //   这就是"停用本 Mod 之后官方逐值回到不装的状态"那条验收的全部实现。
    //   ★ 0.17.0：`dispose()` 里不再有"摘代理"这一步（那条轴已删除 ⇒ 我们从不挂任何官方实例属性）。
    try { officialRoute.dispose(); } catch { /* ignore */ }
    try { disposeSection?.(); } catch { /* ignore */ }
    try { fallback?.dispose(); } catch { /* ignore */ }
    try { unmountFab?.(); } catch { /* ignore */ }
    log.info?.(`[${MOD_ID}] 已卸载`);
  };
}

/**
 * 顶栏齿轮 —— **只在没装「模组设置」时**出现。
 * ★ 装了 `cyanfish.mod-settings` 时，它自己的齿轮就在同一个插槽里（插槽支持多个 Mod 共存），
 *   再来一个就是两个一模一样的齿轮 ⇒ 这里用注册表的 `host` 做开关，并订阅变化（加载顺序无关）。
 */
function FallbackGear({ api, reg, onOpen }) {
  const { html, Button, hooks: { useState, useEffect } } = api.ui;
  const [hosted, setHosted] = useState(() => !!reg?.host);
  useEffect(() => {
    if (typeof reg?.subscribe !== 'function') return () => {};
    return reg.subscribe(() => setHosted(!!reg.host));
  }, []);
  if (hosted) return null;
  return html`<${Button} variant="secondary" size="sm" class="sp-sv__gear"
    title="皮肤与语音设置" aria-label="皮肤与语音设置"
    onClick=${() => onOpen?.()}>${iconVNode(html, 'gear')}<//>`;
}

/**
 * 把**干员调配界面**的浮动入口渲染进挂在 <body> 的独立容器 —— 它在宿主 Preact root 之外，
 * 所以宿主的任何重渲染都擦不掉它。出现条件：调配界面开着 + 顶栏档位已经把皮肤下拉挤掉（v0.9.1 起）。
 *
 * ★★ 更新①（2026-10-08 服主口径「mod-setting 应与官方游戏内设置（左下角）使用同一入口，而非右下角入口」）：
 *   **战斗内那条（`inBattle && selectRoute(...) === 'game'` ⇒ 右下角 `.sp-sv__fab`）整条删除**，
 *   连同它的两个判断（`inBattle` 配置、路由）——现在函数里**根本没有路由分支**，
 *   战斗内改走「左下角官方设置齿轮 → 官方设置弹窗 → 模组设置 → 皮肤与语音」。
 *   ★ 同一个函数里的 `--loadout` 入口**保留**（位置是顶栏左侧，与"右下角"无关，
 *     解决的是"窄屏顶栏放不下皮肤下拉 ⇒ 玩家找不到切换入口"，删掉就是功能倒退）。
 *   ★ 因此本函数不再需要 `selectRoute` / `__SP__.store`：只依赖 vendor preact + loadout store + cfg + tierBus。
 *     （`appStore` 保留为可选订阅源，仅为"宿主 store 变了也重算一次"的余量，拿不到也不影响。）
 *
 * 拿不到 vendor preact ⇒ 直接返回空卸载函数（静默降级，其余功能照常）。
 * @param {{ api:any, cfg:any, html:any, log:object, openSettings:Function,
 *           selectRoute?:Function|null, appStore?:any|null, requireRoute?:boolean }} deps
 *   selectRoute / requireRoute 只作兼容保留：更新① 之后**没有调用方再传 true**，传了也只是多等一次路由。
 */
async function mountFab({ api, cfg, html, log, openSettings, selectRoute = null, appStore = null, requireRoute = false }) {
  let preact = null;
  try { preact = await import('/vendor/preact.module.js'); } catch { /* 降级 */ }
  if (appStore === null) { try { appStore = globalThis.__SP__?.store ?? null; } catch { /* ignore */ } }
  if (selectRoute === null) { try { selectRoute = (await import('/js/store.js')).selectRoute; } catch { /* 降级 */ } }

  const needRoute = !!requireRoute; // ⚠ 更新① 之后没有调用方传 true（保留形参以免旧调用点报错）
  if (!preact || (needRoute && (!appStore || typeof selectRoute !== 'function'))) {
    log.warn?.(`[${MOD_ID}] 干员调配界面的浮动入口不可用`
      + `（缺 ${needRoute ? '__SP__.store / selectRoute / ' : ''}vendor preact），其余功能照常`);
    return () => {};
  }

  const host = document.createElement('div');
  host.id = `sp-mod-${MOD_ID}-fab`;
  document.body.appendChild(host);

  const { useState, useEffect } = api.ui.hooks;
  // ★ v0.9.1：干员调配界面打开着、且顶栏档位已经把皮肤下拉挤掉了 ⇒ 补一个浮动入口
  const loadoutDegraded = () => {
    try { return !!api.loadout.store.get().open && tierBus.isDegraded(); } catch { return false; }
  };

  function Fab() {
    const [show, setShow] = useState(false);
    useEffect(() => {
      const sync = () => {
        try {
          // ★★ 0.15.0：这里原来还有一条 battle = cfg.get().inBattle && inBattleRoute()
          //    （战斗内右下角浮动入口的显示条件）。那条入口与 inBattle 配置键都已删除
          //    （见 config.js 的"删掉的键"）⇒ 留着它只会读到一个恒 undefined 的死键；
          //    连带 inBattleRoute() 这个只被它调用的函数也一起删了。
          //    现在只剩一条：调配界面开着 + 顶栏档位已经把皮肤下拉挤掉 ⇒ 补一个浮动入口。
          setShow(loadoutDegraded());
        } catch { /* ignore */ }
      };
      sync();
      let un1 = () => {};
      try { un1 = appStore?.subscribe?.(sync) || (() => {}); } catch { /* ignore */ }
      const un2 = cfg.subscribe(sync);
      let un3 = () => {};
      try { un3 = api.loadout.store.subscribe(sync) || (() => {}); } catch { /* ignore */ }
      const un4 = tierBus.subscribe(sync);
      return () => {
        try { un1?.(); } catch { /* ignore */ }
        try { un2?.(); } catch { /* ignore */ }
        try { un3?.(); } catch { /* ignore */ }
        try { un4?.(); } catch { /* ignore */ }
      };
    }, []);
    if (!show) return null;
    return html`<button type="button" class="sp-sv__fab sp-sv__fab--loadout"
      title="皮肤与语音（顶栏放不下，这里是完整入口）"
      onClick=${() => openSettings('skinvoice')}>
      ${iconVNode(html, 'gear')}<span>皮肤与语音</span></button>`;
  }

  preact.render(html`<${Fab} />`, host);
  return () => { try { preact.render(null, host); } catch { /* ignore */ } host.remove(); };
}
