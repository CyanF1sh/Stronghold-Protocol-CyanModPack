// mods/cyanfish.debug-console/client/panel.js — 控制台面板本体（类《杀戮尖塔》的测试控制台：分类 + 可搜索 + 快捷档）。
//
// ★ 挂哪儿由 index.js 决定（宿主插槽 `game.cornerActions`，即左下角三个官方按键右侧那一格），本文件只画内容：
//   一个宿主 `Modal`（标题「调试控制台」，tone mint），里面是 ① 一行分类键（状态 / 基础 / 干员 / 装备 / 敌人 /
//   强度 / 盟约 / 悬赏）；② 当前分类的内容；③ 一行阶段提示 + 闸门说明。
// ★ 全程走 `api.ui.*`（宿主组件与 hooks），**不自己往 DOM 里塞节点**（screens 是 Preact 组件，塞进去会被下一次
//   渲染冲掉 —— docs/MODS.md 的文件头那句话）。样式只有自家 `.dc-*`（client/style.js）+ 宿主已有的控件
//   （`.set-toggle` 开关 / `.lo-select` 下拉框 / `ui.Button` / `ui.TextField`，见 docs/MODS.md §4.12.9 一）。
//
// ★★ 工序 115 修掉的两个 bug（同一个根因：**每次重画都换掉了组件类型**）：
//   ① 滚动每隔一会儿自己回到最顶：`const Pane = PANES[tab]` 里的那几个函数是**每次渲染新建的闭包**
//      ⇒ Preact 按 `type` 比对，函数不等 ⇒ 整棵子树 **卸载重挂** ⇒ 滚动容器连同它的 scrollTop 一起重建。
//      现在改成**直接调用**取 vnode（`(PANES[tab] || tabState)()`）：容器仍是同一个 `div`，DOM 被复用，
//      scrollTop 天然保住；另外再记一份每个分类的 scrollTop，在重画后显式还原一次（双保险）。
//   ② 搜索框输入一个字就失焦：同一个根因（输入节点被卸载重挂）。⇒ 同一个修法；并且 `viewSig` 让"什么都没变"
//      的 store 通知**不再触发重画**（宿主每 ~100ms 推一次 m.public，不跳的话每秒重画十次）。
// ★ 文案照 docs/MODS.md §4.12：短标签 ≤ 14 个全角字、长说明一律收进「？」小圈（`HintDot` + 纯 CSS `data-tip`）、
//   **不用英文 eyebrow / `micro`**、状态读数一行且带 `data-*`。
// ★ 「仅单人 / 全 AI」闸门保留：多人房里入口按钮根本不出现（index.js），面板自己再判一次（state.loneHuman）。

import {
  ATTRS, ENEMY_CATS, ENEMY_STATES, LIST_LIMIT, TABS, TIP, TXT,
  bountyEnemyKeys, choiceCards, decimal, hasAction, idPrefix, mulText, phaseHint, seamOn, viewSig, waveCountsOf, waveListOf,
} from './state.js';

/** 列表里一条记录要显示的名字（数据里查不到就退化成 id —— 绝不编一个名字）。 */
const nameOf = (api, file, id) => {
  try {
    const rec = api?.data?.lookup?.(file, id);
    return (rec && typeof rec.name === 'string' && rec.name) ? rec.name : id;
  } catch { return id; }
};

/** 当前分类里的搜索词（一个对象存全部，省得每次换栏都重置）。 */
const qOf = (q, tab) => (typeof q[tab] === 'string' ? q[tab] : '');

/** 当前分类选的阶数（null = 不限）。 */
const tierOf = (tier, tab) => (Number.isInteger(tier[tab]) ? tier[tab] : null);

const matchText = (text, needle) => (needle ? String(text ?? '').toLowerCase().includes(String(needle).toLowerCase()) : true);
const capNum = (n, cap) => Math.max(0, Math.min(cap, Math.trunc(Number(n) || 0)));

