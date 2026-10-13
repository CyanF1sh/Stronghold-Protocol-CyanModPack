// shared/diy.js — 自选编队: a 自选 (DIY) slot filled with an operator. Pure ESM shared by the simulation
// (server/sim/simdata.js getChess(id, { diy })), the server and the client. Data: data/backups.json `units` / `tokens` /
// `diy` (docs/DATA.md §18), composed with shared/standIn.js composeUnitRecord into a record shaped like a data/chess.json
// record, so normalizeChess, resolveLoadout / loadoutRecord and the detail card read it unchanged.
//
// The rules (research 0.2.0 §2; PRTS 卫戍协议, 卫戍协议：盟约 下半/PRTS盟约记录; the owner's decisions of 2026-10-05):
// - two slots per tier, 5 and 6: chess_char_5_diy1/2_a, chess_char_6_diy1/2_a, each with its `_b` elite twin (tier,
//   price, merge of the slot: buy 4, sell 1);
// - the picks of a tier: the owned 6★ outside the chess pool (`diy.ownedPool`: no preset operator, no collab) and the
//   nine 6★ prototypes at both tiers, the six 4★ reserves (not 先锋 / 特种) at tier 5 only (`diy.prototypes[tier]`);
// - a prototype may fill one tier-5 and one tier-6 slot, an owned operator one slot; the two picks of a tier differ;
// - no 特质 (PRTS "甄选加入的干员不会拥有任何特质"); bonds from the operator's factions (`diy.operators[id].bonds`);
// - a slot may name the tiers that **void** its pick (`diy.slots[slotId].voidedByTiers`, a Mod's data: cyanfish.diy-34
//   v1.1.0 makes the tier-3 escort slot void as soon as a tier-5 or tier-6 slot is filled — 要么多名后期高阶干员、要么单个
//   前期护航干员，不可兼得); a void pick is not fielded and never enters the pool (diyVoidedSlots / diyVoidedByTiers,
//   honoured by validateDiyPicks and shared/protocol.js checkDiyPicks). No official slot names tiers ⇒ nothing is void
//   without that data;
// - the normal form is E2 Lv1, skill rank 4, no module; the elite E2 Lv60, rank 7, its module at stage 1 (tier 5) or 3
//   (tier 6) — the slot record's `status` (activity_table diyChessDict) picks the unit form;
// - an owned pick chooses its skill (any of 3) and module (any of its modules, or none — a roster never carries a module
//   whose own effect works in another game mode only: ISW-A "在集成战略中…", SO-A / SO-B "在【岁的界园志异】中…" /
//   "在【沉沦者的黑流树海】中…", RA-A "在生息演算中…" [ASSUMED: not usable outside that mode, the owner's decision of
//   2026-10-05 for ISW-A, the same reason for SO / RA], validateDiyPicks / isDiyModule; the composed record and the sim
//   still field any module, as the kits test them); a prototype carries the skill
//   and module of its 补位 rows at that tier (`diy.locked`: "技能携带规则与系统补位时一致" — [ASSUMED] that reading, the
//   owner's decision of 2026-10-05);
// - an owned pick fights at its player's potential and 练度, as every chess (0.2.2, the owner's decision of 2026-10-08 —
//   default 潜能 6 / 精英2 Lv.60; the backups.json forms carry the lower potentials, shared/potential.js); a prototype
//   pick has neither (`diyProto` on its composed record).
// Which operators have a kit (a pick without one is not offered) is the sim's kit registry
// (server/sim/content/kits/index.js KITTED_CHARS), passed in as `kitted`.

import { composeUnitRecord, unitForm, statusKey } from './standIn.js';
import { atPotential } from './potential.js';

/**
 * The tiers of the 自选 slots the **official data** has — documentation, nothing more. ★ Do **not** use this as a gate:
 * a Mod may add slots of another tier through data/backups.json `diy.slots` (the tiers the loaded data actually has are
 * what `diyTiersOf(data)` returns). This constant stays `[5, 6]` so the official rules stay readable in one place and
 * `tools/golden.mjs`'s 自选 corpus keeps covering exactly the official tiers.
 */
export const DIY_TIERS = Object.freeze([5, 6]);

