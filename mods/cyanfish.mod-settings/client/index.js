// mods/cyanfish.mod-settings/client/index.js — 「模组设置」：给全服所有 Mod 共用的一页设置。
//
// ★ 用户口径（2026-10-08）：
//   「设置页面内容过于繁琐。我希望将设置页面独立为一个『模组设置』的 mod，其他 mod 通过联动该 mod
//     实现修改对应参数，例如 skinvoice mod 仅单独列一个『皮肤与语音』的栏位」。
//
// ★ 它做什么：提供一个**空壳** —— 一个两栏设置面板（左竖排栏位 / 右内容，内嵌到官方设置弹窗时折成横排），
//   栏位由**别的 Mod 自己注册**（`client/registry.js` 的 `settingsRegistry().register({…})`）。
//   本 Mod 一行业务代码都没有，只有外壳。
//
// ★★ 更新①（2026-10-08 服主口径「mod-setting 应与官方游戏内设置（左下角）使用同一入口，而非右下角入口」）：
//   同一份面板组件现在挂在**两个宿主**上（`SettingsPanel` 的 embedded 开关）：
//     ① 官方游戏内设置弹窗 —— 宿主 `UI_SLOTS.SETTINGS_SECTIONS`（public/js/ui/extensions.js /
//        public/js/ui/settings.js 的 SettingsModal，左下角 `.gm__gear` 打开）。这是**主入口**。
//     ② 本 Mod 自己的独立弹窗 —— 保留：顶栏齿轮（loadout.topbar）与别的 Mod 的 `host.open()`
//        兜底路径都还走它，停用/异常时参数仍然改得到。
//   ★ 跨 Mod 的"点名看哪一栏"（`reg.requestSection`）落在注册表上，见 registry.js 契约。
//
// ★ 为什么是 globalThis 注册表而不是宿主插槽：见 `client/registry.js` 文件头（宿主既没有 Mod 依赖概念，
//   也没有多余的 UI 插槽）。这份 registry.js 在每个联动方各放一份**逐字节相同**的引导。
//
// ★ 性质：**纯界面 Mod**。没有 data/ 补丁、没有 content/、不动 public/**、不 import 任何宿主内部模块。
//   依赖面只有两条：hostApi 的 ui/slots（正式契约）；`/vendor/preact.module.js` 的 render
//   （把面板渲染进挂在 <body> 的独立容器，同源同 URL ⇒ 与宿主共用同一个 Preact 实例）。
//   拿不到 vendor preact ⇒ 面板不可用，注册表照常工作（只是没人画出来），其余 Mod 不受影响。

import { settingsRegistry, SETTINGS_API } from './registry.js';
import { installStyle } from './style.js';

const MOD_ID = 'cyanfish.mod-settings';
/** 面板的挂载点 id（与 skinvoice 的 `sp-mod-…-settings` 区分开）。 */
const HOST_ID = `sp-mod-${MOD_ID}`;

/** 齿轮图标（自绘：本 Mod 不 import 别的 Mod 的 icons.js）。 */
function gearIcon(html) {
  return html`<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"
    stroke-linecap="round" aria-hidden="true">
    <circle cx="12" cy="12" r="3.1" />
    <path d="M12 2.9v2.3M12 18.8v2.3M4.7 4.7l1.6 1.6M17.7 17.7l1.6 1.6M2.9 12h2.3M18.8 12h2.3M4.7 19.3l1.6-1.6M17.7 6.3l1.6-1.6" />
  </svg>`;
}

/**
 * 面板组件。`sections` 里每项来自别的 Mod 的 `register()`；`render` 是**零参组件函数**
 * （注册方在闭包里带上自己的依赖，见 registry.js 的契约）。
 *
 * ★★ 更新①（2026-10-08 服主口径）之后有**两个宿主**，同一份组件、同一份栏位：
 *   1. `embedded` 为真 —— 画在**官方游戏内设置弹窗**里（宿主 `UI_SLOTS.SETTINGS_SECTIONS`，
 *      也就是左下角那个齿轮打开的 `ui/settings.js` SettingsModal）。此时不自己套 Modal
 *      （否则弹窗里再套一个弹窗），只画「横排栏位 + 当前栏内容」。
 *   2. `embedded` 为假 —— 原来的独立弹窗（顶栏齿轮 / 别的 Mod 的 `host.open()` 的兜底路径）。
 * @param {{ api:any, sections:Array<any>, want?:string|null, embedded?:boolean,
 *           focusKey?:string|null, onFocusRequest?:Function, onClose?:Function }} props
 */
