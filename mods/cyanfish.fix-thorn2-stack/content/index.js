// mods/cyanfish.fix-thorn2-stack/content/index.js — 《网页端bug清单v1.0》第④条「引星棘刺一技能叠加」的 L3 修复。
//
// 契约：默认导出 `(api) => void`（`卫戍协议-Mod开发规范.md` §5）。★ 不 import 任何引擎路径。
// ★★ **不改基座一行代码**：只把 battle 实例上的 `addBuff` 包一层，并自己按「覆盖数」重发一份加成。
//
// ---------------------------------------------------------------------------------------------------------------------
// 根因（实测见 <开发期脚本>/probe_bug_fixes.mjs P3 / verify_fix_thorn2_stack.mjs）
// ---------------------------------------------------------------------------------------------------------------------
// 基座 `server/sim/content/kits/tier5.js` 的 `chess_char_5_15_a` kit，一技能的 guard 区每 0.25 s 刷一次：
//
//     for (const a of allies) battle.addBuff(a, { key: 'thorn2:bastion', duration: 0.5, mods: mods({ defFlat: num(bb.def) }) });
//
// key 是**常量** ⇒ 每当有两个炼金单元的范围盖住同一个友方，后一次 `addBuff` 会按「同名 buff 默认替换」
// 把前一次顶掉 ⇒ 只生效一份 +60。实测：两个重叠 zone ⇒ `thorn2:bastion` 只有 1 条、`s.def - base.def = 60`。
//
// 官方文案对照（`data/chess.json`，引星棘刺 skills）：
//   S1 `skchr_thorn2_1`「向友方单位投掷一个炼金单元，在6秒内使落点和周围8格的友方单位防御力+60，
//                       每秒回复相当于攻击力11%的生命值」            ← 无「不叠加」
//   S3 `skchr_thorn2_3`「…防御力-32%，法术抗性-32%（**不叠加**）…」      ← 明确写不叠加
// ⇒ 基座对 S3 用固定 key（`thorn2:sea`）是对的，对 S1 用固定 key 是错的。
//
// ★ 回血**本来就是叠加的**（基座的 `tickSpecial` 是按 zone 逐个调用的，每个 zone 各自 heal 一次）：
//   实测两个 zone 在 1.05 s 内产生 2 条 heal 事件、总量 = 攻击力 × 11% × 2。⇒ 本 Mod 只修防御力。
//
// ---------------------------------------------------------------------------------------------------------------------
// 做法
// ---------------------------------------------------------------------------------------------------------------------
// 1. 包一层 `battle.addBuff`：凡是 `key === 'thorn2:bastion'`（基座的固定 key）**吞掉不应用**，
//    只把 `mods.defFlat` 记下来当作「单个炼金单元的加成值」。
// 2. 自己每 0.25 s（与基座同节奏、同 0.5 s 寿命）扫一遍引星棘刺的存活 guard 区，
//    对每个友方算出**覆盖它的 zone 个数 n**，用一个独立 key（`thorn2:bastion:stack`）发
//    **一份合并后的** `defFlat = 单份 × n` ⇒ 天然叠加，且不依赖引擎对「不同 key 的 mods 是否累加」的语义。
// 3. 覆盖判据与基座逐字一致：`|Δrow| <= 1 && |Δcol| <= 1`（落点 + 周围 8 格）。
//
// 未装本 Mod、或场上没有引星棘刺的一技能炼金单元时 ⇒ 什么都不做，与改动前逐值相同。

/** 引星棘刺的普通形态 id（金色形态 `_b` 的 baseId 也是它）。 */
const THORN = 'chess_char_5_15_a';
/** 基座一技能 guard 区用的固定 buff key —— 本 Mod 拦截并接管的对象。 */
const BASE_KEY = 'thorn2:bastion';
/** 本 Mod 自己发的 key（与基座不同名 ⇒ 不会被基座的下一次刷新顶掉）。 */
const FIX_KEY = 'thorn2:bastion:stack';
/** 与基座 `kits/tier5.js` 的 AURA_IV / AURA_DUR 保持一致（0.25 s 刷、0.5 s 寿命）。 */
const AURA_IV = 0.25;
const AURA_DUR = 0.5;

const num = (v, d = 0) => (typeof v === 'number' && Number.isFinite(v) ? v : (typeof v === 'string' && v.trim() !== '' && Number.isFinite(+v) ? +v : d));
const baseIdOf = (u) => String((u && u.def && (u.def.baseId ?? u.def.chessId ?? u.def.id)) ?? u?.defId ?? '').replace(/_b$/, '_a');

export default function setup(api) {
  api.addInstall((battle) => {
    if (!battle || typeof battle.addBuff !== 'function' || typeof battle.every !== 'function') return;
    const orig = battle.addBuff.bind(battle);

    /** 单个炼金单元的防御力加成（从基座被吞掉的那次 addBuff 里读，不依赖任何数据键）。 */
    let perZone = 0;
    /** 基座是否真的发过这个 buff（= 场上确实有引星棘刺的一技能炼金单元）。 */
    let seen = false;

    battle.addBuff = (unit, buff, ...rest) => {
      if (buff && buff.key === BASE_KEY) {
        const v = num(buff.mods && buff.mods.defFlat, 0);
        if (v > 0) perZone = v;
        seen = true;
        return undefined;               // 吞掉：由下面的循环按覆盖数重发
      }
      return orig(unit, buff, ...rest);
    };

    battle.every(AURA_IV, () => {
      if (!seen || !(perZone > 0)) return;
      for (const t of battle.allyUnits) {
        if (baseIdOf(t) !== THORN) continue;
        const zones = (t.mem && t.mem.zones ? t.mem.zones : []).filter((z) => z && z.type === 'guard');
        if (!zones.length) continue;
        for (const a of battle.alliesFor(t)) {
          let n = 0;
          for (const z of zones) if (Math.abs(a.tileR - z.r) <= 1 && Math.abs(a.tileC - z.c) <= 1) n++;
          if (n > 0) orig(a, { key: FIX_KEY, duration: AURA_DUR, mods: { defFlat: perZone * n } });
        }
      }
    });
  });
}
