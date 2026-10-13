// mods/cyanfish.skinvoice/client/battlerandom.js — 更新②的**局内那一半**：「每局开始时随机」。
//
// ★★ 服主口径（工作区 `网页端bug清单v1.1.txt` 更新②，2026-10-08 补充确认）：
//   「skin-voice 可在 mod-setting 页面新增一个『为所有干员使用随机皮肤』的选项，包含**局外立刻为所有干员
//     改为随机皮肤的按钮**，和**局内每局为干员使用随机皮肤的开关**」+「随机范围是**只在该干员已有的时装里抽**」。
//   局外那一半（按钮）在 section.js；这里只做"每局开始时再随机一遍"。
//
// ★ 触发点怎么挑的（**幂等**是硬要求：同一个触发点不能重复随机）：
//   · 用 `globalThis.__SP__.store`（宿主 main.js 挂的应用 store，extensions.js 的 hostApi 拿不到它）
//     + `/js/store.js` 的 `selectRoute`，只看一件事：**路由进入 `'game'`**。
//   · 幂等靠 `armed` 布尔量：进入 game 时若 `armed` 为真才随机，随即置 false；**离开 game 时才置回 true**。
//     ⇒ 同一局里 store 再怎么变（回合推进、阶段切换、观战切人）都不会重复随机；
//       回到大厅再开一局（路由离场过一次）才会重新随机。这就是"每局开始时随机一遍"最朴素也最稳的定义。
//   · 为什么不用 `selectRoute` 之外的信号：宿主没有暴露 matchId；`battleRunner` 的 ready 事件在
//     重连/换层时会重放。路由"离场再入场"是唯一与"新的一局"一一对应的、且不依赖内幕的信号。
//   · 拿不到 `__SP__.store` / `selectRoute` ⇒ 整块静默降级（只在装载时打一行 warn），其余功能照常。
//
// ★ 随机结果写进**现有存储**（`sp.pref.skinvoice` 的 `skins` 映射，按玩家、按干员），
//   不动格式、不动"皮肤 ↔ 战斗小人"的绑定：随机只改"选了哪套"，套用仍然走 skins.js 的 applyAll。
//   本次随机的干员 id 记在 `randomKeys`（新增字段，向后兼容，见 config.js），只为了界面上显示"当前是随机的"。

/**
 * 建立"每局开始随机"的监听。
 * @param {{
 *   cfg: any,                       // createConfig() 的配置对象（读 randomEachMatch、写 skins/randomKeys）
 *   store: any|null,                // __SP__.store（null = 拿不到 ⇒ 不监听）
 *   selectRoute: Function|null,     // /js/store.js 的 selectRoute
 *   randomize: () => Promise<any>,  // 执行一次随机（skins.randomizeAll）
 *   log?: object,
 * }} deps
 * @returns {() => void} 卸载
 */
export function attachBattleRandomizer({ cfg, store, selectRoute, randomize, log = console }) {
  if (!store || typeof store.subscribe !== 'function' || typeof selectRoute !== 'function') {
    log.warn?.('[cyanfish.skinvoice] 拿不到 __SP__.store / selectRoute：「每局开始时随机」不可用（其余照常）');
    return () => {};
  }

  /** 这一局还没随过（进入 game 时消费掉）。 */
  let armed = true;
  let lastRoute = null;
  let busy = false;

  const sync = () => {
    let route = null;
    try { route = selectRoute(store.get()); } catch { return; }
    if (route === lastRoute) return;
    const was = lastRoute;
    lastRoute = route;
    if (route === 'game' && was !== 'game') {
      if (!armed) return;                       // 同一局内重复入场（理论上不会）：不重复随机
      armed = false;
      if (!cfg.get().randomEachMatch) return;   // 开关关着：只消费掉这次机会，不做任何写入
      if (busy) return;
      busy = true;
      void Promise.resolve()
        .then(() => randomize())
        .catch((e) => log.warn?.('[cyanfish.skinvoice] 每局随机皮肤失败', e))
        .finally(() => { busy = false; });
      return;
    }
    if (route !== 'game') armed = true;         // 离场 ⇒ 下一场再随机
  };

  sync();                                        // 装载时就在战斗里（刷新页面 / 重连）也算这一局的开始
  const off = store.subscribe(() => sync());
  log.info?.('[cyanfish.skinvoice] 每局开始随机皮肤：已接上路由（进入战场时触发一次，幂等）');
  return () => { try { off?.(); } catch { /* ignore */ } };
}