function SettingsPanel({ api, sections, want, embedded = false, focusKey = null, onFocusRequest, onClose }) {
  const { html, Modal, Button, hooks: { useState, useEffect } } = api.ui;
  const [active, setActive] = useState(() => want || sections[0]?.id || null);

  // 外面点名要开哪一栏（独立弹窗用 want；两个宿主都用 focusKey —— 见 registry.js 的 requestSection）
  useEffect(() => { if (want) setActive(want); }, [want]);
  useEffect(() => { if (focusKey) setActive(focusKey); }, [focusKey]);
  // 点名的那一栏被卸载了 / 第一次拿到栏位列表 ⇒ 退到第一栏
  useEffect(() => {
    if (!sections.length) { if (active != null) setActive(null); return; }
    if (!sections.some((s) => s.id === active)) setActive(sections[0].id);
  }, [sections, active]);

  const cur = sections.find((s) => s.id === active) || null;
  const Body = cur ? cur.render : null;

  /**
   * ★ 只有**画在官方弹窗里**的那一份才把点击广播出去：它和宿主弹窗是同一条命，
   *   点一下就等于"外部点名要看这一栏"；独立弹窗里的点击只改自己的状态（否则会去抢官方弹窗的焦点）。
   */
  const pick = (id) => { setActive(id); if (embedded) { try { onFocusRequest?.(id); } catch { /* ignore */ } } };

  const list = html`<nav class="sp-ms__nav" role="tablist">
    ${sections.map((s) => html`<button key=${s.id} type="button" role="tab"
      aria-selected=${s.id === active ? 'true' : 'false'} data-section=${s.id}
      class=${`sp-ms__tab${s.id === active ? ' is-active' : ''}`} onClick=${() => pick(s.id)}>
      <span>${s.title}</span>${s.micro ? html`<span class="sp-ms__tabmicro">${s.micro}</span>` : null}
    </button>`)}
  </nav>
  <div class="sp-ms__panel set-list sp-ms__pane" data-active-section=${active || ''}>
    ${Body ? html`<${Body} key=${active} />` : html`<p class="sp-ms__empty">暂无模组设置项。</p>`}
  </div>`;

  // ★ 内嵌形态：没有 Modal、没有 9rem 固定宽 —— 宽度由宿主弹窗的内容列决定（见 style.js 的 --embed）。
  if (embedded) {
    return html`<div class="sp-ms__embed" data-sp-ms-embed="1">
      <div class="sp-ms__box sp-ms__box--embed">${list}</div>
    </div>`;
  }

  // ★ 故意**不传 micro**：用户口径是「英文 eyebrow / 副标题一律清掉，小字说明影响观感」。
  // ★★ 宽度 9rem（不是 7.4rem）：宿主 .set-row 的左标签列固定 3.3rem，分段控件（.set-seg）
  //    跨剩余两列；面板一窄，**三档**分段控件（声道模式 / 素材上游）就会溢出被裁到点不到
  //    （实测 7.4rem 时只有 113.5px 可用、三档按钮合计 180px）。9rem 让 ≥1180px 的桌面一行放下，
  //    更窄由 style.js 的 `flex-wrap` 兜底（换行而不是裁掉）。
  return html`<${Modal} open=${true} onClose=${onClose} title="模组设置" width="9rem"
    class="sp-ms__modal"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>完成<//>`}>
    <div class="sp-ms__box">${list}</div>
  <//>`;
}

/**
 * 把面板渲染进挂在 <body> 的独立 Preact 根（拿不到 vendor preact 就返回一个不可用的句柄）。
 * ★ 为什么不用宿主插槽直接渲染 Modal：插槽在 .lo 覆盖层内部，Modal 会被它的层叠上下文夹住；
 *   宿主可用的构建里也没有 createPortal（规范 §6.4-2），所以照 skinvoice 验证过的老办法做。
 */
async function mountPanel({ api, reg, log }) {
  let preact = null;
  try { preact = await import('/vendor/preact.module.js'); } catch { /* 降级 */ }
  const usable = !!(preact && typeof preact.render === 'function');
  if (!usable) log.warn?.(`[${MOD_ID}] 面板不可用（拿不到 vendor preact），注册表照常工作`);

  let host = null;
  if (usable) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }

  let open = false;
  let want = null;
  let sections = reg.sections.slice();
  const html = api.ui.html;

  const draw = () => {
    if (!usable) return;
    try {
      preact.render(open
        ? html`<${SettingsPanel} api=${api} sections=${sections} want=${want}
            onClose=${() => { open = false; want = null; draw(); }} />`
        : null, host);
    } catch (e) { log.warn?.(`[${MOD_ID}] 渲染面板失败`, e); }
  };

  const off = reg.subscribe((list) => { sections = list; draw(); });

  return {
    available: usable,
    /** 打开面板（可点名先看哪一栏）。 */
    open(sectionId) {
      if (sectionId) reg.requestSection(sectionId); // ★ 两个宿主（官方弹窗里的那份 / 这份）都要知道
      if (!usable) { api.ui.toast('模组设置面板不可用', 'warn'); return; }
      want = sectionId || null; open = true; draw();
    },
    close() { open = false; want = null; draw(); },
    dispose() { try { off(); } catch { /* ignore */ } if (usable) { try { preact.render(null, host); } catch { /* ignore */ } host.remove(); } },
  };
}

