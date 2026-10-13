// mods/cyanfish.skinvoice/client/mirrors.js — 素材上游的「回退链」。
//
// ★ 为什么需要它（实测，不是推断）：
//   数据表里的皮肤立绘 / 头像 / 语音都指向 https://raw.githubusercontent.com/…。
//   在浏览器上下文里实测（内部验收脚本）：
//     raw       12 素材：一轮 3 条 ERR_CONNECTION_RESET、中位 2981ms；另一轮中位 569ms、1 条超时  ⇒ 高方差
//     gh-proxy  12/12 100%，中位 515ms，p95 1298ms，立绘+语音都可用                        ⇒ 最佳主链
//     ghfast    12/12 100%，中位 1482ms                                                   ⇒ 次选
//     jsdelivr  6/12  50%，语音 12/12 全 404（jsDelivr 没索引 ArknightsAssets2 的语音文件） ⇒ 不采用
//   ⇒ 主链用反代（快且稳），raw 兜底。链上任何一环挂了自动落到下一环。
//
// ★ 反代是什么：公共的 GitHub raw 反向代理（把 <host>/<完整 raw URL> 原样转发）。
//   它只转发公开转储仓库的公开素材，不接触玩家数据；关掉它也不影响功能（回落到直连）。
//   配置面板里可切「自动 / 仅直连 / 仅反代」。默认 auto = 反代优先 + 直连兜底。
//
// ★ 覆盖范围：本模块同时服务于
//   ① Mod 自己画的 <img>（皮肤卡缩略图）—— 元素级 onError 前进一环；
//   ② 宿主画的 <img>（详情立绘/头像，URL 由 Mod 写进 manifest）—— 靠捕获阶段全局 error 监听前进一环；
//   ③ 语音 <audio> —— 在 voice.js 里逐条换候选。
//
// ★★ 0.9.0 起有个例外要记住：**CN 那 896 条语音已经改成宿主同源** `/assets/audio/voice/cn/…`
//   （见 voice.js 文件头与 内部工序记录）。`toRaw()`（:27-39）**不认**
//   同源路径 ⇒ `candidates()` 对它原样返回单元素链（下面 :56-57 的分支），也就是**自动失去**三级回退。
//   这是设计使然、也是想要的：同一个服务器上的静态文件不需要反代，反代反而是绕远路。
//   ⇒ 本文件现在真正服务的是**皮肤立绘/头像（100% 外网）**与 **JP 那 896 条语音（100% 外网）**。

const RAW_RE = /^https:\/\/raw\.githubusercontent\.com\/([^/]+)\/([^/]+)\/([^/]+)\/(.+)$/;

/** 实测可用的反代，按「中位耗时」排序（见文件头）。 */
export const PROXY_HOSTS = Object.freeze(['gh-proxy.com', 'ghfast.top']);

/** 该 URL 是不是"素材上游"（raw 或我们认识的某个反代）。 */
export function toRaw(url) {
  if (typeof url !== 'string' || !url) return null;
  const m = RAW_RE.exec(url);
  if (m) return url;
  for (const h of PROXY_HOSTS) {
    const p = `https://${h}/`;
    if (url.startsWith(p)) {
      const inner = url.slice(p.length);
      if (RAW_RE.test(inner)) return inner;
    }
  }
  return null;
}

export const isUpstream = (url) => toRaw(url) != null;

/**
 * 一个素材的候选 URL 列表（按尝试顺序）。
 * @param {string} url 任意形态（raw 或已带反代的）
 * @param {'auto'|'raw'|'proxy'} [mode]
 * @returns {string[]} 至少一项；不是上游 URL 就原样返回
 */
export function candidates(url, mode = 'auto') {
  if (typeof url !== 'string' || !url) return [];
  const raw = toRaw(url);
  if (!raw) return [url];
  const proxied = PROXY_HOSTS.map((h) => `https://${h}/${raw}`);
  if (mode === 'raw') return [raw];
  if (mode === 'proxy') return [...proxied, raw];   // 反代挂了也别把人卡死，仍然兜到直连
  return [...proxied, raw];
}

/** 首选 URL（写进 manifest / 塞给 <img> 用的那个）。 */
export function preferred(url, mode = 'auto') {
  const list = candidates(url, mode);
  return list[0] ?? url;
}

/**
 * 当前 URL 失败后，下一个该试的 URL；链走完返回 null（调用方据此画"破图"占位）。
 * @param {string} current 当前（失败）的 URL
 * @param {'auto'|'raw'|'proxy'} [mode]
 */
export function advance(current, mode = 'auto') {
  const raw = toRaw(current);
  if (!raw) return null;
  const list = candidates(raw, mode);
  const i = list.indexOf(current);
  if (i < 0) return list[0] ?? null;      // 不认识的形态 ⇒ 从首选重来一次
  return list[i + 1] ?? null;
}

/**
 * 给**宿主**渲染的 <img> 也装上回退。
 *
 * 原理：资源加载错误事件**不冒泡**，但会在**捕获阶段**经过 window —— 所以用 capture=true
 * 就能听到全页任何 <img> 的失败（包括宿主自己的 .lo-dhead__art img），把 src 换成下一环。
 * 这是零改基座下唯一能救宿主 <img> 的办法（Mod 拿不到宿主的 vnode）。
 *
 * @param {{ getMode?: () => string, log?: object }} [deps]
 * @returns {() => void} 卸载函数
 */
export function installImgFallback({ getMode = () => 'auto', log = console } = {}) {
  if (typeof window === 'undefined') return () => {};
  const onErr = (e) => {
    const el = e?.target;
    if (!el || el.tagName !== 'IMG') return;
    const cur = el.currentSrc || el.getAttribute('src') || '';
    if (!isUpstream(cur)) return;
    const nx = advance(cur, getMode());
    if (!nx) {
      // 链走完：标记成破图，避免调用方反复重试
      try { el.dataset.spBroken = '1'; } catch { /* ignore */ }
      log.warn?.('[skinvoice] 素材上游全部失败，已放弃该图', cur);
      return;
    }
    try { el.dataset.spHop = String(Number(el.dataset.spHop || '0') + 1); } catch { /* ignore */ }
    el.src = nx;
  };
  window.addEventListener('error', onErr, true);
  return () => window.removeEventListener('error', onErr, true);
}

/**
 * 抠成一句话的人类描述（配置面板里显示用）。
 */
export function describe(mode) {
  if (mode === 'raw') return '仅直连 raw.githubusercontent.com（最慢且偶发重置）';
  if (mode === 'proxy') return '仅走反代（快；反代不可用时仍会兜到直连）';
  return '自动：反代优先（实测中位 0.5s）+ 直连兜底';
}
