// mods/cyanfish.skinvoice/client/config.js — 每位玩家自己的皮肤配置。
//
// ★ 作用域：**本机（本浏览器）**。和「技能 / 模组」那条 `loadout` 配置同一层——
//   存在 localStorage，不发给服务器、不影响别人。所以「按玩家切换」是天然成立的：
//   我换成皮肤 B，你看你的还是默认；导入/导出就是把这个对象序列化成 JSON。
//
// 存储键 `sp.pref.skinvoice`（与宿主 settings = sp.pref.settings、loadout = sp.pref.loadout 并列）。
//
// 配置形状（version 1）：
//   {
//     version: 1,
//     skins: { [charId]: skinId },   // 每个干员选的时装；缺省 / null = 官方默认
//     mirror: 'auto',                // ★ 素材上游：'auto' 反代优先+直连兜底 / 'raw' 仅直连 / 'proxy' 仅反代
//     randomEachMatch: false,        // ★★ 局内：每局开始时为所有干员重新随机皮肤（只在该干员已有的时装里抽）
//     randomKeys: ['char_…'],        // ★★ 局外：**上一次「立即随机」写进去的那批干员**
//   }
//
// ★★ 0.15.0（工序 48）**删掉的键**（不要再加回来）：`lang` / `voiceOn` / `throttle` / `officialVoice` /
//   `inBattle`。理由只有一条：**我们不再自己播语音、也不再写官方设置**——
//     · `lang` / `voiceOn` / `throttle`（播放间隔 / 声道模式 / 同时播放上限 / 音量）全都是**我们那套播放器**的参数
//       （`voice.js` 已整文件删除），现在播放、优先级、打断、音量 100% 由官方 `public/js/audio.js` 负责
//       ⇒ 这些键**没有任何读者**，留着就是"点了没反应的假开关"；
//     · `officialVoice` 是"把官方音量写成 0"的档位（`officialvoice.js` 已整文件删除）——
//       ★ 服主口径：**本 Mod 不许改任何官方默认设置**，所以这一档连同它的写回与账本一起退场；
//     · `inBattle` 更早就是死键（战斗内入口已统一到左下角官方设置）。
//   ★ `sanitize()` 对老配置**向前自愈**：上面这些键被静默忽略，`skins` / `mirror` / `random*` 逐值不变
//     ⇒ 已有玩家的时装选择、导入导出对象形状都不受影响（只是少了几个已经没有意义的键）。
//
// ★★ 0.17.0（阶段 0 · 第二半）**又删掉一个键**：`voices`（`{ [charId]: 'auto' | 'CN' | 'JP' }`，
//   「单干员语音语种」那一条轴）。理由：上游 0.2.3 **原生实现了同一个能力**
//   （`public/js/voicePrefs.js` + `public/js/ui/operatorVoice.js`，存 `sp.pref.settings.voiceOverrides`），
//   逐点等价；两份并存时官方那份在 `audio.voice()` **内层**读 `voiceOverrides`、我们那条在**外层**临时
//   改 `audio.voiceLang` ⇒ 10 格真值表里有 2 格我们的设置被**静默吃掉**
//   （上游调研 `内部工序记录` §3.4）⇒ **整条轴删除**，能力交回官方。
//   ★ 老档案里的 `voices` 同样被 `sanitize()` **静默丢弃**。方向是安全的：丢掉 = 全部"跟随全局语种"，
//     与不装本 Mod 逐值相同；玩家在官方那一处（设置 / 干员详情 / 自选槽位卡）设过的档位**不受影响**
//     （它在 `sp.pref.settings.voiceOverrides` 里，我们从头到尾没碰过）。
//
// ★ 为什么不抬 `version`（仍是 1）：`sanitize()` 是**双向自愈**的 —— 老配置缺键 ⇒ 取默认值；
//   新配置被老版本读到时多出来的键被忽略，其余键逐值不变。
//   抬版本号只会让老版本的「导入」多一层"这不是我的版本"的顾虑，换不来任何安全。
//
// ★ mirror 的默认值依据实测（内部验收脚本，12 素材 × 6 候选）：
//   raw 高方差（一轮中位 2981ms + 连接被重置，另一轮 569ms + 1 条超时），
//   gh-proxy 12/12、中位 515ms，ghfast 12/12、中位 1482ms，jsDelivr 语音全 404（不采用）。

