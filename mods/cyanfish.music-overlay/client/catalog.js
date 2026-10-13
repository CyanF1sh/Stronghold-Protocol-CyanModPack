// mods/cyanfish.music-overlay/client/catalog.js —— 把宿主素材清单里的「可替换音频」枚举成一张目录表。
//
// 数据来源：`data/assets.json` 的 `audio` 块（浏览器里经 `api.data.get('assets')` 拿到）：
//   · bgm { lobby / prep / combat / unite / boss / combatAlts[] }  —— 背景音乐（长，循环）
//   · bossBgm { [bossId] }                                         —— 各个首领的专属背景音乐（长，循环）
//   · sfx.ui      { click / back / … }                             —— 界面音效（短，一次性）
//   · sfx.battle  { deploy / charDie / heal / leak / … }           —— 战斗音效（短，一次性）
//   · sfx.units   { [charId] { attack / hit / skill(s) / die / born / attacks / hits } } —— 干员音效（短）
// ★ 明确排除：`voice` / `voiceJp`（干员语音）—— 需求里写明不做，且它属于 cyanfish.skinvoice 那条轴。
//
// ★★ 三条设计口径（与 UI/替换层共享，改这里要先想清楚）：
//   1. **按音频文件 URL 去重**：引擎里同一个文件常被多个事件共用（例：很多干员的部署音效共用
//      `b_char_set.mp3`）——它们本就是同一个文件，替换它只能一起换。所以目录**一个 URL 一条**，
//      标签里写清「等 N 处」，不做「看起来能分开、实际换不了」的假控件（§4.12.8.3）。
//   2. **长短分类**：`kind` 只取 'long' / 'short'。长 = 背景音乐（宿主循环播）；短 = 其余（一次性触发）。
//      替换层据此决定「背景音乐的前奏要不要跳过」（见 bridge.js）。
//   3. **零抛**：任何一段结构缺失都只跳过那一段，绝不抛（规范 §1.3）。

/** 目录分组（顺序 = UI 里 set-seg 的顺序；short = 2 个全角字的按钮文案）。 */
export const GROUPS = Object.freeze([
  Object.freeze({ id: 'bgm', title: '背景音乐', short: '背景', kind: 'long' }),
  Object.freeze({ id: 'ui', title: '界面音效', short: '界面', kind: 'short' }),
  Object.freeze({ id: 'battle', title: '战斗音效', short: '战斗', kind: 'short' }),
  Object.freeze({ id: 'unit', title: '干员音效', short: '干员', kind: 'short' }),
]);

/** group → kind。 */
const KIND_OF = Object.freeze({ bgm: 'long', ui: 'short', battle: 'short', unit: 'short' });
/** 分组排序权重。 */
const GROUP_ORDER = Object.freeze(['bgm', 'ui', 'battle', 'unit']);

/** 背景音乐的曲目名（**只用于显示**，不是配置键；配置键始终是 URL）。 */
const BGM_LABEL = Object.freeze({
  lobby: '大厅', prep: '整备', combat: '作战', unite: '联防', boss: '首领',
});

/** 干员音效槽位 → 中文短标签。`skills` / `attacks` / `hits` 按下标补序号。 */
const UNIT_SLOT = Object.freeze({
  attack: '攻击', hit: '受击', skill: '技能', die: '被击倒', born: '部署',
});

/** 把一棵「值可能是字符串 / 数组 / 对象」的树里所有字符串收进 sink。 */
function walkStrings(node, sink) {
  if (typeof node === 'string') { sink.add(node); return; }
  if (Array.isArray(node)) { for (const v of node) walkStrings(v, sink); return; }
  if (node && typeof node === 'object') { for (const k of Object.keys(node)) walkStrings(node[k], sink); }
}

/**
 * 干员语音 URL 集合（`audio.voice` + `audio.voiceJp` 里出现过的所有字符串）。
 * 替换层拿它做**双保险**：即便某条语音与某条音效同 URL，也不换。
 * @param {any} audio assets.json 的 audio 块
 * @returns {Set<string>}
 */
export function collectVoiceUrls(audio) {
  const s = new Set();
  if (!audio || typeof audio !== 'object') return s;
  walkStrings(audio.voice, s);
  walkStrings(audio.voiceJp, s);
  return s;
}

function emptyCounts() {
  const byGroup = {};
  for (const g of GROUPS) byGroup[g.id] = 0;
  return { total: 0, byGroup };
}

/**
 * 枚举整张可替换音频目录。
 * @param {any} manifest `data/assets.json` 的内容（其中 `audio` 块被读取）
 * @param {{ charNames?: Map<string,string>|null }} [opts] `charNames`: charId → 干员显示名（来自 chess.json），
 *   查不到就退回用 charId 当标签
 * @returns {{ entries: Array<object>, voiceUrls: Set<string>, counts: { total:number, byGroup:Record<string,number> }, dropped: number }}
 *   entries[] = `{ id, url, group, kind, label, sub, refs, refCount, introUrl }`
 *   — `id` 与 `url` 相同（目标就是那个音频文件）；`kind` ∈ 'long' | 'short'；
 *     `introUrl` 只对长音效（背景音乐）有值：替换该曲目时它的官方前奏会被跳过（bridge.js）
 */
