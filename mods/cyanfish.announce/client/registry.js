// 「模组设置」共享注册表 —— 跨 Mod 的唯一联动通道。
//
// ★★ 这份文件在**每个想联动设置页的 Mod 里各放一份，且必须逐字节相同**
//    （`<开发期脚本>/verify_skinvoice.mjs` 会 byte-for-byte 断言两份一致，防漂移）。
//
// 为什么是"各放一份"而不是"从设置 Mod 里 import"：
//   1. 宿主**没有 Mod 依赖概念**：`extensions.js` 只按 `/mods` 的顺序 `import()` 每个有 `client` 字段的
//      Mod，谁都不知道别人在不在，也不能声明 `requires`。设置 Mod 被停用时，从它那里 import 会 404。
//   2. 宿主**也没有多余的插槽**（`UI_SLOTS` 只有 `loadout.topbar`）——设置页的"分栏"必须由 Mod 自己造。
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

export const SETTINGS_KEY = '__SP_MODSETTINGS__';
export const SETTINGS_API = 1;

/**
 * 取（必要时创建）共享注册表。**任何 Mod 都可以在任何时刻调它**，不需要谁的许可。
 * @returns {{ apiVersion:number, sections:Array<any>, host:any, register:Function, subscribe:Function, setHost:Function }}
 */
export function settingsRegistry() {
  const g = globalThis;
  const cur = g[SETTINGS_KEY];
  if (cur && cur.apiVersion === SETTINGS_API && Array.isArray(cur.sections)) return cur;

  const sections = [];
  const subs = new Set();
  const emit = () => {
    const snapshot = sections.slice();
    for (const fn of [...subs]) { try { fn(snapshot); } catch { /* 一个订阅者坏掉不影响别人 */ } }
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
    /** @internal 让设置 Mod 主动广播一次（例如面板开合状态变了）。 */
    _emit: emit,
  };
  g[SETTINGS_KEY] = reg;
  return reg;
}