/**
 * The tiers that have 自选 slots **in `data`**, ascending and without duplicates: the tiers the loaded
 * data/backups.json `diy.slots` actually mentions. With the official data this is `[5, 6]` (= DIY_TIERS); a Mod that
 * adds a tier-3 and a tier-4 slot makes it `[3, 4, 5, 6]`. Every tier rule (the pool of a slot, the shop, the page)
 * reads the data through this, never through DIY_TIERS.
 * @param {DiyData} data
 * @returns {number[]}
 */
export function diyTiersOf(data) {
  const slots = diyOf(data)?.slots ?? {};
  const out = new Set();
  for (const s of Object.values(slots)) if (isObj(s) && Number.isInteger(s.tier)) out.add(s.tier);
  return [...out].sort((a, b) => a - b);
}

/**
 * Whether `data`'s 自选 slots include `tier` (the gate of diyPool; DIY_TIERS is not consulted).
 * @param {DiyData} data @param {number} tier
 */
function hasDiyTier(data, tier) {
  const slots = diyOf(data)?.slots ?? {};
  for (const s of Object.values(slots)) if (isObj(s) && s.tier === tier) return true;
  return false;
}

/**
 * Module types a player's 自选 roster never carries: the modules whose own effect works in one other game mode only — the
 * text "在…中" and battle_equip_table's gate on those parts (`validInGameTag`): the 集成战略 modules ISW-A ("在集成战略中")
 * and the 集成战略 themes' 特勤证章 SO-A / SO-B (电弧 "在【岁的界园志异】中", 机械师 "在【沉沦者的黑流树海】中"; roguelike), the
 * 生息演算 modules RA-A (森蚺 "在生息演算中"; sandbox) [ASSUMED: not usable outside that mode — the owner's decision of
 * 2026-10-05 for ISW-A, the same reason for SO / RA (follow-ups #10, #25)]. A roster rule (validateDiyPicks, the client's
 * picker), like the kit list: checkDiyPick / diyRecordOf still compose any module of the form.
 */
export const DIY_EXCLUDED_MODULE_TYPE = /^(?:ISW|SO|RA)-/;

/**
 * Whether a module of a unit form (`forms[k].modules[]` entry) may be picked for a 自选 piece (DIY_EXCLUDED_MODULE_TYPE).
 * @param {any} mod
 */
export function isDiyModule(mod) {
  return isObj(mod) && typeof mod.uniEquipId === 'string' && !DIY_EXCLUDED_MODULE_TYPE.test(String(mod.typeName ?? ''));
}

/**
 * @typedef {{ charId: string, skillIndex?: number|null, uniEquipId?: string|null }} DiyPick a 自选 pick: the operator,
 *   its skill index (0-based; a prototype's is its locked one) and module (uniEquipId; null / absent / 'none' = none)
 * @typedef {{ charId: string, skillIndex: number, uniEquipId: string|null }} DiyLoadout a checked, complete pick
 * @typedef {{ chess?: Record<string, any>|null, backups?: any, rawChess?: (id: string) => any, rawBackups?: () => any }} DiyData
 *   the game data — `{ chess, backups }` (data/chess.json, data/backups.json) or a sim DataSource (`rawChess(id)`,
 *   `rawBackups()`)
 * @typedef {Iterable<string>|((charId: string) => boolean)|null|undefined} Kitted the charIds with a kit, or a predicate
 */

const isObj = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
const ID = /^[A-Za-z0-9_-]{1,64}$/;
const own = (o, k) => isObj(o) && Object.prototype.hasOwnProperty.call(o, k);

/** data/backups.json of `data`, or null. @param {DiyData|null|undefined} data */
function backupsOf(data) {
  const b = typeof data?.rawBackups === 'function' ? data.rawBackups() : data?.backups;
  return isObj(b) ? b : null;
}
/** The data/chess.json record `id` of `data`, or null. @param {DiyData|null|undefined} data @param {string} id */
function chessOf(data, id) {
  const r = typeof data?.rawChess === 'function' ? data.rawChess(id) : data?.chess?.[id];
  return isObj(r) ? r : null;
}
/** The `diy` part of data/backups.json, or null. @param {DiyData|null|undefined} data */
function diyOf(data) {
  const d = backupsOf(data)?.diy;
  return isObj(d) && isObj(d.slots) ? d : null;
}

