// server/http/routes.js — the node:http request listener. Every response gets the security headers (common.js), then:
// (i18n-ignore-file: the error pages are bilingual by design, 中文 · English — docs/I18N.md)
//
//   * the Mod 管理 API `/admin/api/*` first (MOD SYSTEM — server/admin.js), because it needs POST / OPTIONS and the
//     method gate below only lets GET / HEAD through; then the single-file admin page `/admin`, `/admin/`;
//   * a URL longer than 4096 characters → 414; one that does not parse → 400;
//   * any method but GET / HEAD → 405 with `Allow: GET, HEAD`;
//   * GET /healthz → JSON status (protocol `version`, release `app`, uptime, the served `build`, sockets, sessions,
//     rooms, matches), never cached;
//   * GET /mods → 本进程实际加载的 Mod 快照（含每个 Mod 的 L3 content 入口 URL，浏览器端 registerModContent 用它）。
//     ★ 必须在静态层之前拦：`/mods/` 是静态挂载，裸 `/mods` 会被它抢走并 301 到 `/mods/`（static.js 的挂载规则）。
//   * everything else → the static files (static.js).
// A route that throws is logged and answers 500.

import { PROTOCOL_VERSION, APP_VERSION } from '../../shared/constants.js';
import { ADMIN_PREFIX } from '../admin.js';
import { buildTag } from './buildTag.js';
import { setSecurityHeaders, sendError, sendJson, splitUrl } from './common.js';

const MAX_URL_LENGTH = 4096;

/**
 * The GET /healthz body.
 * @param {{ startedAt: number, network: import('../net.js').Network, registry: import('../net.js').SessionRegistry,
 *           lobby: import('../lobby.js').Lobby }} health
 */
export function healthReport({ startedAt, network, registry, lobby }) {
  return {
    ok: true, version: PROTOCOL_VERSION, app: APP_VERSION, uptimeSec: Math.round((Date.now() - startedAt) / 1000),
    // the runtime the server is serving right now (public/js/ui/buildGuard.js): a page whose own build is
    // older than this reloads itself, so a deploy reaches clients that never reload
    build: buildTag(),
    sockets: network.connectionCount, sessions: registry.size, ...lobby.stats(),
  };
}

/**
 * The request listener for `http.createServer`.
 * @param {{ serveStatic: (req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse,
 *             rawPath: string, query: string) => Promise<void>,
 *           health: Parameters<typeof healthReport>[0], log: object,
 *           admin?: { handle: (req: any, res: any, rawPath: string, query: string) => Promise<boolean> } | null,
 *           adminUi?: ((req: any, res: any) => Promise<void>) | null,
 *           modsInfo?: (() => object) | null }} deps
 * @returns {(req: import('node:http').IncomingMessage, res: import('node:http').ServerResponse) => void}
 */
export function createRequestHandler({ serveStatic, health, log, admin = null, adminUi = null, modsInfo = null }) {
  async function handleRequest(req, res) {
    const url = req.url || '/';
    if (url.length > MAX_URL_LENGTH) { sendError(req, res, 414, '请求地址过长 · URI too long'); return; }
    const parts = splitUrl(url);
    if (!parts) { sendError(req, res, 400, '请求地址无效 · Bad request'); return; }
    // ★ Mod 管理 API（server/admin.js）必须排在方法检查**之前** —— 它要 POST/OPTIONS，
    //   而下面的守门是「只放行 GET/HEAD」。未设 SP_ADMIN_TOKEN 时 admin 为 null，本段零开销、整体 404。
    if (admin && (await admin.handle(req, res, parts.rawPath, parts.query))) return;
    // 单文件管理页：只在管理 API 启用时下发（页面本身不含令牌，也没有部署信息）。
    if (admin && adminUi && (parts.rawPath === '/admin' || parts.rawPath === '/admin/')) {
      await adminUi(req, res);
      return;
    }
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      res.setHeader('Allow', 'GET, HEAD');
      sendError(req, res, 405, '不支持的请求方法 · Method not allowed');
      return;
    }
    if (parts.rawPath === '/healthz') {
      sendJson(req, res, 200, healthReport(health));
      return;
    }
    // GET /mods → 本进程**实际加载**的 Mod 快照（只读、无敏感信息；★ 不回显服务器上的绝对路径）。
    // 玩家客户端靠它拿 L3 content 入口 URL（战斗行为，两端一致）与 client 入口 URL（界面扩展，只跑浏览器）；
    // 管理页靠它对比「磁盘状态 vs 运行中状态」。★ 必须在这里拦：静态层的 `/mods/` 挂载会把裸 `/mods` 301 掉。
    if (modsInfo && parts.rawPath === '/mods') {
      sendJson(req, res, 200, modsInfo());
      return;
    }
    await serveStatic(req, res, parts.rawPath, parts.query);
  }

  return (req, res) => {
    setSecurityHeaders(res);
    handleRequest(req, res).catch((e) => {
      log.error('[http] request failed', e);
      sendError(req, res, 500, '服务器内部错误 · Internal error');
    });
  };
}