export function ConsoleView(props) {
  const api = props.api;
  const { html, Modal, Button, TextField, Icon, confirmDialog, hooks: { useState, useEffect, useRef } } = api.ui;
  const read = props.read;
  const store = props.store;
  const [view, setView] = useState(() => read());
  const [tab, setTab] = useState('state');
  const [q, setQ] = useState({});
  const [tier, setTier] = useState({});
  const [cat, setCat] = useState('all');
  const [wstate, setWstate] = useState('all');
  const [num, setNum] = useState(() => ({ round: String(read().round), funds: String(read().funds), lp: String(read().lp ?? '') }));
  const [sel, setSel] = useState(null);
  const [selBond, setSelBond] = useState(null);
  const [waveDraft, setWaveDraft] = useState({});
  const [layerDraft, setLayerDraft] = useState({});
  const [attrDraft, setAttrDraft] = useState({});
  const [busy, setBusy] = useState(false);
  const [dataRev, setDataRev] = useState(0);
  const alive = useRef(true);
  const paneRef = useRef(null);
  const scrollTops = useRef({});
  const lastTab = useRef('state');

  // 订阅应用 store：m.public / m.private 一变就重画（拿不到 store ⇒ 只画第一次读到的快照）。
  // ★ 指纹相同 ⇒ **保持同一个 view 对象**（不重画）：滚动位置与输入焦点都靠这一条 + 稳定 DOM 保住。
  useEffect(() => {
    if (!store?.subscribe) return undefined;
    const off = store.subscribe(() => {
      const next = read();
      setView((prev) => (viewSig(prev) === viewSig(next) ? prev : next));
    });
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [store, read]);

  // 数据目录（干员 / 装备 / 敌人 / 盟约 / 悬赏卡 / 效果 / 策略）按需加载，并在文件就绪时重画
  useEffect(() => {
    const d = api?.data;
    if (!d || typeof d.load !== 'function') return undefined;
    const bump = () => setDataRev((n) => n + 1);
    const off = typeof d.subscribe === 'function' ? d.subscribe(bump) : undefined;
    for (const n of ['chess', 'items', 'enemies', 'bonds', 'choices', 'effects', 'bands']) d.load(n);
    return () => { try { off?.(); } catch { /* ignore */ } };
  }, [api]);

  useEffect(() => () => { alive.current = false; }, []);

  // 服务端改了数字（或被拒之后）就把输入框拉回当前真值
  useEffect(() => { setNum((s) => ({ ...s, round: String(view.round), funds: String(view.funds), lp: String(view.lp ?? '') })); }, [view.round, view.funds, view.lp]);
  // 本波 / 层数 / 倍率的**草稿**在服务端给出新真值时作废（草稿只活在"正在输入"的这段时间里）
  useEffect(() => { setWaveDraft({}); }, [view.wave]);
  useEffect(() => { setLayerDraft({}); }, [view.bonds]);
  useEffect(() => { setAttrDraft({}); }, [view.debugScale]);

  // ★ 滚动位置：**只在"刚换了分类"时**动 `scrollTop`（每个分类记一份自己的位置）。
  //   ★★ 同一个分类内的重画**一律不碰 scrollTop** —— 那正是工序 115 修 bug①的关键：面板每 ~100ms 会被
  //   store 推送带着重画一次，任何"每次重画都还原一次 scrollTop"的写法都会把用户刚滚到的位置打回去
  //   （真机实测：程序化把 scrollTop 设成 240 之后紧接着来一次重画，还原逻辑会把它按回 0 —— 因为
  //   `scroll` 事件是**异步**派发的，那一刻 scrollTops 里还是旧值）。
  useEffect(() => {
    const el = paneRef.current;
    if (!el || lastTab.current === tab) return;
    lastTab.current = tab;
    el.scrollTop = scrollTops.current[tab] ?? 0;
  }, [tab]);

  /** 切分类：先把当前分类的滚动位置存下来（读 DOM，不信异步的 scroll 事件），再换栏。 */
  const switchTab = (id) => {
    if (id === tab) return;
    const el = paneRef.current;
    if (el) scrollTops.current[tab] = el.scrollTop;
    setTab(id);
  };

  /** 发送一个动作：成功 ⇒ 刷新（store 会推回来）；失败 ⇒ 把服务端给的原因原样摊给服主看。 */
  const fire = (action, value, id, list) => {
    const p = props.fire(action, value, id, list);
    if (!p) { api.ui.toast('调试控制台：没有可用的会话连接', 'warn'); return; }
    setBusy(true);
    p.then(() => { if (alive.current) setBusy(false); })
      .catch((err) => {
        if (!alive.current) return;
        setBusy(false);
        const code = err?.code || 'ERROR';
        const detail = err?.detail || err?.message || '';
        api.ui.toast('调试控制台：' + action + ' 被拒（' + code + (detail ? ' · ' + detail : '') + '）', 'error');
      });
  };

  const has = (a) => hasAction(view, a);
  const toast = (text) => api.ui.toast(text, 'warn');

  // ---- 「？」小圈：规范形状（docs/MODS.md §4.12.2 二，一个字别改） ----
  // ★ 它是**普通函数**（用 `HintDot(text)` 直接取 vnode），不是组件：函数组件写在这里等于"每次渲染一个新类型"
  //   ⇒ Preact 会把它当另一个组件卸载重挂（这正是工序 115 修掉的两个 bug 的根因）。凡是不需要 hooks 的小件，
  //   一律**调用**而不是当组件用 —— 这样 `<span class="sp-dc__info">` 始终是同一个 DOM 节点。
  const HintDot = (text) => html`<span class="sp-dc__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;

  /** 一排快捷档按钮。 */
  const chips = (list, pick) => html`<span class="sp-dc__chips">${list.map((v) => html`<${Button} key=${'q' + v} variant="ghost" size="sm" disabled=${busy} onClick=${() => pick(v)}>${String(v)}<//>`)}</span>`;

  /**
   * 宿主已有的开关（`.set-toggle`，与游戏设置页同一个控件、同一套外观；见 ui/settings.js 的 Toggle）。
   * ★ 同上：普通函数，调用取 vnode。★ 模板里**根元素必须显式闭合**（`</button>`）—— 只写 `<//>` 收的是
   *   最后开着的那个 `<span>`，根 `<button>` 留在栈上，htm 生成的 vnode 树就是坏的（真机症状：
   *   这一行**一个按钮都没有**，最坏时整块面板被 Preact 的 insertBefore 异常打掉）。
   */
  const Switch = ({ on, disabled, onClick, label }) => html`<button type="button" class=${'set-toggle' + (on ? ' is-on' : '')} role="switch"
    aria-checked=${on ? 'true' : 'false'} disabled=${disabled} data-dc=${on ? 'on' : 'off'} onClick=${onClick}><i></i><span>${label}</span></button>`;

  /** 宿主已有的下拉框（`.lo-select`，与干员调配页同一个控件；见 ui/operatorVoice.js）。同上，普通函数。 */
  const Select = ({ value, onChange, options, aria }) => html`<span class="lo-select">${html`<select aria-label=${aria} value=${value} onChange=${(e) => onChange(e.currentTarget.value)}>
    ${options.map((o) => html`<option key=${o.id} value=${o.id}>${o.label}<//>`)}<//>`}</span>`;

  // ---- 数据目录 ----------------------------------------------------------
  const list = (file) => { void dataRev; try { return api?.data?.list?.(file) ?? []; } catch { return []; } };
  const cap = (rows) => html`${rows.slice(0, LIST_LIMIT)}${rows.length > LIST_LIMIT ? html`<p class="sp-dc__more" data-dc="more">${'只显示前 ' + LIST_LIMIT + ' 条，继续输入或筛选以收窄（共 ' + rows.length + ' 条）'}</p>` : null}`;

  /**
   * 干员家族（普通 / 精锐成对，一行一对）：key = 去掉 `_a` / `_b` 的 id 前缀。
   * ★ 只收 `visible && !isHidden && !isDiy` 的记录（自选位没有 body，官方也拒绝发它）。
   */
  const chessFamilies = () => {
    const by = new Map();
    for (const c of list('chess')) {
      if (!c || typeof c.chessId !== 'string' || c.isDiy || c.isHidden || !c.visible) continue;
      const key = idPrefix(c.baseId || c.chessId);
      let f = by.get(key);
      if (!f) { f = { key, name: c.name || key, tier: Number.isInteger(c.tier) ? c.tier : null, normal: null, golden: null }; by.set(key, f); }
      if (!c.name) continue;
      if (c.isGolden) f.golden = c.chessId; else f.normal = c.chessId;
    }
    return [...by.values()];
  };

  /** 装备家族（同一件装备的普通 / 精锐，一行一对）。 */
  const itemFamilies = () => {
    const by = new Map();
    for (const it of list('items')) {
      if (!it || it.itemType !== 'EQUIP' || typeof it.id !== 'string') continue;
      const key = idPrefix(it.baseId || it.id);
      let f = by.get(key);
      if (!f) { f = { key, name: it.name || key, tier: Number.isInteger(it.tier) ? it.tier : null, normal: null, golden: null }; by.set(key, f); }
      if (it.isGolden) f.golden = it.id; else f.normal = it.id;
    }
    return [...by.values()];
  };

  /** 一行"名称 + id 前缀 + 两个按钮（普通 / 精锐）"。 */
  const famRow = (f, action) => html`<div class="sp-dc__listrow" key=${f.key} data-dc-id=${f.key}>
    <span class="sp-dc__rowname">${f.name}</span>
    <span class="sp-dc__rowid">${f.key}</span>
    <span class="sp-dc__rowacts">
      <${Button} key="a" variant="secondary" size="sm" disabled=${busy || !f.normal || !has(action)} onClick=${() => fire(action, 1, f.normal)}>${TXT.normal}<//>
      <${Button} key="b" variant="secondary" size="sm" disabled=${busy || !f.golden || !has(action)} onClick=${() => fire(action, 1, f.golden)}>${TXT.golden}<//>
    </span>
  </div>`;

  /** 阶数筛选（六个按钮，点当前那个 = 取消筛选）。 */
  const tierRow = (tabId) => html`<div class="sp-dc__row" data-dc="tier">
    <span class="sp-dc__label">${TXT.tier}</span>
    <span class="sp-dc__chips">${[1, 2, 3, 4, 5, 6].map((t) => html`<${Button} key=${'t' + t} variant="ghost" size="sm" active=${tierOf(tier, tabId) === t} disabled=${busy}
      onClick=${() => setTier((s) => ({ ...s, [tabId]: s[tabId] === t ? null : t }))}>${String(t)}<//>`)}</span>
  </div>`;

  // ★ `TextField` 的 props 是**白名单**（不吃 `data-testid` 之类的散装属性），所以取证用的标记挂在外层 span 上。
  const searchField = (tabId, placeholder) => html`<span class="sp-dc__searchwrap" data-testid=${'debug-console-search-' + tabId}>${html`<${TextField} class=${'sp-dc__search sp-dc__search--' + tabId} size="sm" value=${qOf(q, tabId)} placeholder=${placeholder}
    maxLength=${24} onInput=${(v) => setQ((s) => ({ ...s, [tabId]: v }))} />`}</span>`;

  // ---- 各分类 ------------------------------------------------------------

  /** 状态：只读（阶段 / 回合 / 资金 / 生命 / 手牌 / 场上 / 已生效 buff / 本波敌人）。 */
  const tabState = () => html`<div class="sp-dc__body" data-dc-pane="state">
    <dl class="sp-dc__state" data-testid="debug-console-state">
      <div class="sp-dc__stat"><dt>${'阶段'}</dt><dd data-dc="phase">${view.phase || '-'}</dd></div>
      <div class="sp-dc__stat"><dt>${'回合'}</dt><dd class="num" data-dc="round">${view.round}${view.bossRound || view.hiddenRound ? ' · B' + (view.bossRound ?? '-') + '/H' + (view.hiddenRound ?? '-') : ''}</dd></div>
      <div class="sp-dc__stat"><dt>${'资金'}</dt><dd class="num" data-dc="funds">${view.funds}</dd></div>
      <div class="sp-dc__stat"><dt>${'生命'}</dt><dd class="num" data-dc="lp">${view.lp == null ? '-' : view.lp}</dd></div>
    </dl>
    <p class="sp-dc__read" data-dc="readout">${'场上 ' + view.board.length + ' · 手牌 ' + view.hand.length + ' · 装备 ' + view.items.length + ' · 已生效 ' + view.applied.length + ' 条'}</p>
    <p class="sp-dc__read" data-dc="wave-readout">${'本波敌人：' + (view.wave.length ? view.wave.map((e) => nameOf(api, 'enemies', e.enemyKey) + '×' + e.count + (e.bounty ? '(悬赏' + e.bounty + ')' : '')).join('、') : '（尚未生成）')}</p>
    ${view.applied.length ? html`<div class="sp-dc__rows" data-dc="applied">${view.applied.map((a) => html`<div class="sp-dc__listrow" key=${a.refId}>
      <span class="sp-dc__rowname">${a.name || a.effectId}</span>
      <span class="sp-dc__rowid">${a.effectId}</span>
      <span class="sp-dc__rowacts"><${Button} variant="ghost" size="sm" disabled=${busy || !has('clearChoice')} onClick=${() => fire('clearChoice', undefined, a.effectId)}>${TXT.revoke}<//></span>
    </div>`)}</div>` : null}
    <p class="sp-dc__hint">${TXT.hp}</p>
    <p class="sp-dc__read" data-dc="gate">${'闸门：' + (view.loneHuman ? '单人 / 全 AI 对局 ✓' : '非单人 ✗') + ' · 服务器开关 ' + (seamOn(view) ? '已开 ✓' : '未开 ✗')}</p>
  </div>`;

  /**
   * 基础：回合 / 资金 / 生命值。
   * ★ 快捷档按服主口径收窄：回合只有 1（初始）与两个 boss 回合；资金只有 325 / 799 / 999；生命只有
   *   1 / 本局策略初始值 / 99。两个 boss 回合取 `m.public` 的 bossRound / hiddenRound（**不是**写死 14/15）。
   */
  const tabBasic = () => {
    const roundChips = [...new Set([1, view.bossRound, view.hiddenRound].filter((v) => Number.isInteger(v) && v >= 1 && v <= view.caps.round))];
    const lpChips = [...new Set([1, view.startLp, 99].filter((v) => Number.isInteger(v) && v >= 1 && v <= view.caps.lp))];
    return html`<div class="sp-dc__body" data-dc-pane="basic">
    ${has('setRound') ? html`<div class="sp-dc__row" data-testid="debug-console-round">
      <span class="sp-dc__label">${TXT.round}${HintDot(TIP.round)}</span>
      <${TextField} class="sp-dc__num" size="sm" value=${num.round} maxLength=${3} transform=${props.digits} onInput=${(v) => setNum((s) => ({ ...s, round: props.digits(v) }))} />
      ${chips(roundChips, (v) => setNum((s) => ({ ...s, round: String(v) })))}
      <${Button} variant="secondary" size="sm" disabled=${busy} onClick=${() => fire('setRound', props.clamp.round(Number(num.round) || 0))}>${'跳转'}<//>
    </div>` : null}
    ${has('setFunds') ? html`<div class="sp-dc__row" data-testid="debug-console-funds">
      <span class="sp-dc__label">${TXT.funds}${HintDot(TIP.funds)}</span>
      <${TextField} class="sp-dc__num" size="sm" value=${num.funds} maxLength=${7} transform=${props.digits} onInput=${(v) => setNum((s) => ({ ...s, funds: props.digits(v) }))} />
      ${chips([325, 799, 999].filter((v) => v <= view.caps.funds), (v) => setNum((s) => ({ ...s, funds: String(v) })))}
      <${Button} variant="secondary" size="sm" disabled=${busy} onClick=${() => fire('setFunds', props.clamp.funds(Number(num.funds) || 0))}>${'设置'}<//>
    </div>` : null}
    ${has('setLp') ? html`<div class="sp-dc__row" data-testid="debug-console-lp">
      <span class="sp-dc__label">${TXT.lp}${HintDot(TIP.lp)}</span>
      <${TextField} class="sp-dc__num" size="sm" value=${num.lp} maxLength=${3} transform=${props.digits} onInput=${(v) => setNum((s) => ({ ...s, lp: props.digits(v) }))} />
      ${chips(lpChips, (v) => setNum((s) => ({ ...s, lp: String(v) })))}
      <${Button} variant="secondary" size="sm" disabled=${busy} onClick=${() => fire('setLp', props.clamp.lp(Number(num.lp) || 0))}>${'设置'}<//>
    </div>` : null}
  </div>`;
  };

  /** 干员：按阶数筛选 + 可搜索的家族列表（一行一对：普通 / 精锐，各获取一个）。 */
  const tabChess = () => {
    const needle = qOf(q, 'chess');
    const t = tierOf(tier, 'chess');
    const rows = chessFamilies().filter((f) => (t == null || f.tier === t) && (matchText(f.name, needle) || matchText(f.key, needle)));
    return html`<div class="sp-dc__body" data-dc-pane="chess">
      ${tierRow('chess')}
      <div class="sp-dc__row"><span class="sp-dc__label">${TXT.search}${HintDot(TIP.chess)}</span>${searchField('chess', '干员名 / id')}</div>
      ${rows.length ? cap(rows.map((f) => famRow(f, 'grantChess'))) : html`<p class="sp-dc__hint">${'没有符合条件的干员（数据没就绪？/data/chess.json）'}</p>`}
    </div>`;
  };

  /** 装备：按阶数筛选 + 可搜索的家族列表（一行一对：普通 / 精锐，各发一件到整备区）。 */
  const tabItem = () => {
    const needle = qOf(q, 'item');
    const t = tierOf(tier, 'item');
    const rows = itemFamilies().filter((f) => (t == null || f.tier === t) && (matchText(f.name, needle) || matchText(f.key, needle)));
    return html`<div class="sp-dc__body" data-dc-pane="item">
      ${tierRow('item')}
      <div class="sp-dc__row"><span class="sp-dc__label">${TXT.search}${HintDot(TIP.item)}</span>${searchField('item', '装备名 / id')}</div>
      ${rows.length ? cap(rows.map((f) => famRow(f, 'grantItem'))) : html`<p class="sp-dc__hint">${'没有符合条件的装备（数据没就绪？/data/items.json）'}</p>`}
    </div>`;
  };

  // ---- 敌人：顶部固定栏（选中敌人的数量增减）+ 类别 / 状态筛选 + 可点选的行 -------------------------------

  /** 本波组成（`normal` 那些）+ 一条改动 ⇒ `setWaveList`。 */
  const applyWave = (counts) => fire('setWaveList', undefined, undefined, waveListOf(counts));

  const stepWave = (delta) => {
    if (!sel) { toast('调试控制台：先点一个敌人'); return; }
    if (!has('setWaveList')) return;
    const counts = waveCountsOf(view.wave);
    const next = capNum((counts.get(sel) ?? 0) + delta, view.caps.count);
    if (next > 0) counts.set(sel, next); else counts.delete(sel);
    applyWave(counts);
  };

  const commitWaveCount = (key, text) => {
    const n = capNum(Number(text) || 0, view.caps.count);
    const counts = waveCountsOf(view.wave);
    if (n > 0) counts.set(key, n); else counts.delete(key);
    setWaveDraft((s) => { const x = { ...s }; delete x[key]; return x; });
    applyWave(counts);
  };

  const tabWave = () => {
    const counts = waveCountsOf(view.wave);
    const bountyKeys = bountyEnemyKeys(api);
    const catDef = ENEMY_CATS.find((c) => c.id === cat) || ENEMY_CATS[0];
    const needle = qOf(q, 'wave');
    const added = (k) => (counts.get(k) ?? 0) > 0;
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    const all = list('enemies').filter((e) => e && typeof e.key === 'string' && !e.tokenOnly);
    const rows = all.filter((e) => {
      if (catDef.bounty ? !bountyKeys.has(e.key) : (catDef.test ? !catDef.test(e) : false)) return false;
      if (wstate === 'added' && !added(e.key)) return false;
      if (wstate === 'empty' && added(e.key)) return false;
      return matchText(e.name, needle) || matchText(e.key, needle);
    });
    const selName = sel ? nameOf(api, 'enemies', sel) : TXT.pickNone;
    return html`<div class="sp-dc__body" data-dc-pane="wave">
      <div class="sp-dc__topbar" data-dc="wave-top">
        <span class="sp-dc__label">${TXT.pick}</span>
        <span class="sp-dc__sel" data-dc="wave-sel">${selName + (sel ? ' ×' + (counts.get(sel) ?? 0) : '')}</span>
        <span class="sp-dc__label">${TXT.wave}</span>
        <span class="sp-dc__chips">${[-5, -1, 1, 5].map((d) => html`<${Button} key=${'d' + d} variant="ghost" size="sm" disabled=${busy || !sel || !has('setWaveList')}
          onClick=${() => stepWave(d)}>${(d > 0 ? '+' : '') + d}<//>`)}</span>
        <${Button} variant="secondary" size="sm" disabled=${busy || !has('rebuildWave')} onClick=${() => fire('rebuildWave')}>${TXT.rebuild}<//>
        <span class="sp-dc__read" data-dc="wave-total">${'本波 ' + total + ' 个'}</span>
      </div>
      <div class="sp-dc__row" data-dc="wave-filter">
        <span class="sp-dc__label">${TXT.cat}${HintDot(TIP.wave)}</span>
        ${Select({ value: cat, onChange: setCat, options: ENEMY_CATS.map((c) => ({ id: c.id, label: c.label })), aria: '敌人类别' })}
        <span class="sp-dc__label">${TXT.state}</span>
        ${Select({ value: wstate, onChange: setWstate, options: ENEMY_STATES.map((c) => ({ id: c.id, label: c.label })), aria: '敌人状态' })}
      </div>
      <div class="sp-dc__row"><span class="sp-dc__label">${TXT.search}</span>${searchField('wave', '敌人名 / key')}</div>
      ${rows.length ? cap(rows.map((e) => {
        const n = counts.get(e.key) ?? 0;
        const draft = waveDraft[e.key];
        return html`<div class=${'sp-dc__listrow sp-dc__listrow--pick' + (sel === e.key ? ' is-picked' : '')} key=${e.key} data-dc-key=${e.key}
          onClick=${() => setSel(e.key)}>
          <span class="sp-dc__rowname">${e.name || e.key}</span>
          <span class="sp-dc__rowid">${e.key}</span>
          <span class="sp-dc__rowacts" onClick=${(ev) => ev.stopPropagation()}>
            <${TextField} class="sp-dc__count" size="sm" value=${draft != null ? draft : String(n)} maxLength=${2} transform=${props.digits}
              onInput=${(v) => setWaveDraft((s) => ({ ...s, [e.key]: props.digits(v) }))}
              onEnter=${() => commitWaveCount(e.key, waveDraft[e.key] != null ? waveDraft[e.key] : n)} />
          </span>
        </div>`;
      })) : html`<p class="sp-dc__hint">${'没有符合条件的敌人（数据没就绪？/data/enemies.json）'}</p>`}
    </div>`;
  };

  // ---- 强度：按属性显示 / 修改本波敌人的实际加成倍率 ---------------------------------------------------

  const applyAttr = (a) => {
    const ds = view.debugScale || {};
    const text = attrDraft[a.id] != null ? attrDraft[a.id] : mulText(ds[a.key]);
    const n = Number(text);
    if (!Number.isFinite(n) || n <= 0) { toast('调试控制台：倍率要填一个正数（如 2 或 0.5）'); return; }
    const permille = Math.round(n * 1000);
    if (permille < 10 || permille > 100000) { toast('调试控制台：倍率要在 ×0.01 ~ ×100 之间'); return; }
    setAttrDraft((s) => { const x = { ...s }; delete x[a.id]; return x; });
    fire('setEnemyAttr', permille, a.id);
  };

  const tabScale = () => {
    const ds = view.debugScale;
    if (!has('setEnemyAttr')) return html`<div class="sp-dc__body" data-dc-pane="scale"><p class="sp-dc__hint">${'服务器没开放"按属性改敌人倍率"这一项。'}</p></div>`;
    if (!ds) return html`<div class="sp-dc__body" data-dc-pane="scale"><p class="sp-dc__hint">${'拿不到本回合的倍率读数（不在对局里，或这局的服务器还没有这一项）。'}</p></div>`;
    return html`<div class="sp-dc__body" data-dc-pane="scale">
      ${ATTRS.map((a) => {
        const base = ds.base && Number.isFinite(Number(ds.base[a.key])) ? Number(ds.base[a.key]) : null;
        const draft = attrDraft[a.id];
        return html`<div class="sp-dc__row" key=${a.id} data-dc-attr=${a.id}>
          <span class="sp-dc__label">${a.label}${HintDot(a.round ? TIP.attr + TIP.attrRound : TIP.attr + TIP.attrFixed)}</span>
          <${TextField} class="sp-dc__num" size="sm" value=${draft != null ? draft : mulText(ds[a.key])} maxLength=${8} transform=${decimal}
            onInput=${(v) => setAttrDraft((s) => ({ ...s, [a.id]: decimal(v) }))} onEnter=${() => applyAttr(a)} />
          <span class="sp-dc__chips">${[0.1, 0.5, 2, 5].map((m) => html`<${Button} key=${'p' + m} variant="ghost" size="sm" disabled=${busy}
            onClick=${() => fire('setEnemyAttr', Math.round(m * 1000), a.id)}>${'×' + m}<//>`)}</span>
          <${Button} variant="secondary" size="sm" disabled=${busy} onClick=${() => applyAttr(a)}>${TXT.set}<//>
          <${Button} variant="ghost" size="sm" disabled=${busy} onClick=${() => { setAttrDraft((s) => { const x = { ...s }; delete x[a.id]; return x; }); fire('setEnemyAttr', 0, a.id); }}>${TXT.reset}<//>
          <span class="sp-dc__read" data-dc=${'base-' + a.id}>${base == null ? '' : '官方 ×' + mulText(base)}</span>
        </div>`;
      })}
      <p class="sp-dc__hint" data-dc="attr-note">${'改动对本波次所有敌人生效，且一直留到「还原」或本局结束。'}</p>
    </div>`;
  };

  // ---- 盟约：顶部固定栏（选中盟约的层数）+ 全部盟约（层数可点开输入） ------------------------------------

  const layerCap = Math.min(999, view.caps.layers);

  const setLayers = (bondId, n) => {
    if (!bondId) { toast('调试控制台：先点一条盟约'); return; }
    fire('setLayers', Math.max(0, Math.min(layerCap, Math.trunc(Number(n) || 0))), bondId);
  };

  const tabBond = () => {
    const rows = list('bonds').filter((b) => b && typeof b.bondId === 'string');
    const cur = new Map(view.bonds.map((b) => [b.bondId, b]));
    const curOf = (id) => (Number.isInteger(cur.get(id)?.layers) ? cur.get(id).layers : 0);
    const selLayers = selBond ? curOf(selBond) : 0;
    const selName = selBond ? nameOf(api, 'bonds', selBond) : TXT.pickNone;
    return html`<div class="sp-dc__body" data-dc-pane="bond">
      <div class="sp-dc__topbar" data-dc="bond-top">
        <span class="sp-dc__label">${TXT.pick}${HintDot(TIP.layers)}</span>
        <span class="sp-dc__sel" data-dc="bond-sel">${selName + (selBond ? ' ' + selLayers + ' 层' : '')}</span>
        <span class="sp-dc__chips">
          <${Button} key="zero" variant="ghost" size="sm" disabled=${busy || !selBond || !has('setLayers')} onClick=${() => setLayers(selBond, 0)}>${TXT.zero}<//>
          ${[10, 50, 100].map((d) => html`<${Button} key=${'l' + d} variant="ghost" size="sm" disabled=${busy || !selBond || !has('setLayers')}
            onClick=${() => setLayers(selBond, selLayers + d)}>${'+' + d}<//>`)}
          <${Button} key="max" variant="ghost" size="sm" disabled=${busy || !selBond || !has('setLayers')} onClick=${() => setLayers(selBond, layerCap)}>${TXT.max}<//>
        </span>
        <span class="sp-dc__read" data-dc="bond-cap">${'上限 ' + layerCap + ' 层'}</span>
      </div>
      ${rows.length ? cap(rows.map((b) => {
        const lay = curOf(b.bondId);
        const st = cur.get(b.bondId);
        const draft = layerDraft[b.bondId];
        return html`<div class=${'sp-dc__listrow sp-dc__listrow--pick' + (selBond === b.bondId ? ' is-picked' : '')} key=${b.bondId} data-dc-bond=${b.bondId}
          onClick=${() => setSelBond(b.bondId)}>
          <span class="sp-dc__rowname">${b.name || b.bondId}</span>
          <span class="sp-dc__rowid">${b.bondId}</span>
          <span class="sp-dc__rowsub">${st && st.active ? '已激活' : '未激活'}</span>
          <span class="sp-dc__rowacts" onClick=${(ev) => ev.stopPropagation()}>
            <${TextField} class="sp-dc__count" size="sm" value=${draft != null ? draft : String(lay)} maxLength=${3} transform=${props.digits}
              onInput=${(v) => setLayerDraft((s) => ({ ...s, [b.bondId]: props.digits(v) }))}
              onEnter=${() => { setLayerDraft((s) => { const x = { ...s }; delete x[b.bondId]; return x; }); setLayers(b.bondId, layerDraft[b.bondId] != null ? layerDraft[b.bondId] : lay); }} />
          </span>
        </div>`;
      })) : html`<p class="sp-dc__hint">${'数据未就绪（/data/bonds.json 还没加载完）'}</p>`}
    </div>`;
  };

  // ---- 悬赏：只列"给敌人 / 我方干员上常驻效果"的战术卡，用开关切换 ---------------------------------------

  const tabChoice = () => {
    const needle = qOf(q, 'choice');
    const cards = choiceCards(api, view);
    const rows = cards.filter((c) => matchText(c.name, needle) || matchText(c.id, needle));
    const appliedIds = new Set(view.applied.map((a) => a.effectId));
    return html`<div class="sp-dc__body" data-dc-pane="choice">
      <div class="sp-dc__row">
        <span class="sp-dc__label">${'悬赏 / buff'}${HintDot(TIP.choice)}</span>
        <${Button} variant="danger" size="sm" disabled=${busy || !has('clearChoice') || !view.applied.length} onClick=${async () => {
          const ok = await confirmDialog({ title: '清空全部 buff', text: '摘掉本次调试施加的全部悬赏 / 战术决策效果（卡里立刻结算过的部分不会回滚）。', okText: '清空', danger: true });
          if (ok) fire('clearChoice');
        }}>${TXT.clearAll}<//>
      </div>
      <div class="sp-dc__row"><span class="sp-dc__label">${TXT.search}</span>${searchField('choice', '卡名（如 自愈 / 排斥）')}</div>
      ${rows.length ? cap(rows.map((c) => {
        const on = appliedIds.has(c.id);
        return html`<div class="sp-dc__listrow sp-dc__listrow--wrap" key=${c.id} data-dc-choice=${c.id}>
          <span class="sp-dc__rowname">${c.name}</span>
          <span class="sp-dc__rowid">${c.id}</span>
          <span class="sp-dc__rowsub">${c.family + (c.kind === 'terrain' ? '' : c.team ? ' · 全队' : ' · 个人')}</span>
          <span class="sp-dc__rowacts">
            ${Switch({
              on, label: on ? TXT.switchOn : TXT.switchOff,
              disabled: busy || (on ? !has('clearChoice') : !has('applyChoice')),
              onClick: () => fire(on ? 'clearChoice' : 'applyChoice', undefined, c.id),
            })}
          </span>
          ${c.desc ? html`<span class="sp-dc__rowdesc">${c.desc}</span>` : null}
        </div>`;
      })) : html`<p class="sp-dc__hint">${'这一页只列给敌人 / 我方干员上常驻效果的战术卡；当前地图没有可改的地图卡，或数据还没加载完。'}</p>`}
    </div>`;
  };

  const PANES = { state: tabState, basic: tabBasic, chess: tabChess, item: tabItem, wave: tabWave, scale: tabScale, bond: tabBond, choice: tabChoice };

  return html`<${Modal} open=${true} onClose=${props.onClose} title=${'调试控制台'} width="7.6rem"
    actions=${html`<${Button} variant="primary" icon="check" onClick=${props.onClose}>${'关闭'}<//>`}>
    <div class="sp-dc" data-testid="debug-console">
      <div class="sp-dc__tabs" role="tablist" data-testid="debug-console-tabs">
        ${TABS.map((t) => html`<${Button} key=${t.id} variant="ghost" size="sm" active=${tab === t.id}
          data-testid=${'debug-console-tab-' + t.id} onClick=${() => switchTab(t.id)}>${t.label}<//>`)}
      </div>
      ${html`<div class="sp-dc__pane" key=${'pane-' + tab} ref=${paneRef} data-dc-pane-outer=${tab}
        onScroll=${(e) => { scrollTops.current[tab] = e.currentTarget.scrollTop; }}>${(PANES[tab] || tabState)()}</div>`}
      <p class="sp-dc__hint" data-testid="debug-console-hint">${phaseHint(view)}</p>
      <p class="sp-dc__gate" data-testid="debug-console-gate"><${Icon} name="warn" />${'仅单人 / 全 AI 对局可用；多人房里这条入口不出现，服务端也会拒绝。'}</p>
    </div>
  <//>`;
}