/**
 * The 自选 slot a chess id names: its base (normal) id, its tier, the 调度中心 level whose shop lists it (`shopLevel`:
 * activity_table shopLevelDisplayDataDict — the tier-5 slots at level 5, the tier-6 slots at level 6; the tier when the
 * data lacks it) and both records. Null for any other id.
 * @param {string} slotId a slot's normal (`_a`) or elite (`_b`) id
 * @param {DiyData} data
 */
export function diySlot(slotId, data) {
  const diy = diyOf(data);
  if (!diy || typeof slotId !== 'string') return null;
  const baseId = own(diy.slots, slotId) ? slotId : Object.keys(diy.slots).find((id) => diy.slots[id]?.goldenId === slotId);
  const s = baseId ? diy.slots[baseId] : null;
  if (!s) return null;
  const shopLevel = Number.isInteger(s.shopLevel) && s.shopLevel > 0 ? s.shopLevel : s.tier;
  return { baseId, goldenId: s.goldenId, tier: s.tier, shopLevel, elite: slotId !== baseId, normal: chessOf(data, baseId), golden: chessOf(data, s.goldenId) };
}

/**
 * The base ids of the 自选 slots, **ascending by (tier, id)**. The order is the page's section order (the 自选编队 tab
 * groups the slots by their tier in the order the ids come in), so a Mod that adds a lower tier gets it **above** the
 * higher ones (III → IV → V → VI) instead of appending it at the end. With the official data the slots are already in
 * this order (tier 5, then tier 6) ⇒ the result is exactly the data order of DIY_TIERS' two tiers.
 * @param {DiyData} data @returns {string[]}
 */
export function diySlotIds(data) {
  const slots = diyOf(data)?.slots ?? {};
  const tiers = diyTiersOf(data);
  const rank = (id) => {
    const i = tiers.indexOf(slots[id]?.tier);
    return i < 0 ? tiers.length : i; // a slot without a tier: after the tiered ones
  };
  return Object.keys(slots).sort((a, b) => (rank(a) - rank(b)) || (a < b ? -1 : a > b ? 1 : 0));
}

/**
 * The tiers whose picks **void** the pick of `slotId` — `data/backups.json diy.slots[slotId].voidedByTiers`, ascending
 * and without duplicates; `[]` when the slot names none (every official slot, and every slot of a Mod that does not use
 * the key ⇒ nothing is ever void without that data). A slot that names tiers is **the escort of the low tiers**: once
 * another slot of one of those tiers carries a pick in the same roster, the higher tiers win and this slot is left empty
 * (diyVoidedSlots / validateDiyPicks / shared/protocol.js checkDiyPicks). The key is the slot's own, so the rule is a
 * rule of the data (`cyanfish.diy-34` since v1.1.0: the tier-3 slot names `[5, 6]`).
 * @param {DiyData} data @param {string} slotId a slot base id
 * @returns {number[]}
 */
export function diyVoidedByTiers(data, slotId) {
  const v = diyOf(data)?.slots?.[slotId]?.voidedByTiers;
  if (!Array.isArray(v)) return [];
  return [...new Set(v.filter((x) => Number.isInteger(x)))].sort((a, b) => a - b);
}

/**
 * The slots of `picks` whose pick is **void** (diyVoidedByTiers): every filled slot that names tiers, when another
 * filled slot of one of those tiers is in `picks` too. Keys of `picks` are slot base ids; a slot this data does not
 * have, or a null / absent pick, voids nothing (a legacy pick of a slot a Mod no longer ships cannot void the rest).
 * Order: the entries of `picks`. The result is what the client marks 无效 and what the server leaves out of the pool —
 * the caller treats those slots as empty (`validateDiyPicks` skips them, checkDiyPicks drops them).
 * @param {DiyData} data @param {Record<string, any>|null|undefined} picks
 * @returns {string[]}
 */
export function diyVoidedSlots(data, picks) {
  const slots = diyOf(data)?.slots;
  if (!slots || !isObj(picks)) return [];
  const filled = Object.keys(picks).filter((id) => picks[id] != null && own(slots, id));
  const out = [];
  for (const id of filled) {
    const tiers = diyVoidedByTiers(data, id);
    if (tiers.length && filled.some((other) => other !== id && tiers.includes(slots[other]?.tier))) out.push(id);
  }
  return out;
}