/**
 * Mod 入口（`extensions.js` 会 await；抛错 = 该 Mod 被跳过，其余 Mod 不受影响）。
 * @param {any} api hostApi
 */
export default async function setup(api) {
  installStyle();
  const log = api.log || console;
  const html = api.ui.html;
  const reg = settingsRegistry();

  // ★ 只在"没人建过 / 版本不符"时出声：多份 registry.js 共存时，后到的那个拿到的是同一个对象。
  if (reg.apiVersion !== SETTINGS_API) log.warn?.(`[${MOD_ID}] 注册表版本 ${reg.apiVersion} ≠ ${SETTINGS_API}`);
  log.info?.(`[${MOD_ID}] 设置注册表就绪（当前 ${reg.sections.length} 个栏位）`);

  const panel = await mountPanel({ api, reg, log });
  // ★ 别的 Mod（如 skinvoice 的局内浮动入口）用 host.open(sectionId) 打开这一页
  reg.setHost({ open: panel.open, close: panel.close, available: panel.available });

  // 顶栏齿轮 —— 复用宿主 Button 的观感（只有图标，与游戏内设置按钮同款）
  const disposeGear = api.slots.register(api.slots.names.LOADOUT_TOPBAR || 'loadout.topbar', function ModSettingsGear() {
    const { Button } = api.ui;
    return html`<${Button} variant="secondary" size="sm" class="sp-ms__gear"
      title="模组设置" aria-label="模组设置" onClick=${() => panel.open()}>${gearIcon(html)}<//>`;
  });

  // ---- 更新①：同一份面板也挂进**官方游戏内设置弹窗**（左下角齿轮，宿主 UI_SLOTS.SETTINGS_SECTIONS）------
  // ★★ 服主口径（2026-10-08）：「mod-setting 应与官方游戏内设置（左下角）使用同一入口，而非右下角入口」。
  //   ⇒ 战斗中不再有本 Mod 自己的浮动入口：左下角官方齿轮 → 官方设置弹窗 → 里面这一块就是「模组设置」。
  //   ★ 组件里订阅注册表（栏位是别的 Mod 陆续注册进来的，注册表一 emit 就重画），并在卸载时退订。
  //   ★ 桩位名走 UI_SLOTS 常量；老宿主（没有这个插槽）register 会**大声抛错** ⇒ 这里退化成不注册，
  //     顶栏齿轮那条老路径照常可用（向后兼容优先于响亮失败）。
  let disposeSection = () => {};
  const sectionSlot = api.slots.names?.SETTINGS_SECTIONS || 'settings.sections';
  try {
    disposeSection = api.slots.register(sectionSlot, function ModSettingsEmbedded() {
      const { useState, useEffect } = api.ui.hooks;
      const [sections, setSections] = useState(() => reg.sections.slice());
      const [focusKey, setFocusKey] = useState(() => reg.focusKey ?? null);
      useEffect(() => {
        const offList = reg.subscribe((list) => setSections(list));
        // ★ 防御：注册表可能来自**别的 Mod 里一份更老的 registry.js**（真机踩过：cyanfish.announce）。
        //   registry.js 的 settingsRegistry() 会就地补上点名通道，但这里再挡一层 ——
        //   一个 Mod 的落后版本不该让官方设置弹窗整帧崩掉（宿主的错误边界会接住它）。
        let offFocus = () => {};
        if (typeof reg.onFocus === 'function') offFocus = reg.onFocus((id) => { if (id) setFocusKey(id); });
        else log.warn?.(`[${MOD_ID}] 注册表没有 onFocus（有 Mod 带了落后的 registry.js）：`
          + '「点名打开某一栏」不可用，面板本体照常');
        return () => { try { offList?.(); } catch { /* ignore */ } try { offFocus?.(); } catch { /* ignore */ } };
      }, []);
      return html`<${SettingsPanel} api=${api} sections=${sections} embedded=${true} focusKey=${focusKey}
        onFocusRequest=${(id) => { if (typeof reg.requestSection === 'function') reg.requestSection(id); }} />`;
    });
  } catch (e) {
    disposeSection = () => {};
    log.warn?.(`[${MOD_ID}] 宿主没有 ${sectionSlot} 插槽（旧版本？）：官方设置页入口不可用，顶栏齿轮照常`, e);
  }

  return () => {
    try { reg.setHost(null); } catch { /* ignore */ }
    try { disposeGear(); } catch { /* ignore */ }
    try { disposeSection(); } catch { /* ignore */ }
    try { panel.dispose(); } catch { /* ignore */ }
    log.info?.(`[${MOD_ID}] 已卸载`);
  };
}
