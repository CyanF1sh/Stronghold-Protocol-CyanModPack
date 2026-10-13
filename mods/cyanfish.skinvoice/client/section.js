// mods/cyanfish.skinvoice/client/section.js — 本 Mod 在「模组设置」里注册的那一栏（**皮肤**）。
//
// ★★ 0.15.0（工序 48）：这一栏原来叫「皮肤与语音」，现在**只剩皮肤**。语音那一整组七项
//   （语种 / 语音总开关 / 官方语音 / 播放间隔 / 声道模式 / 同时播放上限 / 语音音量）**全部删除**，理由：
//     · 服主口径「**移除我们干员语音相关的整体功能，转用官方的干员语音**」+「**设置页面的语音相关设置也应取消**」；
//     · 服主口径「这一更新也推翻了装载该 mod 时自动静音官方语音的说法 ⇒ 该 mod 现在**不应更改任何官方默认设置**」
//       ⇒ 原「官方语音」那一行（把官方音量写成 0 的档位）连同 `officialvoice.js` 一起退场；
//     · 播放时机 / 优先级 / 打断 / 音量现在 100% 归官方 `public/js/audio.js`（见 `officialroute.js` 文件头）
//       ⇒ 那一组参数**没有任何读者**，留着就是"点了没反应的假开关"；
//     · **语种**没有丢：官方设置里本来就有「语音语言（中文 / 日本語）」；
//       ★★ 0.17.0 起**逐干员**那一档也由官方原生提供（上游 0.2.3 的 `public/js/ui/operatorVoice.js`，
//       挂在干员详情面板与自选槽位卡里）⇒ 本 Mod 那一整条轴（含 `controls.js` 的语音下拉）**已删除**。
//   ★ 因此本栏从「三组：语音 / 随机皮肤 / 其他」变成「两组：随机皮肤 / 其他」。
//
// ★★ 0.16.0（工序 51，服主实测反馈 ③④）—— 三处改动，都在这一栏里：
//   ① **取消局内的「立即为所有干员随机皮肤」**：那一栏的宿主是**官方设置弹窗**（左下角齿轮），
//      而它在**局内也打得开** ⇒ 局内点它会造成"看着生效、实际只生效一半"（真机实测：配置与材质清单
//      确实改了、**语音跟着变**，但**战斗里已经建好的 spine 小人不会变**）。服主口径
//      「取消局内的『立刻随机全部干员皮肤』功能，仅局外可随机」⇒ 用 `isInMatch()` 把**这一行**
//      在局内整行不画（开关与状态读数照旧，见下面）。
//      ★ 与「每局开始时随机」的区别：那条在**进入战场那一刻**抽（`battlerandom.js` 的路由钩子），
//        抽完才建战斗场景 ⇒ 小人是新那套。**它不受本次改动影响**（钩子一字未动）。
//   ② 「立即随机」那一行右边的**小字说明删除**（原为「只在该干员已有的时装里抽」）；删掉后
//      那一格在"还没点过"时是空的，**不再退化成一句说明**（`randMsg || ''`）。
//   ③ 「每局开始时随机」的说明**收进「？」小圈**（按 `docs/MODS.md` §4.12.2）—— 这句说明以前
//      根本不存在（开关光秃秃一行、玩家不知道"每局"指什么）。新增的说明按规范不能平铺成小字，
//      所以走 `SetToggle` 的 `tip` 参数（小圈由它追加在 `.set-row__label` 最右，见 §4.12.2 的"位置"条）。
//
// ★ 保留用户口径（2026-10-08，逐条仍生效）：
//   1. 「skinvoice mod 仅单独列一个『皮肤与语音』的栏位」——外壳（齿轮 / 两栏面板 / 分栏切换）在独立 Mod
//      `cyanfish.mod-settings` 里，本文件只负责**这一栏的内容**（栏位名随内容改成「皮肤」）。
//   2. 「所有的小字说明全部删除，过于冗杂影响观感」——没有 `<span class="micro">`、没有平铺的 `.set-hint`；
//      需要说明的选项只放「？」小圈（**每局开始时随机 / 素材上游 / 配置备份**三个，规范条文见 §4.12）。
//   3. 「后续的素材来源小字单独在最底部显示」——见 render 末尾的 `.sp-sv__src`。
//   4. 唯一保留的行内小字是 `.sp-sv__hint`（随机皮肤那一组）：**它不是说明，是实时状态读数**
//      （参与随机的干员数会随数据变），§4.12 允许一行、`--text-dim`、且必须带 `data-sp-sv-randhint`。

