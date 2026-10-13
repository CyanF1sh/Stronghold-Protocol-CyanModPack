// mods/cyanfish.music-overlay/client/section.js —— 本 Mod 在「模组设置」里注册的那一栏「音效替换」。
//
// 布局（规范 §4.12.1：一行一个控件；长说明一律收进「？」小圈；分组用中文小标题）：
//   音效替换
//     ├ 总开关            （host .set-toggle，一行一项，开关里只有「开启 / 关闭」）
//     ├ 分组              （host .set-seg，4 档、每档 2 个全角字：背景 / 界面 / 战斗 / 干员）
//     ├ 搜索              （一行一控件）
//     ├ 状态读数          （会变的短实时值，带 data-* 标记，§4.12.2 二）
//     ├ 条目列表          （内部滚动；每条：名称 + 「等 N 处」+ 选择文件 / 试听 / 移除）
//     └ 全部还原          （动作行；危险动作走 confirmDialog）
//
// ★ 一个条目**一个 URL**（见 catalog.js 的口径）：同一音频文件被多处共用时只出现一次，标签写「等 N 处」。
// ★ 列表一次最多渲染 CAP 条（条目可达近千）—— 超出时提示"输入更精确的关键词"，而不是卡住设置页。
// ★ props 契约：注册表把本组件当**零参组件**渲染（`<${Body} key=${active} />`），所以依赖全靠 index.js
//   在注册时用**闭包**带进来（cfg / clips / catalog / preview / version）。
// ★ 订阅用的是本 Mod 自己的 cfg 与 clips（不是宿主设置）：玩家在别处改了它们，这一栏也同步。

import { installStyle } from './style.js';
import { GROUPS } from './catalog.js';

/** 注册进「模组设置」的栏位 id。 */
export const SECTION_ID = 'music-overlay';
/** 栏位排序：皮肤与语音 20 · 背景音乐（dj-bgm，已归档）30 · 本栏位 40 · 公告 60。 */
export const SECTION_ORDER = 40;
/** 一次最多渲染多少条（条目总数可达近千）。 */
const CAP = 150;
/** 允许的音频扩展名（与 host 的 MIME 表对齐；扩展名不对 ⇒ 浏览器不认成音频）。 */
const AUDIO_EXT = Object.freeze(['.mp3', '.m4a', '.ogg', '.oga', '.opus', '.wav', '.aac', '.mp4', '.webm']);

/**
 * 长说明（**唯一来源**）。规范 §4.12.2 二：≤ 160 全角字、一句一义、不写实现细节、只讲玩家会看到什么。
 */
export const HINTS = Object.freeze({
  on: '打开后本 Mod 才会按下面的替换生效；关掉就整体还原成官方原声（已经选好的文件仍留着，不会被删）。',
  group: '按类别筛选：背景音乐是长音效（循环播放）；界面、战斗、干员是短音效（各自一次性触发）。',
  search: '按干员名、编号或音效名过滤；留空显示本组全部。条目按音频文件去重，同一个文件被多处共用时只列一条。',
  file: '点「选择文件」挑本机一个音频文件替换这一条；「试听」先听一遍；「移除」还原成官方原声。'
    + '文件只存在你自己的浏览器里，不上传服务器，同一局的其它玩家听不到你的替换。',
});

/** ？小圈 —— 规范形状（`docs/MODS.md` §4.12.2 二）；★ 不设原生 title（会与自有气泡重合）。 */
function HintDot({ html, text }) {
  return html`<span class="sp-mo__info" role="img" tabindex="0" aria-label=${text} data-tip=${text}>?</span>`;
}

/**
 * 「音效替换」栏位。
 * @param {{ api:any, cfg:any, clips:any, catalog:any, preview:any, version?:string, audioOk?:boolean }} props
 */