const KEY = 'sp.pref.skinvoice';
const VERSION = 1;

/** 把任意输入洗成一个合法配置（导入的文件、手改的 localStorage 都从这里过）。 */
export function sanitize(raw) {
  const o = raw && typeof raw === 'object' ? raw : {};
  const skins = {};
  if (o.skins && typeof o.skins === 'object') {
    for (const [id, sid] of Object.entries(o.skins)) {
      if (typeof id === 'string' && id && typeof sid === 'string' && sid) skins[id] = sid;
    }
  }
  // ★★ 0.17.0：`voices` 那一段（单干员语种）**已删除** —— 这里不再读它，老档案里的这个键被静默丢弃
  //   （= 全部跟随官方全局语种，与不装本 Mod 逐值相同；官方那份逐干员档位在 sp.pref.settings 里，不被触碰）。
  return {
    version: VERSION,
    skins,
    // ★ 只认这三个值；写坏了一律回 'auto'（绝不回退成"仅直连"那种更慢的语义）
    mirror: o.mirror === 'raw' || o.mirror === 'proxy' ? o.mirror : 'auto',
    // ★★ 每局开始随机（默认关：不装/不改配置时行为与改动前一致）
    randomEachMatch: o.randomEachMatch === true,
    // ★★ 上一次「立即随机」写进去的干员（只留还在 skins 里的，其余丢弃 ⇒ 自愈）
    randomKeys: Array.isArray(o.randomKeys)
      ? [...new Set(o.randomKeys.filter((id) => typeof id === 'string' && id && Object.prototype.hasOwnProperty.call(skins, id)))]
      : [],
  };
}

/**
 * 建立配置对象。`read`/`write` 可注入（测试用）；默认读写 localStorage。
 * 每次 set 都会写盘并通知订阅者 ⇒ 界面里的改动**立刻**对供给层生效（实时应用）。
 * @param {{ read?: Function, write?: Function, log?: object }} [deps]
 */
export function createConfig({ read, write, log = console } = {}) {
  const doRead = read || ((k, d) => {
    try { const s = globalThis.localStorage?.getItem(k); return s ? JSON.parse(s) : d; } catch { return d; }
  });
  const doWrite = write || ((k, v) => {
    try { globalThis.localStorage?.setItem(k, JSON.stringify(v)); } catch { /* 隐私模式：内存态照用 */ }
  });

  let state = sanitize(doRead(KEY, null));
  const subs = new Set();

  return {
    /** @returns {ReturnType<typeof sanitize>} */
    get: () => state,
    /** 合并一个补丁（会先 sanitize）。回调签名 (next, prev)，prev 为改动前的快照。 */
    set(patch) {
      const prev = state;
      state = sanitize({ ...state, ...(patch || {}) });
      doWrite(KEY, state);
      for (const fn of [...subs]) { try { fn(state, prev); } catch (e) { log.warn?.('[skinvoice] 订阅回调出错', e); } }
      return state;
    },
    /**
     * ★★ 0.17.0：`setVoice(charId, mode)`（"只改一个干员的语音档位"）**已删除** —— 它写的就是上面那个
     *   已经退场的 `voices` 键。逐干员的语种现在只在**官方**那一处改
     *   （官方设置 → 干员语音 / 干员详情面板 / 自选编队槽位卡；存 `sp.pref.settings.voiceOverrides`）。
     */
    subscribe(fn) { subs.add(fn); return () => subs.delete(fn); },
    /** 导出成可分享的对象。 */
    export() { return { version: VERSION, ...state }; },
    /** 用导入的对象覆盖（返回 true 表示有变化）。 */
    import(raw) { this.set(sanitize(raw)); return true; },
  };
}