/**
 * The key of a DIY owner's summon variants in data/backups.json `tokens[id].variants`: the operator and the slot form.
 * @param {string} charId
 * @param {object} status the slot record's `status`
 */
export function diyTokenOwner(charId, status) {
  return `${charId}@${statusKey(status)}`;
}

/** Whether `charId` is a prototype pick (原型干员) of `tier`. @param {DiyData} data @param {number} tier @param {string} charId */
export function isPrototypePick(data, tier, charId) {
  return (diyOf(data)?.prototypes?.[tier] ?? []).includes(charId);
}

/**
 * The skill / module a prototype carries in a slot of `tier` (`diy.locked`), or null for anyone else.
 * @param {DiyData} data @param {number} tier @param {string} charId
 * @returns {{ skillIndex: number, uniEquipId: string|null }|null}
 */
export function lockedSelection(data, tier, charId) {
  const l = diyOf(data)?.locked?.[tier]?.[charId];
  return isObj(l) && Number.isInteger(l.skillIndex) ? { skillIndex: l.skillIndex, uniEquipId: l.uniEquipId ?? null } : null;
}

/** A `kitted` option as a predicate (no option = everyone). @param {Kitted} kitted @returns {(id: string) => boolean} */
function kittedTest(kitted) {
  if (kitted == null) return () => true;
  if (typeof kitted === 'function') return (id) => !!kitted(id);
  const set = new Set(kitted);
  return (id) => set.has(id);
}

/**
 * The legal picks of a tier: its prototypes (`diy.prototypes[tier]`), then the owned 6★ (`diy.ownedPool`), in data
 * order. With `kitted`, only the operators that have a kit (a pick without one is not offered). The tier is **not**
 * filtered by DIY_TIERS: any tier the data's `diy.slots` has (diyTiersOf) gets its pool, so a Mod's new tier offers
 * exactly the same picks as the official tiers (`ownedPool` + that tier's `prototypes` — empty for a tier without them).
 * @param {number} tier a tier that has 自选 slots in the data
 * @param {{ data: DiyData, kitted?: Kitted }} opts
 * @returns {string[]}
 */
export function diyPool(tier, { data, kitted = null } = { data: null }) {
  const diy = diyOf(data);
  if (!diy || !hasDiyTier(data, tier)) return [];
  const ok = kittedTest(kitted);
  return [...new Set([...(diy.prototypes?.[tier] ?? []), ...(diy.ownedPool ?? [])])].filter(ok);
}

/**
 * Check one pick against a slot and complete it: the operator must be a pick of the slot's tier; a prototype takes its
 * locked skill and module (a different one given is an error); an owned operator needs a skill index of its form and
 * may name a module of its elite form at the slot's stage. Both slot forms must exist in the data.
 * @param {string} slotId a slot's normal or elite id
 * @param {DiyPick|null|undefined} pick
 * @param {DiyData} data
 * @returns {{ ok: true, pick: DiyLoadout } | { error: string }}
 */