export function buildCatalog(manifest, { charNames = null } = {}) {
  const audio = manifest && typeof manifest === 'object' ? manifest.audio : null;
  if (!audio || typeof audio !== 'object') {
    return { entries: [], voiceUrls: new Set(), counts: emptyCounts(), dropped: 0 };
  }
  const voiceUrls = collectVoiceUrls(audio);
  /** 被折进「背景音乐」条目前奏的 URL（正常情况下不单独成条目）。 */
  const introUrls = new Set();
  /** url → entry。 */
  const byUrl = new Map();
  let dropped = 0;

  const add = (url, group, label, introUrl) => {
    if (typeof url !== 'string' || !url) { dropped++; return; }
    if (voiceUrls.has(url)) return;                       // ★ 双保险：语音一律不进目录
    const prev = byUrl.get(url);
    if (prev) {
      prev.refCount += 1;
      prev.refs.push(label);
      if (introUrl && !prev.introUrl) prev.introUrl = introUrl;
      return;
    }
    byUrl.set(url, {
      id: url, url, group, kind: KIND_OF[group] || 'short',
      label, sub: '', refs: [label], refCount: 1, introUrl: introUrl || null,
    });
  };

  // ---- 背景音乐（长） ------------------------------------------------------------------------------
  const bgm = audio.bgm && typeof audio.bgm === 'object' ? audio.bgm : {};
  const tracks = [];
  for (const key of ['lobby', 'prep', 'combat', 'unite', 'boss']) {
    if (bgm[key] && typeof bgm[key] === 'object') tracks.push({ label: BGM_LABEL[key] || key, t: bgm[key] });
  }
  const alts = Array.isArray(bgm.combatAlts) ? bgm.combatAlts : [];
  alts.forEach((t, i) => {
    if (t && typeof t === 'object') tracks.push({ label: '开战 ' + (i === 0 ? 'A' : i === 1 ? 'B' : String(i + 1)), t });
  });
  const bossBgm = audio.bossBgm && typeof audio.bossBgm === 'object' ? audio.bossBgm : {};
  for (const id of Object.keys(bossBgm)) {
    if (bossBgm[id] && typeof bossBgm[id] === 'object') {
      tracks.push({ label: '首领曲 ' + String(id).replace(/^boss_/, ''), t: bossBgm[id] });
    }
  }
  for (const tr of tracks) {
    const loop = tr.t.loop;
    if (typeof loop !== 'string' || !loop) { dropped++; continue; }
    const intro = typeof tr.t.intro === 'string' && tr.t.intro ? tr.t.intro : null;
    if (intro) introUrls.add(intro);
    add(loop, 'bgm', tr.label, intro);
  }

  // ---- 界面音效 / 战斗音效（短） --------------------------------------------------------------------
  const sfx = audio.sfx && typeof audio.sfx === 'object' ? audio.sfx : {};
  const ui = sfx.ui && typeof sfx.ui === 'object' ? sfx.ui : {};
  for (const k of Object.keys(ui)) add(ui[k], 'ui', String(k));
  const battle = sfx.battle && typeof sfx.battle === 'object' ? sfx.battle : {};
  for (const k of Object.keys(battle)) add(battle[k], 'battle', String(k));

  // ---- 干员音效（短） ------------------------------------------------------------------------------
  const units = sfx.units && typeof sfx.units === 'object' ? sfx.units : {};
  const nameOf = (defId) => {
    try { const n = charNames && typeof charNames.get === 'function' ? charNames.get(defId) : null; if (n) return String(n); } catch { /* ignore */ }
    return String(defId);
  };
  for (const defId of Object.keys(units)) {
    const rec = units[defId];
    if (!rec || typeof rec !== 'object') continue;
    const nm = nameOf(defId);
    const push = (u, slot) => { if (typeof u === 'string') add(u, 'unit', nm + ' · ' + slot); };
    push(rec.attack, UNIT_SLOT.attack);
    push(rec.hit, UNIT_SLOT.hit);
    push(rec.skill, UNIT_SLOT.skill);
    push(rec.die, UNIT_SLOT.die);
    push(rec.born, UNIT_SLOT.born);
    for (const i of Object.keys(rec.skills || {})) push(rec.skills[i], '技能 ' + (Number(i) + 1));
    for (const i of Object.keys(rec.attacks || {})) push(rec.attacks[i], '技能 ' + (Number(i) + 1) + ' 挥击');
    for (const i of Object.keys(rec.hits || {})) push(rec.hits[i], '技能 ' + (Number(i) + 1) + ' 命中');
  }

  // ---- 收口：合并标签 + 排序 + 计数 -----------------------------------------------------------------
  const entries = [];
  for (const e of byUrl.values()) {
    // 一个「前奏」URL 若同时又是别人的循环段（少见），保留它自己的条目，不当成前奏处理
    if (e.group === 'bgm' && e.refCount > 1) e.label = e.refs.join(' / ');
    if (e.group !== 'bgm' && e.refCount > 1) e.sub = '等 ' + e.refCount + ' 处';
    if (e.group === 'bgm' && e.introUrl && introUrls.has(e.introUrl)) e.sub = '替换后跳过官方前奏';
    entries.push(e);
  }
  entries.sort((a, b) => {
    const d = GROUP_ORDER.indexOf(a.group) - GROUP_ORDER.indexOf(b.group);
    return d !== 0 ? d : a.label.localeCompare(b.label, 'zh');
  });

  const counts = emptyCounts();
  counts.total = entries.length;
  for (const e of entries) counts.byGroup[e.group] = (counts.byGroup[e.group] || 0) + 1;

  return { entries, voiceUrls, counts, dropped };
}