export function MusicOverlaySection({ api, cfg, clips, catalog, preview, version, audioOk = true }) {
  const { html, Button, toast, toastError, confirmDialog } = api.ui;
  const { useState, useEffect, useRef } = api.ui.hooks;

  const [, force] = useState(0);
  const repaint = () => force((n) => n + 1);
  const [group, setGroup] = useState('bgm');
  const [query, setQuery] = useState('');
  const fileRef = useRef(null);
  const pendingRef = useRef(null);

  // 打开这一栏才注入样式（"零痕迹"口径：不打开就一个 <style> 都不加）。
  useEffect(() => { installStyle(); }, []);
  // cfg / clips 变了就重画（替换表、文件增删）。
  useEffect(() => {
    const off1 = cfg.subscribe(() => repaint());
    const off2 = clips.subscribe(() => repaint());
    return () => { try { off1?.(); } catch { /* ignore */ } try { off2?.(); } catch { /* ignore */ } };
  }, []);

  const entries = Array.isArray(catalog?.entries) ? catalog.entries : [];
  const c = cfg.get();
  const targets = c.targets || {};
  const labelOf = (id) => (entries.find((e) => e.id === id)?.label) || id;

  const q = String(query || '').trim().toLowerCase();
  const filtered = entries.filter((e) => {
    if (e.group !== group) return false;
    if (!q) return true;
    return e.label.toLowerCase().includes(q) || String(e.sub || '').toLowerCase().includes(q) || e.url.toLowerCase().includes(q);
  });
  const shown = filtered.slice(0, CAP);

  // ★ 状态读数：只有「配置说被替换」且「IndexedDB 里真有 Blob」才算数（见 store.js 的一致性口径）。
  const replacedCount = Object.keys(targets).filter((id) => clips.has(id)).length;
  const isOn = (e) => c.on === true && targets[e.id] === true && clips.has(e.id);

  /** 选文件：记下目标，然后触发那个隐藏的 file input。 */
  const pick = (id) => {
    pendingRef.current = id;
    const el = fileRef.current;
    if (!el) return;
    try { el.value = ''; } catch { /* ignore */ }
    el.click?.();
  };

  /** file input 的 onChange：校验扩展名 → 存 IndexedDB → 标注替换（顺手开总开关）。 */
  const onFile = async (e) => {
    const el = e.currentTarget;
    const f = el?.files && el.files[0] ? el.files[0] : null;
    const id = pendingRef.current;
    pendingRef.current = null;
    try { el.value = ''; } catch { /* ignore */ }
    if (!f || !id) return;
    const low = String(f.name || '').toLowerCase();
    if (!AUDIO_EXT.some((x) => low.endsWith(x))) {
      try { toastError?.('请选择音频文件（' + AUDIO_EXT.join(' / ') + '）'); } catch { /* ignore */ }
      return;
    }
    try {
      await clips.put(id, f, { name: f.name, type: f.type });
      cfg.set({ on: true, targets: { ...targets, [id]: true } });
      try { toast?.('已替换：' + labelOf(id)); } catch { /* ignore */ }
    } catch (err) {
      try { toastError?.('保存失败：' + (err?.message || err)); } catch { /* ignore */ }
    }
  };

  /** 试听：用独立 <audio> 放上传的 Blob（见 preview.js）。 */
  const doPreview = (id) => {
    const rec = clips.get(id);
    if (!rec || !rec.blob) { try { toastError?.('这条还没有可试听的音频'); } catch { /* ignore */ } return; }
    preview.play(rec.blob);
  };

  /** 移除：删文件 + 取消标注（还原成官方原声）。 */
  const doRemove = async (id) => {
    try { await clips.remove(id); } catch { /* ignore */ }
    cfg.setTarget(id, false);
    try { toast?.('已还原为官方原声'); } catch { /* ignore */ }
  };

  /** 全部还原（危险动作 → confirmDialog；★ 它返回 Promise<boolean>，没有 onConfirm 回调）。 */
  const doReset = async () => {
    let ok = true;
    try {
      ok = await confirmDialog({
        title: '全部还原为官方原声',
        micro: '',                                            // ★ 默认是英文 eyebrow，必须显式传空串
        okText: '全部还原',
        cancelText: '取消',
        danger: true,
        text: '会取消全部替换、让所有声音回到官方原声（已经选好的音频文件仍留在浏览器里，不会被删）。',
      });
    } catch { ok = true; }                                    // 拿不到对话框（宿主没挂 DialogHost）⇒ 直接执行
    if (!ok) return;
    cfg.clearTargets();
    try { toast?.('已全部还原为官方原声'); } catch { /* ignore */ }
  };

  // ---- 渲染 --------------------------------------------------------------------------------------
  if (!entries.length) {
    return html`<div class="sp-mo" data-sp-mo-section="1">
      <p class="sp-mo__empty">没有可替换的音频（读不到游戏素材清单）。</p>
      <p class="sp-mo__ver" data-sp-mo-version=${version ? String(version) : ''}>音效替换 Mod · v${version || '?'}</p>
    </div>`;
  }

  const rows = shown.map((e) => {
    const on = isOn(e);
    return html`<div class="sp-mo__row" key=${e.id} data-sp-mo-row=${e.id} data-sp-mo-on=${on ? '1' : '0'}>
      <div class="sp-mo__rowmain">
        <span class="sp-mo__name">${e.label}</span>
        ${e.sub ? html`<span class="sp-mo__refs">${e.sub}</span>` : null}
      </div>
      <div class="sp-mo__acts">
        ${on ? html`<span class="sp-mo__on">已替换</span>` : null}
        <${Button} size="sm" variant="secondary" class="sp-mo__btn" onClick=${() => pick(e.id)}>选择文件<//>
        ${on ? html`<${Button} size="sm" variant="secondary" class="sp-mo__btn" onClick=${() => doPreview(e.id)}>试听<//>` : null}
        ${on ? html`<${Button} size="sm" variant="secondary" class="sp-mo__btn" onClick=${() => doRemove(e.id)}>移除<//>` : null}
      </div>
    </div>`;
  });

  const stat = '已替换 ' + replacedCount + ' 条 · 本组 ' + filtered.length + ' 条 · 显示 ' + shown.length + ' 条';

  return html`<div class="sp-mo" data-sp-mo-section="1">
    <div class="sp-mo__group" data-sp-mo-group="音效替换">
      <span class="sp-mo__groupname">音效替换</span>
      <div class="set-row">
        <span class="set-row__label">总开关<${HintDot} html=${html} text=${HINTS.on} /></span>
        <button type="button" class=${'set-toggle' + (c.on ? ' is-on' : '')} role="switch"
          aria-checked=${c.on ? 'true' : 'false'} data-sp-mo-switch=${c.on ? 'on' : 'off'}
          onClick=${() => cfg.set({ on: !c.on })}><i></i><span>${c.on ? '开启' : '关闭'}</span></button>
      </div>
      <div class="set-row">
        <span class="set-row__label">分组<${HintDot} html=${html} text=${HINTS.group} /></span>
        <div class="set-seg" role="radiogroup" aria-label="音效分组">
          ${GROUPS.map((g) => html`<button type="button" role="radio" key=${g.id}
            class=${group === g.id ? 'is-on' : ''} aria-checked=${group === g.id ? 'true' : 'false'}
            data-sp-mo-seg=${g.id} onClick=${() => setGroup(g.id)}>${g.short}</button>`)}
        </div>
      </div>
      <div class="set-row">
        <span class="set-row__label">搜索<${HintDot} html=${html} text=${HINTS.search} /></span>
        <div class="sp-mo__ctl">
          <input class="sp-mo__search" type="search" value=${query} data-sp-mo-search=${group}
            placeholder="干员名 / 编号 / 音效名" onInput=${(e) => setQuery(e.currentTarget.value)} />
        </div>
      </div>
      <div class="set-row">
        <span class="set-row__label">说明<${HintDot} html=${html} text=${HINTS.file} /></span>
        <div class="sp-mo__ctl">
          <${Button} size="sm" variant="secondary" data-sp-mo-reset="1" onClick=${doReset}>全部还原<//>
        </div>
      </div>
    </div>
    ${audioOk ? null : html`<p class="sp-mo__warn">拿不到游戏音频通道，本 Mod 暂时不生效（不会双播、也不出声）。</p>`}
    <p class="sp-mo__stat" data-sp-mo-stat=${`${group}:${replacedCount}:${filtered.length}:${shown.length}`}>${stat}</p>
    <div class="sp-mo__list" data-sp-mo-list=${group}>
      ${rows.length ? rows : html`<p class="sp-mo__empty">本组没有匹配的条目。</p>`}
    </div>
    ${filtered.length > CAP ? html`<p class="sp-mo__stat" data-sp-mo-more=${filtered.length - CAP}>还有 ${filtered.length - CAP} 条，请输入更精确的关键词。</p>` : null}
    <input ref=${fileRef} class="sp-mo__file" type="file" accept="audio/*" onChange=${onFile} />
    <p class="sp-mo__ver" data-sp-mo-version=${version ? String(version) : ''}>音效替换 Mod · v${version || '?'}</p>
  </div>`;
}