export function checkDiyPick(slotId, pick, data) {
  const slot = diySlot(slotId, data);
  if (!slot) return { error: `not a 自选 slot: ${slotId}` }; // i18n-ignore: developer detail
  if (!isObj(pick) || typeof pick.charId !== 'string' || !ID.test(pick.charId)) return { error: `${slot.baseId}: bad pick` };
  const { charId } = pick;
  const diy = diyOf(data);
  const proto = isPrototypePick(data, slot.tier, charId);
  if (!proto && !(diy.ownedPool ?? []).includes(charId)) return { error: `${charId} is not a tier-${slot.tier} 自选 pick` }; // i18n-ignore: developer detail
  const want = pick.skillIndex ?? null;
  const wantMod = pick.uniEquipId === undefined || pick.uniEquipId === 'none' ? null : pick.uniEquipId;
  if (want !== null && !(Number.isInteger(want) && want >= 0 && want <= 9)) return { error: `${charId}: bad skill index ${want}` };
  if (wantMod !== null && (typeof wantMod !== 'string' || !ID.test(wantMod))) return { error: `${charId}: bad module ${wantMod}` };
  const forms = [slot.normal, slot.golden].map((rec) => (rec ? unitForm(backupsOf(data), charId, rec.status) : null));
  if (forms.some((f) => !f)) return { error: `${charId}: no form for ${slot.baseId}` };
  let skillIndex, uniEquipId;
  if (proto) {
    const lk = lockedSelection(data, slot.tier, charId);
    if (!lk) return { error: `${charId}: no locked selection at tier ${slot.tier}` };
    // omitted / null = its locked selection; another skill, another module or an explicit 'none' is refused
    if (want !== null && want !== lk.skillIndex) return { error: `${charId}: a prototype carries skill ${lk.skillIndex} (与系统补位时一致)` }; // i18n-ignore: developer detail
    if (pick.uniEquipId != null && wantMod !== lk.uniEquipId) return { error: `${charId}: a prototype carries module ${lk.uniEquipId ?? 'none'}` };
    ({ skillIndex, uniEquipId } = lk);
  } else {
    if (want === null) return { error: `${charId}: an owned pick needs a skill index` };
    skillIndex = want;
    uniEquipId = wantMod;
  }
  if (!forms.every((f) => (f.skills ?? []).some((s) => s && s.index === skillIndex))) return { error: `${charId}: no skill ${skillIndex}` };
  const elite = forms[1];
  const mod = uniEquipId !== null ? (elite.modules ?? []).find((m) => m && m.uniEquipId === uniEquipId) : null;
  if (uniEquipId !== null && !mod) {
    return { error: `${charId}: no module ${uniEquipId} at stage ${slot.golden?.status?.equipLevel ?? '?'}` };
  }
  return { ok: true, pick: { charId, skillIndex, uniEquipId } };
}

/**
 * A 自选 slot record (either form) filled with a checked pick: composeUnitRecord of the slot's identity (tier, price,
 * merge, status; no 特质) with the operator's form at the slot's status — an owned pick's at `potential` (1–6, default
 * 6: shared/potential.js atPotential) — the pick's skill and module (active on the elite form only), the derived bonds —
 * plus `diyFor` (the slot's base id: the record is a 自选 piece), `charId` (the operator) and, for a prototype pick,
 * `diyProto: true` (no potential, no 练度: shared/potential.js cultivationOf). Null when the pick is not legal for the
 * slot (checkDiyPick) or the data lacks a part.
 * @param {object} slot a DIY chess record (data/chess.json, `isDiy`)
 * @param {DiyPick} pick
 * @param {DiyData} data
 * @param {{ potential?: number|null }} [opts]
 * @returns {object|null}
 */
export function diyRecordOf(slot, pick, data, { potential = null } = {}) {
  if (!isObj(slot) || !slot.isDiy || typeof slot.chessId !== 'string') return null;
  const c = checkDiyPick(slot.chessId, pick, data);
  if (!('ok' in c)) return null;
  const { charId, skillIndex, uniEquipId } = c.pick;
  const backups = backupsOf(data);
  const unit = backups?.units?.[charId] ?? null;
  const proto = isPrototypePick(data, slot.tier, charId);
  const form = unitForm(backups, charId, slot.status);
  const rec = composeUnitRecord(slot, unit, proto ? form : atPotential(form, potential),
    { skillIndex, moduleId: uniEquipId, bonds: diyOf(data)?.operators?.[charId]?.bonds ?? null });
  if (!rec || !rec.skill) return null;
  rec.diyFor = slot.baseId ?? slot.chessId;
  if (proto) rec.diyProto = true;
  return rec;
}

/**
 * The record of a 自选 slot filled with `pick` (diyRecordOf): `elite` = the slot's `_b` form (E2 Lv60, module stage 1 at
 * tier 5 / 3 at tier 6), else the normal form (E2 Lv1, no module); `potential` as diyRecordOf.
 * @param {string} slotId the slot's base id (an elite id is accepted and taken as the elite)
 * @param {DiyPick} pick
 * @param {{ elite?: boolean, data: DiyData, potential?: number|null }} opts
 * @returns {object|null}
 */
