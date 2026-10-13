// Left team panel (research 06 §11.1, research 09 §3.1): one row per seat — avatar (band icon once picked), name, LP
// tower, status glyph (… acting / ✓ ready / ⌛ deciding / ⚔ combat / door left / ✕ dead), AI badge, "you" marker, the
// field being watched (eye badge), and emote bubbles. In a boss round the viewer's pair is framed in green from the
// round's start (gameLogic teamFrameIds; community report of 2026-10-06, item 51).
// Observing (client-side combat, `observe` prop — the official flow): tapping a teammate's avatar expands a mint
// "前往查看" button under the row (when that teammate can be observed now; otherwise the reason is toasted through
// onWatch); while observing, the own row shows a "返回战场" button. Without `observe` (server-run combat) a click
// watches that player's field at once, and a click while that field is already on screen does not ask again.
// In PHASE.PREP a double-click on a teammate's avatar opens their field (GitHub #131, the 「前往查看」 shortcut).
// It does not open a field the teammate does not have, and it does not open one the click already opened.
// Boss-prep phases (最终攻势 / 隐秘核心) are not PHASE.PREP, so they still use 「前往查看」.
// Live LP (user playtest #3 item 2): during a normal round's battle each row's tower shows lp − the loss that player's
// leaks so far will cost (red, −N): the own row the top bar's live value (`self`, ui/hud.js liveLp), a teammate's row
// m.public players[].pendingLp (server/match/match/views.js, ~1 Hz). 联防 (user playtest #6 item 7): a leaker's row adds the
// runner tag ×N — its enemies still standing on the 联防 field, uncapped and live (falling as the helpers kill them,
// rising when one splits) — next to lp − min(lpCapPerRound, N): the own row the top bar's value, a teammate's row the
// local 联防 replica's count while it is on screen (`uniteLocal`: the battle runner's state().uniteLeft, the same battle
// the player watches, so the number moves with the kills on screen), else m.public players[].uniteLeft (the authority's
// report, ~1 Hz).

import { useEffect, useRef, useState } from '../../vendor/hooks.module.js';
import { PHASE } from '../../../shared/constants.js';
import { html, Icon, Tooltip } from './components.js';
import { PlayerAvatar, LpTower, GIcon, LocalSprite } from './gameComponents.js';
import { EmoteBubble } from './emotes.js';
import { STATUS_META, sortedPlayers, teamFrameIds } from './gameLogic.js';
import { MissTag, uniteRemaining } from './hud.js';
import { localAsset } from '../data.js';
import { t } from '../../../shared/i18n.js';

const cx = (...p) => p.flat().filter(Boolean).join(' ');

/** Official status glyphs (ui/battle) per m.public players[].status; CSS glyph fallback. */
const STATUS_SPRITE = { ready: 'icon_ready', deciding: 'icon_waiting', done: 'icon_complete', dead: 'icon_dead' };

/**
 * A row's LP tower: the settled LP and the pending loss of the round's battle (0 outside COMBAT / UNITE). The own row
 * takes the top bar's live value when there is one (its m.private lp: the same number as the top bar). `left`: during
 * 联防 a leaker's enemies still standing (the ×N tag), else null — for a teammate the local 联防 replica's count when
 * one is given (`uniteLocal`, the runner's state().uniteLeft: { [playerId]: n }, absent = none left; the pending loss
 * is then min(cap, left)), else m.public players[].uniteLeft / pendingLp.
 * @param {any} p m.public players[] entry @param {any} pub m.public
 * @param {{ lp?: number|null, pending: number, unite: boolean, left?: number|null } | null} [self] the own live value (only for the own row)
 * @param {{ uniteLocal?: Record<string, number> | null, cap?: number }} [opts]
 * @returns {{ lp: number|null, pending: number, unite: boolean, left: number|null }}
 */