import { iconVNode } from './icons.js';
import { ConfigIo, HintDot, UpstreamSection } from './panels.js';
import { makeT } from './i18n.js';

/** 界面文案（msgid = 中文原文，见 i18n.js）。拿不到宿主 i18n 时就是恒等函数。 */
const t = makeT(console);

/** 「每局开始时随机」的说明 —— ★★ 工序 51：这一段原来平铺在开关下面（小字），现收进「？」小圈（§4.12.2）。 */
const EACH_MATCH_TIP = '开启后，每一局进入战场时给全部干员重抽一次皮肤；同一局里不会重复抽，回到大厅再开一局才重抽一遍。';

// ---- 设置行（照抄宿主 ui/settings.js 的 Toggle 结构，但图标自绘、**不带小字**）----------------------------

/**
 * @param {{ html:any, icon:string, label:any, value:boolean, onChange:Function, tip?:any }} props
 *   `label` 多数时候是字符串；`tip` 给了就渲染成 `?` 小圈（★ §4.12.2：只挂**短标签的最右**，
 *   所以它由这里追加成 `.set-row__label` 的最后一个子元素，而不是由调用方自己拼）。
 */
function SetToggle({ html, icon, label, value, onChange, tip = null }) {
  return html`<div class="set-row">
    <span class="set-row__label">${iconVNode(html, icon)}${label}${tip}</span>
    <button type="button" class=${`set-toggle${value ? ' is-on' : ''}`} role="switch" aria-checked=${value ? 'true' : 'false'}
      onClick=${() => onChange(!value)}><i></i><span>${value ? t('开启') : t('关闭')}</span></button>
  </div>`;
}

/**
 * ★★ 更新②：把宿主的表单控件拼成一行（按钮 + 可选的「撤销」）。**不动宿主 CSS**：
 *   加一个 `.sp-sv__setrow` 让子项落到宿主的第 2 列（`.set-row` 是三列 grid：3.3rem / 1fr / auto），
 *   这样按钮的左边线与本栏其它控件对齐；样式在 style.js 里，只作用于本 Mod 的类名。
 * @param {{ html:any, label:any, children:any, hint?:any, hintData?:Record<string,string> }} props
 *   `hintData` —— ★ §4.12.2：**状态读数**那一行必须能被取证/断言认出（`data-*`）。
 *   标记要落在**容器 `span`** 上：hint 本身可能是一个 `<button>`（撤销）或一个 `<span>`（读数），
 *   把标记挂在传进来的 vnode 上会被这里再包一层而丢掉（实测踩到）。
 */
function SetRow({ html, label, children, hint, hintData = null }) {
  return html`<div class="set-row sp-sv__setrow">
    <span class="set-row__label">${label}</span>
    <div class="sp-sv__setctl">${children}</div>
    ${hint ? html`<span class="sp-sv__sethint" ...${hintData || {}}>${hint}</span>` : null}
  </div>`;
}

/** 分组小标题（中文，不用英文 eyebrow）。 */
function Group({ html, label, children }) {
  return html`<div class="sp-sv__group"><span class="sp-sv__groupname">${label}</span>${children}</div>`;
}

/**
 * 本 Mod 在「模组设置」里的那一栏（**只有皮肤**）。★ 零参渲染（依赖在闭包里），见 registry.js 的契约。
 * @param {{ api:any, cfg:any, table?:any, skins?:any, onReapply?:Function, version?:string,
 *           isInMatch?:() => boolean }} props
 *   version —— **只用于显示**（版本自证 ③）。玩家在这个栏位底部能直接看到 `vX.Y.Z`，
 *   用来回答"浏览器这次加载的是哪一版"。不传则退化成 `v?`。
 *   table / skins —— 随机皮肤需要：`table.operators[charId].skins` 是"该干员已有的时装"
 *   （随机范围就是它），`skins.randomizeAll / restore` 负责写存储 + 套用 + 重渲染。
 *   不传 ⇒ 随机那一组整块不画（老调用方不受影响）。
 *   ★★ `isInMatch`（工序 51）—— 「立即为所有干员随机皮肤」这一**动作**只在**局外**画。
 *     真机复现（服主反馈 ③）：局内点它虽然能把配置与材质清单改掉，但**战斗里的 spine 小人不会变**
 *     （小人是在战斗场景建立时按当时的 manifest 建好的），只有语音会跟着变
 *     ⇒ 按钮给出的是"看起来生效了、实际只生效一半"的假象。服主口径：**取消局内的这一功能，仅局外可随机**。
 *     ★ 与「每局开始时随机」的区别（那条**不受影响**）：它是在**进入战场那一刻**抽（`battlerandom.js`
 *     的路由钩子），抽完才建场景 ⇒ 小人是新的那套；而"局内立刻换"是在场景**已经建好之后**动手。
 *     `isInMatch` 拿不到（老宿主 / 老调用方）⇒ 退化成"永远画"（= 工序 51 之前的行为）。
 */