export function diyRecord(slotId, pick, { elite = false, data, potential = null } = { data: null }) {
  const slot = diySlot(slotId, data);
  if (!slot) return null;
  return diyRecordOf(elite || slot.elite ? slot.golden : slot.normal, pick, data, { potential });
}

/**
 * The module record `uniEquipId` of `charId`'s elite form at a slot's stage (data/backups.json form `modules[]`), or null.
 * @param {string} slotId @param {string} charId @param {string} uniEquipId @param {DiyData} data
 */
export function diyModuleOf(slotId, charId, uniEquipId, data) {
  const slot = diySlot(slotId, data);
  const form = slot?.golden ? unitForm(backupsOf(data), charId, slot.golden.status) : null;
  return (form?.modules ?? []).find((m) => m && m.uniEquipId === uniEquipId) ?? null;
}

/**
 * Check a whole 自选 roster: `picks` maps slot base ids to a pick (absent / null = an empty slot). Strict: an unknown
 * slot, an illegal pick (checkDiyPick), a module of another game mode (isDiyModule: 集成战略 / 生息演算), an operator without a kit (when `kitted` is
 * given), the same operator twice in one tier, or an owned operator in two slots rejects the roster; a prototype may fill
 * a tier-5 and a tier-6 slot.
 *
 * ★ **作废的自选位**（diyVoidedSlots：`diy.slots[slotId].voidedByTiers` 列出的某个阶已经填了自选）**不是错误**：它按空位处理
 * ——不校验、不进结果，也不让更高阶的 pick 受它牵累（例如同一个 owned 干员先占了作废的那一格）。官方数据里没有任何一个
 * slot 写了这个键 ⇒ 行为与改动前逐值相同。
 * @param {any} picks
 * @param {{ data: DiyData, kitted?: Kitted }} opts
 * @returns {{ ok: true, picks: Record<string, DiyLoadout> } | { error: 'BAD_MSG'|'BAD_TARGET', detail: string }}
 */
export function validateDiyPicks(picks, { data, kitted = null } = { data: null }) {
  if (!isObj(picks)) return { error: 'BAD_MSG', detail: 'bad 自选 picks' };
  const diy = diyOf(data);
  if (!diy) return { error: 'BAD_TARGET', detail: 'no 自选 data' };
  const ok = kittedTest(kitted);
  /** @type {Record<string, DiyLoadout>} */
  const out = {};
  const byTier = new Map();
  const ownedSeen = new Map();
  const voided = new Set(diyVoidedSlots(data, picks));
  for (const [slotId, pick] of Object.entries(picks)) {
    if (voided.has(slotId)) continue; // 被更高阶的自选顶掉 ⇒ 空位
    if (!own(diy.slots, slotId)) return { error: 'BAD_TARGET', detail: `not a 自选 slot: ${slotId}` };
    if (pick == null) continue;
    const c = checkDiyPick(slotId, pick, data);
    if (!('ok' in c)) return { error: 'BAD_TARGET', detail: c.error };
    const { charId } = c.pick;
    if (!ok(charId)) return { error: 'BAD_TARGET', detail: `${charId} has no kit yet` };
    const mod = c.pick.uniEquipId ? diyModuleOf(slotId, charId, c.pick.uniEquipId, data) : null;
    if (mod && !isDiyModule(mod)) return { error: 'BAD_TARGET', detail: `${charId}: ${c.pick.uniEquipId} is a module of another game mode (${mod.typeName}, ${/^RA-/.test(mod.typeName || '') ? '生息演算' : '集成战略'})` };
    const tier = diy.slots[slotId].tier;
    const inTier = byTier.get(tier) ?? new Set();
    if (inTier.has(charId)) return { error: 'BAD_TARGET', detail: `${charId} fills two tier-${tier} slots` };
    inTier.add(charId);
    byTier.set(tier, inTier);
    if (!isPrototypePick(data, tier, charId)) {
      if (ownedSeen.has(charId)) return { error: 'BAD_TARGET', detail: `${charId} fills ${ownedSeen.get(charId)} and ${slotId} (an owned operator fills one slot)` };
      ownedSeen.set(charId, slotId);
    }
    out[slotId] = c.pick;
  }
  return { ok: true, picks: out };
}