export function rowLp(p, pub, self = null, { uniteLocal = null, cap = 10 } = {}) {
  const pubLp = Number.isFinite(p?.lp) ? p.lp : null;
  if ((pub?.phase !== PHASE.COMBAT && pub?.phase !== PHASE.UNITE) || p?.alive === false) return { lp: pubLp, pending: 0, unite: false, left: null };
  const lp = self && Number.isFinite(self.lp) ? self.lp : pubLp;
  const leaker = pub.phase === PHASE.UNITE && Array.isArray(pub.unite?.leakers) && pub.unite.leakers.includes(p.playerId);
  const local = !self && leaker && uniteLocal && typeof uniteLocal === 'object' ? uniteRemaining(uniteLocal[p.playerId] ?? 0, null) : null;
  const rawLeft = pub.phase !== PHASE.UNITE ? null : self ? self.left : local != null ? local : p.uniteLeft;
  const left = Number.isFinite(rawLeft) && rawLeft >= 0 ? Math.trunc(rawLeft) : null;
  if (lp == null) return { lp, pending: 0, unite: false, left };
  const raw = self ? self.pending : local != null ? Math.min(cap, local) : p.pendingLp;
  const pending = Math.min(lp, Math.max(0, Math.trunc(Number(raw) || 0)));
  return { lp, pending, unite: (pending > 0 || left != null) && (self ? !!self.unite : pub.phase === PHASE.UNITE), left };
}

/** True when `watching` is already this teammate's field (their live field, or the prep scout `n:<id>`). */
export function teammateFieldShown(watching, player) {
  if (!watching || !player) return false;
  return watching === player.fieldId || watching === `n:${player.playerId}`;
}

/**
 * A single click on a teammate avatar calls onWatch only in server-run combat (no `observe`), and only when
 * that field is not already on screen. A double-click fires click first; the second click, and any later click
 * while the view is already theirs, must not open it again. Client combat never watches from the avatar click.
 * `askedRecently`: this avatar's click already called onWatch in the last moment (the other click of a double-click,
 * before `watching` has re-rendered).
 * @param {{ observe?: unknown, watching?: string|null, player?: { playerId?: string, fieldId?: string }|null, askedRecently?: boolean }} [o]
 * @returns {boolean}
 */
export function teammateClickWatches(o = {}) {
  if (o.observe || o.askedRecently) return false;
  if (teammateFieldShown(o.watching, o.player)) return false;
  return !!o.player;
}

/**
 * Double-click in PHASE.PREP opens a teammate's field, skipping 「前往查看」. False — do not call onWatch — when
 * the phase is not PREP, the row is your own, there is no client-combat `observe` (the click already watched),
 * `canObserve` has no field (do not force a view; the click toasts), or that field is already open.
 * @param {{ phase?: string, self?: boolean, observe?: { canObserve?: (p: any) => { fieldId?: string }|null }|null,
 *   watching?: string|null, player?: any, askedRecently?: boolean }} [o]
 * @returns {boolean}
 */
export function prepDblClickWatches(o = {}) {
  if (o.phase !== PHASE.PREP || o.self || !o.player || !o.observe) return false;
  if (o.askedRecently || teammateFieldShown(o.watching, o.player)) return false;
  const view = (typeof o.observe.canObserve === 'function' ? o.observe.canObserve(o.player) : null) || {};
  return !!view.fieldId;
}

/** How long the second click of a double-click counts as "already asked" before `watching` re-renders. */
const AVATAR_CLICK_GAP_MS = 500;

/**
 * Tooltip of a row's LP tower with a pending loss (null without one).
 * @param {{ lp: number|null, pending: number, unite: boolean, left: number|null } | null} lp rowLp(...)
 * @param {number} [cap] lpCapPerRound
 */
export function rowLpTip(lp, cap = 10) {
  if (!lp || !(lp.pending > 0)) return null;
  if (lp.unite && lp.left != null) return t('目标生命值 {lp}，联防中：漏过的敌人还剩 {left} 个，按现在结算扣除 {pending} 点（每回合至多 {cap} 点）', { lp: lp.lp, left: lp.left, pending: lp.pending, cap });
  return lp.unite ? t('目标生命值 {lp}，联防中，结算时扣除至多 {pending} 点', { lp: lp.lp, pending: lp.pending })
    : t('目标生命值 {lp}，结算时扣除 {pending} 点', { lp: lp.lp, pending: lp.pending });
}

/**
 * Overflow ⇒ `is-scrollable` on `.team`. The CSS hangs the rows' `touch-action: none` — i.e. "`useLeftDrag` owns the
 * drag here" — on that class, so it is applied only while the list really overflows: a room that fits (the official
 * 4 players) keeps the upstream `touch-action` and every other rendering as it was.
 * @param {HTMLElement|null} root the `.team` node
 * @returns {boolean} whether it overflows now
 */
function syncScrollable(root) {
  if (!root) return false;
  const over = root.scrollHeight - root.clientHeight >= 1;
  root.classList.toggle('is-scrollable', over);
  return over;
}

