// 「模组设置」共享注册表 —— 跨 Mod 的唯一联动通道。
//
// ★★ 这份文件在**每个想联动设置页的 Mod 里各放一份，且必须逐字节相同**
//    （发布流程会做 byte-for-byte 校验，防两份漂移）。
//
// 为什么是"各放一份"而不是"从设置 Mod 里 import"：
//   1. 宿主**没有 Mod 依赖概念**：`extensions.js` 只按 `/mods` 的顺序 `import()` 每个有 `client` 字段的
//      Mod，谁都不知道别人在不在，也不能声明 `requires`。设置 Mod 被停用时，从它那里 import 会 404。
//   2. 设置页的"分栏"不能靠宿主插槽表达：宿主 0.2.1 起虽然有了 `UI_SLOTS.SETTINGS_SECTIONS`
//      （官方设置弹窗里的一个落点，见 public/js/ui/extensions.js），但插槽只能回答"把东西画在哪"，
//      回答不了"有哪些栏位、谁登记过、当前在哪一栏"——注册表仍然必须是 Mod 自己的一份。
//   3. 所以走 `globalThis` 上一份**幂等引导**：谁先跑谁建（`||=` 在单线程里是原子的），
//      后跑的那个拿到**同一个对象**。加载顺序无关，停用任意一个都不影响另一个。
//
// 契约（apiVersion 1）：
//   sections[]  { id, title, order?, micro?, render(props) -> vnode }
//               · 设置 Mod 按 (order, 注册顺序) 排栏位；`render` 是**组件函数**，由设置 Mod 渲染。
//   register(s)      注册一个栏位，返回 dispose。
//   subscribe(fn)    栏位/宿主变化时回调（`fn(sections)`）；返回 unsubscribe。
//   host             设置 Mod 挂载时置位的句柄 `{ open(sectionId?), close() }`；为 null = 没装设置 Mod。
//   setHost(h)       由设置 Mod 调用。
//   focusKey         最近一次"点名要开哪一栏"（`requestSection()` 写入；初始 null）
//   requestSection(id)  ★ 任何 Mod 都可以点名：把焦点广播给**当前正在画这一页的那个宿主**
//                    （独立面板 SettingsPanel / 官方设置弹窗里的同一份面板都会收到）。
//                    ★ 为什么还需要它：更新① 之后 `host.open()` 打开的不再是设置 Mod 自己的弹窗，
//                    而是**官方设置弹窗**——那个弹窗由宿主控制，Mod 无法替它"点开第 N 栏"，
//                    所以改成"把意图挂在注册表上，由正在画的实例自己切栏"。
//   onFocus(fn)      订阅点名（`fn(id)`；注册时立即以当前 focusKey 回调一次）；返回 unsubscribe。

export const SETTINGS_KEY = '__SP_MODSETTINGS__';
export const SETTINGS_API = 1;

/**
 * 给一个**已有的**注册表补上 `focusKey` / `requestSection` / `onFocus`（更新① 的点名通道）。
 *
 * ★★ 为什么需要"补"而不是"重建"：`SETTINGS_API` 仍是 1（这次的三个成员是**纯新增**，老调用方无感），
 *    所以 `settingsRegistry()` 会直接把 globalThis 上那个对象还回去 —— 而它可能是**别的 Mod 里那份更老的
 *    registry.js 引导出来的**。真机实测踩过：`cyanfish.announce` 自带一份落后的 registry.js（它的引导
 *    是更早的版本，没有点名通道），它在加载顺序里靠前 ⇒ 先建对象；随后 `cyanfish.mod-settings` 拿到的
 *    就是这个"缺成员"的对象 ⇒ 官方设置弹窗里的模组设置一渲染就
 *    `TypeError: reg.onFocus is not a function`，整帧被宿主的错误边界接住（面板打不开）。
 *    ⇒ 这里就地补齐缺的成员（自己一份 `focusSubs`，与本地新建那份语义完全一致）。
 *    ★ 为什么不直接把 announce 的那份 registry.js 也改成逐字节相同：那是另一个 Mod 的文件，
 *      这份契约允许它暂时落后；**自愈**让"任何一个联动方落后"都不再致命（顺序无关这条承诺要成立）。
 * @param {any} reg
 */