export function SkinVoiceSection({ api, cfg, table, skins, onReapply, version, isInMatch = null, onMatchChange = null }) {
  const { html, Button, hooks: { useState, useEffect } } = api.ui;
  const [, force] = useState(0);
  const repaint = () => force((n) => n + 1);

  // 配置从任何地方改了（行内控件 / 导入 / 上游线路）都要跟着刷新
  useEffect(() => { const off = cfg.subscribe(() => repaint()); return () => off?.(); }, []);
  // ★★ 工序 51：进出局要重画（决定「立即随机」那一行画不画）。订阅口由调用方给（index.js 读宿主路由）。
  useEffect(() => {
    if (typeof onMatchChange !== 'function') return () => {};
    const off = onMatchChange(() => repaint());
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, []);

  const c = cfg.get();
  const set = (patch) => { cfg.set(patch); repaint(); };
  /** 现在在不在**局内**（战斗 / 整备）。★ 判据由调用方注入（index.js 读宿主 store 的路由）。 */
  const inMatch = (() => { try { return typeof isInMatch === 'function' ? !!isInMatch() : false; } catch { return false; } })();

  // ---- ★★ 「为所有干员使用随机皮肤」----------------------------------------------------------------
  // 参与随机的干员数（有时装可选的）：直接数数据表，和 skins.randomizeAll 的筛选口径**同一条件**。
  const rand = (() => {
    const ops = table?.operators || null;
    if (!ops || typeof skins?.randomizeAll !== 'function') return null;
    let n = 0, skipped = 0;
    for (const op of Object.values(ops)) {
      if (Array.isArray(op?.skins) && op.skins.length) n++; else skipped++;
    }
    return { n, skipped, done: (cfg.get().randomKeys || []).length };
  })();

  /**
   * 「立即随机」：先调用（它自己写配置、套用材质、触发重渲染），返回值里带**随机前的快照** ⇒
   * 挂到模块外的 `lastRandom` 上供「撤销随机」用（撤销是**会话内**的便利，不落盘、不污染存储格式）。
   * ★ 不用 toast 报结果：这一行右边的文字就是结果（toast 在小屏幕上会盖住刚点的地方）。
   */
  const doRandom = () => {
    if (!rand) return;
    void skins.randomizeAll().then((r) => {
      lastRandom = { before: r.before, n: r.n, changed: r.changed };
      randMsg = t('已抽取 {n} 名干员（{changed} 名与之前不同）', { n: r.n, changed: r.changed });
      repaint();
    }).catch((e) => {
      randMsg = t('随机失败：{error}', { error: String(e?.message || e) });
      api.ui.toastError?.(randMsg);
      repaint();
    });
  };
  /** 「撤销随机」：把上一次随机覆盖掉的选择还原（只还原被随机过的干员）。 */
  const doUndo = () => {
    if (!lastRandom) return;
    const snap = lastRandom.before;
    void skins.restore(snap).then(() => {
      lastRandom = null;
      randMsg = t('已撤销上一次随机');
      repaint();
    }).catch((e) => {
      randMsg = t('撤销失败：{error}', { error: String(e?.message || e) });
      repaint();
    });
  };

  return html`<div class="sp-sv__section">
    ${rand ? html`<${Group} html=${html} label=${t('随机皮肤')}>
      ${inMatch ? null : html`<${SetRow} html=${html} label=${t('立即随机')}
        hintData=${{ 'data-sp-sv-randhint': '1' }}
        hint=${lastRandom
          ? html`<${Button} variant="ghost" size="sm" class="sp-sv__undo" data-testid="sv-random-undo"
              onClick=${doUndo}>${t('撤销')}<//>`
          : (randMsg || '')}>
        <${Button} variant="secondary" size="sm" icon="refresh" class="sp-sv__rand"
          data-testid="sv-random-now" onClick=${doRandom}>${t('立即为所有干员随机皮肤')}<//>
      <//>`}
      <${SetToggle} html=${html} icon="refresh" label=${t('每局开始时随机')} tip=${html`<${HintDot} html=${html} text=${t(EACH_MATCH_TIP)} />`}
        value=${c.randomEachMatch} onChange=${(v) => set({ randomEachMatch: v })} />
      <p class="sp-sv__hint" data-sp-sv-randhint="1">${t('随机范围：只在该干员已有的时装里抽；{n} 名有时装可选的干员参与，{skipped} 名没有可选时装、自动跳过。', { n: rand.n, skipped: rand.skipped })}</p>
    <//>` : null}

    <${Group} html=${html} label=${t('其他')}>
      <${UpstreamSection} api=${api} cfg=${cfg} repaint=${repaint} onReapply=${onReapply} />
      <${ConfigIo} api=${api} cfg=${cfg} onChanged=${repaint} />
    <//>

    <p class="sp-sv__src">素材来源：立绘 / 头像 yuanyan3060/ArknightsGameResource，语音（含时装专属语音）
      Kengxxiao/ArknightsGameData + ArknightsAssets2，战斗小人 torappu.prts.wiki + fexli/ArknightsResource。版权归鹰角网络 / Yostar 所有。</p>

    <p class="sp-sv__ver" data-sp-sv-version=${version ? String(version) : ''}>皮肤与语音 Mod · v${version || '?'}</p>
  </div>`;
}

/**
 * 「立即随机」的**会话内**备忘：随机前的 skins 快照（供「撤销」）+ 一句话结果。
 * ★ 故意放在模块作用域而不是 cfg 里：撤销是"这一会儿点错了"的便利，不写进 localStorage，
 *   也不改导出/导入的对象形状（存储格式向后兼容，见 config.js）。
 */
let lastRandom = null;
/** 上一次随机/撤销的结果文字（重新挂载后会清掉，符合"会话内提示"的定位）。 */
let randMsg = '';


// ---- 没有「模组设置」时的兜底外壳 -------------------------------------------------------------------
//
// ★ 为什么还要留一个：别的 Mod 可以**不装** `cyanfish.mod-settings`（比如只想要皮肤切换）。
//   那时注册表里 `host` 为 null ⇒ 没人画这一栏。为了不让本 Mod 变成"没地方改参数"，这里用**同一份**
//   SkinVoiceSection 渲染一个最小弹窗（外壳是宿主的 Modal，代码只有几十行，不会和设置 Mod 漂移）。
//   `index.js` 只在 `registry.host` 为空时把齿轮挂出来。

const HOST_ID = 'sp-mod-cyanfish.skinvoice-fallback';

/**
 * @returns {Promise<{open:Function, close:Function, available:boolean, dispose:Function}>}
 *   ★★ 工序 51：`isInMatch` / `onMatchChange` 一路透传到 SkinVoiceSection（与注册栏位那条路径**同一份**依赖，
 *      否则"没装模组设置外壳"的服务器上局内又会冒出那个按钮）。
 */
export async function mountFallbackPanel({ api, cfg, table, skins, onReapply, log = console, version,
  isInMatch = null, onMatchChange = null }) {
  let preact = null;
  try { preact = await import('/vendor/preact.module.js'); } catch { /* 降级 */ }
  const usable = !!(preact && typeof preact.render === 'function');
  if (!usable) log.warn?.('[skinvoice] 兜底设置面板不可用（拿不到 vendor preact）');

  let host = null;
  if (usable) {
    host = document.createElement('div');
    host.id = HOST_ID;
    document.body.appendChild(host);
  }

  const html = api.ui.html;
  let open = false;
  const draw = () => {
    if (!usable) return;
    try {
      preact.render(open
        ? html`<${FallbackModal} api=${api} cfg=${cfg} table=${table} skins=${skins} onReapply=${onReapply} version=${version}
            isInMatch=${isInMatch} onMatchChange=${onMatchChange}
            onClose=${() => { open = false; draw(); }} />`
        : null, host);
    } catch (e) { log.warn?.('[skinvoice] 渲染设置面板失败', e); }
  };

  return {
    available: usable,
    open() { if (!usable) { api.ui.toast('设置面板不可用（拿不到 vendor preact）', 'warn'); return; } open = true; draw(); },
    close() { open = false; draw(); },
    dispose() { if (usable) { try { preact.render(null, host); } catch { /* ignore */ } host.remove(); } },
  };
}

function FallbackModal({ api, cfg, table, skins, onReapply, onClose, version, isInMatch = null, onMatchChange = null }) {
  const { html, Modal, Button } = api.ui;
  return html`<${Modal} open=${true} onClose=${onClose} title="皮肤" micro="SKIN" width="7.4rem"
    class="sp-sv__modal"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${onClose}>完成<//>`}>
    <div class="set-list sp-sv__setlist">
      <${SkinVoiceSection} api=${api} cfg=${cfg} table=${table} skins=${skins} onReapply=${onReapply} version=${version}
        isInMatch=${isInMatch} onMatchChange=${onMatchChange} />
    </div>
  <//>`;
}