/**
 * The team panel's rows drag the list (user playtest: with many seats the rows run past the viewport, and the
 * scrollbar is silent — see `.team` in css/screens/game.css: it would sit on the emote bubbles' 3.4rem or on the seat
 * badges, so it is not drawn at all). The panel must keep `pointer-events: none` (an upstream invariant: its border
 * box would otherwise swallow the battlefield's clicks) and only the rows are hit-testable, so on a phone the
 * browser's own panning is the only *native* path — and that is exactly one path. Measured on a phone viewport
 * (844x390, 12 seats, the real public/dev/game-mock.html; probe <开发期产物>/probe_team_drag_inputs.mjs; bug list
 * v1.1 item 1, "the phone cannot drag the list once the seats overflow"):
 *   · mouse press-and-drag was confined to the avatar column (the old `clientX <= .team__btn right edge`): the name /
 *     LP side and the info-side row seams dragged 0 px;
 *   · a touch landing in the info-side 5.6 px seam fell through to `.gm__field` (whose `touch-action: none` forbids
 *     scrolling) and scrolled 0 px;
 *   · a pen (`pointerType: 'pen'`) never pans natively and was ignored here: 0 px on every probe;
 *   · and wherever native panning is not on the scroll chain at all there was no fallback whatsoever (0 px on all
 *     four probes) — a single point of failure for the whole feature on a phone.
 * So this hook now owns the drag for **every pointer type over the whole row** (the owner's ruling: widen the
 * draggable column to the whole player-info band), and the CSS turns native panning off for the rows while the list
 * overflows (`.team.is-scrollable .team__row { touch-action: none }`; the cost — no inertia, no native panning
 * inside the panel while it overflows — is written up in the report). While the list fits nothing happens at all: no
 * class, no drag, no `touch-action` change.
 *   · drag zone = a `pointerdown` whose target is inside a `.team__row`: the row box itself plus the `::before` pad
 *     (the `.22rem` gutter and that column's row seams) and the `::after` pad (the seams across the whole row) — the
 *     exact surfaces the CSS paints, by construction (no number duplicated between the two sides);
 *   · a gesture starts to drag only past `SLOP = 4` px (below that it is still a tap, for the touch-tap feel);
 *   · the click the browser sends after the release is swallowed (`MUTE = 400` ms) — otherwise letting go would fire
 *     前往查看 / watch;
 *   · a click landing on the `.22rem` gutter pad is forwarded to that row's button, the same path as tapping the
 *     avatar. The name / LP side keeps upstream behaviour: a click there still does nothing.
 * @param {HTMLElement|null} root the `.team` node (a callback ref: the panel is unmounted while there is no player)
 */
function useLeftDrag(root) {
  useEffect(() => {
    if (!root) return undefined;
    const SLOP = 4;                              // below this the gesture still counts as a click (touch-tap feel)
    const MUTE = 400;                            // after a drag, swallow the click the browser still sends
    let drag = null;                             // { id, y, top, active }
    let muteUntil = 0;
    /** Right edge of the avatar column = the avatar button's right edge (`.22rem` gutter + `.8rem` avatar = `1.02rem`).
     *  ★ It bounds the **click-forwarding** zone only (see `onClick`); the drag zone is the whole row (`onDown`). */
    const avatarRight = () => { const b = root.querySelector('.team__btn'); return b ? b.getBoundingClientRect().right : 0; };
    const onViewport = () => { syncScrollable(root); };
    const onDown = (e) => {
      if (drag) return;                                             // one pointer at a time (a second finger is ignored)
      if (e.pointerType === 'mouse' && e.button !== 0) return;       // mouse: the left button only
      if (!root.classList.contains('is-scrollable')) return;         // nothing overflows: nothing to scroll
      if (!e.target?.closest?.('.team__row')) return;                // only the rows drag; the rest of the panel is inert
      drag = { id: e.pointerId, y: e.clientY, top: root.scrollTop, active: false };
    };
    const onMove = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      const dy = e.clientY - drag.y;
      if (!drag.active) {
        if (Math.abs(dy) < SLOP) return;
        drag.active = true;
        root.classList.add('is-dragging');
      }
      root.scrollTop = drag.top - dy;
      if (e.cancelable) e.preventDefault();
    };
    const onUp = (e) => {
      if (!drag || e.pointerId !== drag.id) return;
      if (drag.active) muteUntil = Date.now() + MUTE;
      drag = null;
      root.classList.remove('is-dragging');
    };
    const onClick = (e) => {
      if (Date.now() < muteUntil) { e.stopPropagation(); e.preventDefault(); return; }
      // Only clicks inside the avatar column's gutter are forwarded; the name / LP side keeps upstream behaviour (no
      // handler, i.e. nothing happens there) — widening the *drag* zone to the whole row must not widen the *click*
      // zone, or a tap on a teammate's name would suddenly open 前往查看.
      if (e.clientX > avatarRight()) return;
      const t = e.target;
      const btn = t?.closest?.('.team__row')?.querySelector('.team__btn');
      if (btn && t !== btn && !btn.contains(t)) { e.stopPropagation(); btn.click(); }
    };
    // `touch-action` is read when a gesture starts, so `is-scrollable` must be in place *before* the finger lands:
    // recomputed here, after every render (the render effect below) and whenever the panel's box changes.
    syncScrollable(root);
    const ro = typeof ResizeObserver === 'function' ? new ResizeObserver(onViewport) : null;
    ro?.observe(root);
    window.addEventListener('resize', onViewport);
    root.addEventListener('pointerdown', onDown);
    root.addEventListener('click', onClick, true);                  // capture: ahead of the button's own onClick
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      ro?.disconnect();
      window.removeEventListener('resize', onViewport);
      root.removeEventListener('pointerdown', onDown);
      root.removeEventListener('click', onClick, true);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [root]);
}