function healFocusApi(reg) {
  if (!reg || typeof reg !== 'object') return reg;
  if (typeof reg.requestSection === 'function' && typeof reg.onFocus === 'function') return reg;
  const focusSubs = new Set();
  if (typeof reg.focusKey === 'undefined') {
    try { reg.focusKey = null; } catch { /* 冻结对象：当作没有这个字段，下面靠闭包 */ }
  }
  if (typeof reg.requestSection !== 'function') {
    reg.requestSection = function requestSection(id) {
      if (typeof id !== 'string' || !id) return;
      try { reg.focusKey = id; } catch { /* ignore */ }
      for (const fn of [...focusSubs]) { try { fn(id); } catch { /* ignore */ } }
    };
  }
  if (typeof reg.onFocus !== 'function') {
    reg.onFocus = function onFocus(fn) {
      if (typeof fn !== 'function') return () => {};
      focusSubs.add(fn);
      try { fn(reg.focusKey ?? null); } catch { /* ignore */ }
      return () => focusSubs.delete(fn);
    };
  }
  return reg;
}

/**
 * 取（必要时创建）共享注册表。**任何 Mod 都可以在任何时刻调它**，不需要谁的许可。
 * @returns {{ apiVersion:number, sections:Array<any>, host:any, focusKey:string|null, register:Function, subscribe:Function, setHost:Function, requestSection:Function, onFocus:Function }}
 */
export function settingsRegistry() {
  const g = globalThis;
  const cur = g[SETTINGS_KEY];
  if (cur && cur.apiVersion === SETTINGS_API && Array.isArray(cur.sections)) return healFocusApi(cur);

  const sections = [];
  const subs = new Set();
  const emit = () => {
    const snapshot = sections.slice();
    for (const fn of [...subs]) { try { fn(snapshot); } catch { /* 一个订阅者坏掉不影响别人 */ } }
  };

  // ★ 点名通道（更新① 之后"打开模组设置"= 打开官方设置弹窗，Mod 只能把"要看哪一栏"寄存在这里）。
  const focusSubs = new Set();
  const emitFocus = (id) => {
    for (const fn of [...focusSubs]) { try { fn(id); } catch { /* 同上 */ } }
  };

  const reg = {
    apiVersion: SETTINGS_API,
    sections,
    host: null,
    /**
     * 注册一个设置栏位。
     * @param {{ id:string, title:string, order?:number, micro?:string, render:Function }} section
     * @returns {() => void} dispose
     */
    register(section) {
      if (!section || typeof section.id !== 'string' || !section.id) throw new Error('settings.register: 需要非空 id');
      if (typeof section.render !== 'function') throw new Error('settings.register: 需要 render 函数');
      const entry = {
        id: section.id,
        title: String(section.title || section.id),
        micro: section.micro ? String(section.micro) : '',
        order: Number.isFinite(section.order) ? section.order : 0,
        render: section.render,
      };
      const at = sections.findIndex((s) => s.id === entry.id);
      if (at >= 0) sections[at] = entry; else sections.push(entry);
      sections.sort((a, b) => a.order - b.order);
      emit();
      return () => {
        const i = sections.findIndex((s) => s.id === entry.id);
        if (i < 0) return;
        sections.splice(i, 1);
        emit();
      };
    },
    /** 订阅"栏位列表 / 宿主 变化"。返回 unsubscribe。 */
    subscribe(fn) {
      if (typeof fn !== 'function') return () => {};
      subs.add(fn);
      try { fn(sections.slice()); } catch { /* ignore */ }
      return () => subs.delete(fn);
    },
    /** 设置 Mod 挂载后调用：`host = { open(sectionId?), close() }`。 */
    setHost(host) {
      reg.host = host && typeof host === 'object' ? host : null;
      emit();
    },
    /** 最近一次点名要开的栏位（`requestSection()` 写入）。 */
    focusKey: null,
    /** 点名要看哪一栏（见文件头契约；正在画这一页的实例会切过去）。 */
    requestSection(id) {
      if (typeof id !== 'string' || !id) return;
      reg.focusKey = id;
      emitFocus(id);
    },
    /** 订阅点名；注册时立即以当前 focusKey 回调一次。 */
    onFocus(fn) {
      if (typeof fn !== 'function') return () => {};
      focusSubs.add(fn);
      try { fn(reg.focusKey); } catch { /* ignore */ }
      return () => focusSubs.delete(fn);
    },
    /** @internal 让设置 Mod 主动广播一次（例如面板开合状态变了）。 */
    _emit: emit,
  };
  g[SETTINGS_KEY] = reg;
  return reg;
}