/**
 * @param {{ pub:any, myId:string, watching:string|null, bubbles: Map<string,{id:string,seq:number}>, onWatch:(p:any)=>void,
 *   compact?: boolean, teamLp?: number|null, self?: { lp?: number|null, pending: number, unite: boolean, left?: number|null } | null,
 *   cap?: number, uniteLocal?: Record<string, number> | null,
 *   observe?: null | { canObserve: (p:any) => { fieldId?: string, reason?: string|null, back?: boolean }, observing: boolean, onBack: () => void } }} props
 *   uniteLocal: the local 联防 replica's per-leaker counts while it is on screen (battle runner state().uniteLeft), else null
 */
export function TeamPanel({ pub, myId, watching, bubbles, onWatch, compact = false, observe = null, self: selfLive = null, cap = 10, uniteLocal = null }) {
  const [openPid, setOpenPid] = useState(null);
  const [root, setRoot] = useState(null);           // the `.team` node (callback ref: the panel unmounts on its own)
  useLeftDrag(root);
  // The rows' heights change with every render (more seats, another name wrapping, a row opening its 前往查看 button),
  // so re-decide "overflows ⇒ `is-scrollable`" after each one: the class is what hands the rows' panning to the drag.
  useEffect(() => { syncScrollable(root); });
  // the playerId whose avatar just called onWatch, so the other click of a double-click does not open the view again
  const askedAt = useRef(/** @type {{ id: string|null, at: number }} */ ({ id: null, at: 0 }));
  const phaseKey = `${pub?.phase}:${pub?.round}`;
  useEffect(() => { setOpenPid(null); }, [phaseKey, watching, observe?.observing]);
  const players = sortedPlayers(pub);
  if (!players.length) return null;
  // a boss round: the viewer's pair framed in green from the round's start (item 51 — the official bg_team_border,
  // tinted like the official green; a plain green ring without the local art)
  const team = teamFrameIds(pub, myId);
  const frameArt = team.size ? localAsset('ui/battle', 'bg_team_border') : null;
  const askedRecently = (p) => askedAt.current.id === p?.playerId && Date.now() - askedAt.current.at < AVATAR_CLICK_GAP_MS;
  const noteAsked = (p) => { askedAt.current = { id: p.playerId, at: Date.now() }; };
  const click = (p, self) => {
    if (!observe) {
      // your own row still goes home; a teammate already on screen (or just opened by this double-click) does not
      if (self || teammateClickWatches({ watching, player: p, askedRecently: askedRecently(p) })) {
        if (!self) noteAsked(p);
        onWatch(p);
      }
      return;
    }
    if (self) { if (observe.observing) observe.onBack(); setOpenPid(null); return; }
    const view = observe.canObserve(p) || {};
    if (!view.fieldId) {
      setOpenPid(null);
      if (!askedRecently(p)) { noteAsked(p); onWatch(p); } // the game screen toasts the reason; a double-click toasts once
      return;
    }
    setOpenPid((cur) => (cur === p.playerId ? null : p.playerId));
  };
  const dblClick = (e, p, self) => {
    if (!prepDblClickWatches({ phase: pub?.phase, self, observe, watching, player: p, askedRecently: askedRecently(p) })) return;
    e.preventDefault();
    setOpenPid(null);
    noteAsked(p);
    onWatch(p);
  };
  return html`<aside ref=${setRoot} class=${cx('team', compact && 'team--compact')} aria-label=${t('同盟成员')}>
    ${players.map((p) => {
      const self = p.playerId === myId;
      const status = p.alive === false ? 'dead' : p.status;
      const meta = STATUS_META[status] || STATUS_META.acting;
      const watched = teammateFieldShown(watching, p);
      const bubble = bubbles?.get(p.playerId);
      const offline = p.connected === false && !p.isBot;
      const open = !!observe && openPid === p.playerId && !self;
      const back = !!observe && self && observe.observing;
      const title = observe ? (self ? (observe.observing ? t('返回战场') : t('你自己')) : t('查看 {name} 的战场', { name: p.name })) : (self ? t('查看自己的阵地') : t('查看 {name} 的阵地', { name: p.name }));
      const lp = rowLp(p, pub, self ? selfLive : null, { uniteLocal, cap });
      const inTeam = team.has(p.playerId);
      return html`<div key=${p.playerId} class=${cx('team__row', self && 'is-self', inTeam && 'is-team', watched && 'is-watched', p.alive === false && 'is-dead', open && 'is-open')}>
        <button type="button" class="team__btn" onClick=${() => click(p, self)} onDblClick=${(e) => dblClick(e, p, self)} title=${inTeam && !self ? `${title} · ${t('与你在同一战场')}` : title} aria-expanded=${observe && !self ? String(open) : undefined}>
          <${PlayerAvatar} player=${p} self=${self} />
          ${inTeam ? html`<span class=${cx('team__frame', !frameArt && 'team__frame--plain')} style=${frameArt ? `--frame:url("${frameArt}")` : undefined} aria-hidden="true"></span>` : null}
          <span class="team__seat num">P${(p.seat ?? 0) + 1}</span>
          ${p.isBot ? html`<span class="team__ai">AI</span>` : null}
          ${self ? html`<span class="team__you"><${Icon} name="user" /></span>` : null}
        </button>
        <div class="team__info">
          <span class="team__name">${p.name || t('博士')}</span>
          <div class="team__line">
            <${LpTower} value=${lp.lp} size="sm" tone=${Number.isFinite(lp.lp) && lp.lp - lp.pending <= 5 ? 'danger' : null} pending=${lp.pending}
              tip=${rowLpTip(lp, cap)} />
            ${lp.left != null ? html`<${MissTag} n=${lp.left} name=${self ? null : p.name || t('博士')} />` : null}
            <${Tooltip} text=${offline ? t('连接已断开') : t(meta.text)} placement="right">
              <span class=${cx('team__status', `is-${meta.tone}`, offline && 'is-offline', (offline || STATUS_SPRITE[status]) && localAsset('ui/battle', offline ? 'icon_lost_connect' : STATUS_SPRITE[status]) && 'has-sprite')} aria-label=${t(meta.text)}>
                ${offline ? html`<${LocalSprite} name="icon_lost_connect" fallback=${html`<${Icon} name="wifiOff" />`} />`
                  : STATUS_SPRITE[status] ? html`<${LocalSprite} name=${STATUS_SPRITE[status]} fallback=${html`<${GIcon} name=${meta.glyph} />`} />`
                  : html`<${GIcon} name=${meta.glyph} />`}
              </span>
            <//>
            ${watched && !self ? html`<span class="team__eye" title=${t('正在查看')}><${GIcon} name="eye" /></span>` : null}
          </div>
          ${open ? html`<button type="button" class="btn btn--primary btn--sm team__ob"
            onClick=${() => { setOpenPid(null); onWatch(p); }}><span class="btn__label">${t('前往查看')}</span></button>` : null}
          ${back ? html`<button type="button" class="btn btn--secondary btn--sm team__back"
            onClick=${() => observe.onBack()}><span class="btn__label">${t('返回战场')}</span></button>` : null}
        </div>
        ${bubble ? html`<${EmoteBubble} key=${bubble.seq} id=${bubble.id} class="team__bubble" />` : null}
      </div>`;
    })}
  </aside>`;
}
