// server/index.js — process entry & boot (DESIGN §1, §2). Plain node:http + ws, no framework: startServer() below
// wires the modules under server/http/, in this order —
//
//   http/config.js     ROOT, the served directories, the environment (PORT 3000, HOST '::' dual-stack, TRUST_PROXY auto, DEBUG),
//                      which startServer() options go to net.js / lobby.js, the console logger
//   http/websocket.js  session wiring (SessionRegistry → Lobby → Network) and the WebSocket at /ws (maxPayload 64 KB,
//                      permessage-deflate from 1 KB; refused at upgrade with 404 / 429 per network / 503)
//   http/static.js     the static mounts (/ → public/, /data/, /shared/, /sim/ `.js` only), the /data.js browser stand-in,
//                      the content packs (/packs/index.json, /packs/<id>/<file> — the registry is packs.js)
//   http/media.js      /media/bgm/act1 → public/assets/audio/bgm/act1.mp3 (audio addressed without its extension)
//   http/files.js      one file → response: MIME, brotli / gzip + memory cache, ETag / Last-Modified / 304, Cache-Control, ranges
//   http/assetIndex.js the content hashes of public/assets and public/fonts (built in the background, cached in
//                      .cache/asset-hashes.json by path + size + mtime; Spine models share one hash)
//   http/assetViews.js the served /data/assets.json and /data/local-assets.json: every art URL with its hash segment
//                      (/assets/~<hash>/…, immutable when the hash matches); the committed files stay unchanged
//   http/buildTag.js   the build tag of the served browser runtime (/healthz `build`, public/js/ui/buildGuard.js)
//   http/routes.js     the request listener: security headers, 414 / 400, the Mod 管理 API /admin/api/* and the admin
//                      page /admin (MOD SYSTEM — before the 405 gate: they need POST / OPTIONS), 405, GET /healthz →
//                      JSON status, GET /mods → the loaded Mod snapshot, else static
//   http/traffic.js    the traffic counters: bytes sent per category (assets / audio / code / data) and on the
//                      WebSocket, since the start (GET /healthz?traffic=1)
//   http/common.js     what every answer shares: security headers, URL split, error page, JSON replies, bare 400
//   http/boot.js       a pending update package first (update.js: old files deleted, the install verified against
//                      MANIFEST.json), banner (Local / LAN / tunnel URLs), port-in-use hint, graceful shutdown on SIGINT /
//                      SIGTERM
//
// MOD SYSTEM (我们的 Mod 平台接缝，上游没有；`mods/` 目录 + server/mods/*)：
//   * data:    `SP_MODS` / `opts.modsDir` 指向 Mod 仓库时，server/data.js 在 deepFreeze **之前**合并 data/*.json 补丁，
//              并且**在 listen 之前**把 L3 行为模块装进引擎（await applyModContent）；
//   * /data:   被补丁改过的 `/data/<f>.json` 由 http/static.js 直接下发内存里**合并后**的 JSON（ETag `"mod-<sha1>"`），
//              客户端一行不改就与服务器看到同一份数据；
//   * /mods:   静态挂载回源（content/ 行为模块、client/ 界面扩展、assets/ 美术）；裸 `GET /mods` 由 routes.js 先拦；
//   * /assets: public/assets 未命中时依次回落到各启用 Mod 的 assets/（美术随 Mod 分发）；
//   * /admin:  可选的管理 API（设了 SP_ADMIN_TOKEN 才挂载）—— 上传 / 启停 / 热重载（server/admin.js + tools/mod-admin.html）。
//              另有**管理员只读**的「房间 / 在线明细」：`GET /admin/api/rooms`（工序 69，docs/MODS.md §4.17）。
//   没有 SP_MODS ⇒ 上面每一条都零开销，服务器与上游逐值相同。
//
// Per-network limits for internet clients (see net.js clientAddress; local/LAN peers are exempt): open sockets
// (maxConnectionsPerAddr, refused at upgrade with 429), rooms and running matches (lobby.js).
//
// Programmatic use (tests): `const srv = await startServer({ port: 0, quiet: true }); … await srv.close();`
// The server only auto-listens when this file is the process entry point.

import http from 'node:http';
import { getData, loadData, loadDataMerged, getModReport, getPatchedDataFiles, resetData } from './data.js';
import fsp from 'node:fs/promises';
import path from 'node:path';
import { applyModContent, contentUrlOf } from './mods/content.js';
import { clientUrlOf } from './mods/client.js';
import { ASSETS_SUBDIR } from './mods/loader.js';
import { createModAdmin, resolveAdminToken, ADMIN_PREFIX } from './admin.js';
import { roomDetailSnapshot } from './match/roomDetail.js';
import { readCoop } from './match/coop.js';
import { ROOT, listenAddress, bindCandidates, serveDirs, makeLogger, parseTrustProxy, assetIndexOptionsFrom } from './http/config.js';
import { WS_MAX_PAYLOAD, createSessionStack, attachWebSocket } from './http/websocket.js';
import { DATA_SHIM_JS, buildDataOverrides, createStaticHandler } from './http/static.js';
import { createPackRegistry } from './packs.js';
import { MIME, COMPRESSIBLE, acceptsGzip, pickEncoding, parseRange } from './http/files.js';
import { BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag } from './http/buildTag.js';
import { createRequestHandler } from './http/routes.js';
import { createTrafficCounter } from './http/traffic.js';
import { createAssetIndex } from './http/assetIndex.js';
import { createManifestViews } from './http/assetViews.js';
import { answerClientError, sendError } from './http/common.js';
import { lanUrls, displayHost, isProcessEntry, runMain } from './http/boot.js';
import { PROTOCOL_VERSION, APP_VERSION } from '../shared/constants.js';

// The public API of this module (tests and tools import it from here); the code lives in ./http/.
export {
  ROOT, WS_MAX_PAYLOAD, DATA_SHIM_JS, MIME, COMPRESSIBLE, BUILD_INPUTS, computeBuildTag, buildTag, resetBuildTag,
  acceptsGzip, pickEncoding, parseRange, buildDataOverrides, createStaticHandler, lanUrls, parseTrustProxy,
};

/**
 * Build and start the HTTP + WebSocket server.
 * @param {{
 *   port?: number, host?: string, quiet?: boolean, log?: object,
 *   publicDir?: string, dataDir?: string, sharedDir?: string, packsDir?: string,
 *   MatchClass?: Function, seedFn?: () => number,
 *   lobbyGraceMs?: number, reconnectWindowMs?: number, heartbeatMs?: number, helloTimeoutMs?: number,
 *   ratePerSec?: number, rateBurst?: number, maxConnections?: number, maxRooms?: number,
 *   maxConnectionsPerAddr?: number, maxRoomsPerAddr?: number, maxMatchesPerAddr?: number, resyncMinGapMs?: number,
 *   heavyPerSec?: number, heavyBurst?: number, trustProxy?: 'auto' | boolean, soloReconnectWindowMs?: number,
 *   assetIndex?: boolean | { cacheFile?: string | null, delayMs?: number },
 * }} [opts]
 *   assetIndex: the content-hash index (default on; false or SP_ASSET_INDEX=0: off — config.js assetIndexOptionsFrom)
 * @returns {Promise<{ port: number, host: string, url: string, server: http.Server, wss: import('ws').WebSocketServer,
 *                     lobby: import('./lobby.js').Lobby, network: import('./net.js').Network,
 *                     registry: import('./net.js').SessionRegistry, packs: ReturnType<typeof createPackRegistry>,
 *                     traffic: ReturnType<typeof createTrafficCounter>, assetIndex: ReturnType<typeof createAssetIndex> | null,
 *                     views: ReturnType<typeof createManifestViews> | null, close: () => Promise<void> }>}
 */
export async function startServer(opts = {}) {
  const { port, host } = listenAddress(opts);
  const log = opts.log || makeLogger(!!opts.quiet);
  const { publicDir, dataDir, sharedDir, packsDir } = serveDirs(opts);

  // ---------------------------------------------------------------------------------------------------
  // Mod 层：数据合并（服务器与客户端必须看到同一份）
  // ---------------------------------------------------------------------------------------------------
  // modsDir 优先取 opts，其次 SP_MODS 环境变量；两者都没有 ⇒ 纯原版（行为与改动前完全一致）。
  const modsDir = opts.modsDir !== undefined ? opts.modsDir : (process.env.SP_MODS || null);
  // The process-wide singleton serves the default data dir; a custom dir (tests) gets its own copy.
  // ★ 必须是 `let`：管理页热重载会**换掉**这一份数据（reloadMods），而 createSessionStack 拿到的是取值函数
  //   `() => data`（不是数据本身）—— 否则 Lobby / Match 会一直读到启动时的那份旧数据。
  let data;
  let patched = new Set();
  let modReport = null;
  if (opts.dataDir) {
    const r = loadDataMerged(dataDir, { log, modsDir });
    data = r.data; patched = r.patched; modReport = r.report;
  } else {
    // 走单例：server/sim/content/support/index.js 的 gameData() 也用同一个单例，两端不会各加载一份
    data = getData({ dir: dataDir, log, modsDir });
    patched = getPatchedDataFiles();
    modReport = getModReport();
  }
  const dataOverrides = buildDataOverrides(data, patched);
  if (modReport) {
    const on = modReport.mods.filter((m) => m.enabled);
    log.info?.(`[mods] 共 ${modReport.mods.length} 个 Mod，启用 ${on.length} 个；被补丁的数据文件: ${patched.size ? [...patched].join(', ') : '(无)'}`);
  }
  // L3 行为代码（content/index.js）：**在 listen 之前**装载完（战斗随时可能开始）。无 Mod 仓库 ⇒ 零开销。
  // 与数据单例同一套 modsDir 判定（opts.modsDir，其次 SP_MODS），否则会出现「数据有 Mod、行为没有」的错配。
  await applyModContent(modsDir, { log });
  // 启用 Mod 自带的 assets/ 作为 /assets/ 的兜底搜索根（美术资源随 Mod 分发，不必改 public/）
  // ★ 用「求值函数」而不是数组：管理页热重载后新装的 Mod 美术立刻生效，无需重建 static handler。
  const modAssetDirsOf = (rep) => (modsDir && rep
    ? (rep.mods ?? []).filter((m) => m.enabled && !m.skipped).map((m) => path.join(path.resolve(modsDir), m.id, ASSETS_SUBDIR))
    : []);
  let modAssetDirs = modAssetDirsOf(modReport);
  /** Mod 集合的版本号：管理页热重载时 +1，供客户端判断自己手上的数据是否过期。 */
  let revision = 0;

  // ---------------------------------------------------------------------------------------------------
  // 座位容量（`cyanfish.max-seats` 接缝的服务器侧入口）
  // ---------------------------------------------------------------------------------------------------
  // 每个同盟房间的座位容量：由**合并后的数据** `config.coop.maxSeats` 决定（Mod 可以加这一段；见
  // server/match/coop.js）。基座默认 = 官方的 4。协议边界（setSeatLimit）与客户端座位网格
  // （room.state.maxSeats）都跟这个值走。`opts.maxSeats` 仍然优先，供测试与嵌入式调用。
  // ★ 它是**启动时**决定的：改 `coop.maxSeats` 后要重启（热重载不会重排已存在房间的座位数组）。
  // ★ `seatCeiling` = 房主可在房内调整到的**上限**（room.setSeats）。数据没把 maxSeats 抬过官方 4 时它恒 = 4
  //   ⇒ 房主改不动容量，基座与官方逐值相同。只有默认容量来自数据时才跟随数据；显式传了 opts.maxSeats 就交给
  //   Lobby 按该值推（嵌入/测试调用照旧可用）。
  const coop = readCoop(data?.config);
  const lobbyOpts = { ...opts };
  lobbyOpts.maxSeats = opts.maxSeats != null ? opts.maxSeats : coop.maxSeats;
  if (opts.seatCeiling != null) lobbyOpts.seatCeiling = opts.seatCeiling;
  else if (opts.maxSeats == null) lobbyOpts.seatCeiling = coop.seatCeiling;
  // ★ 单房 AI 队友数上限（工序 105）：与座位容量同一条管道 —— 默认来源只有合并后的 `config.coop.aiCap`
  //   （由 `readCoop` 归一化：缺键 / 非法一律落成 `maxSeats`）。显式传了 `opts.aiCap`（测试 / 嵌入式调用）就以它为准；
  //   `Lobby.addBot` 仍会再夹一次 `min(aiCap, room.maxSeats)`。**不装 Mod ⇒ `coop` 段缺失 ⇒ `coop.aiCap = 4`**，
  //   而官方 4 座房最多 4 个 AI ⇒ 上限不可达 ⇒ 基座与官方逐值相同（连 `ERR.AI_LIMIT` 都发不出来）。
  lobbyOpts.aiCap = opts.aiCap != null ? opts.aiCap : coop.aiCap;

  // 会话栈：data 以**取值函数**交给 Lobby，热重载后它读到的是新对象（见 server/http/websocket.js）。
  const { registry, lobby, network } = createSessionStack(lobbyOpts, { getData: () => data, log });

  // ---------------------------------------------------------------------------------------------------
  // 运行态快照 / 热重载 / Mod 管理 API（server/admin.js）
  // ---------------------------------------------------------------------------------------------------

  /** /data 下各索引文件的条数（管理页与 /mods 共用）。 */
  function countByFile() {
    const c = {};
    for (const name of ['chess', 'enemies', 'stages', 'waves', 'items', 'bonds', 'garrisons', 'tokens', 'effects']) {
      const v = data?.[name];
      if (v && typeof v === 'object') c[name] = Array.isArray(v) ? v.length : Object.keys(v).length;
    }
    return c;
  }

  /** 本进程**实际加载**的 Mod 快照（只读、无敏感信息、无绝对路径）。 */
  function modsRunning() {
    return (modReport?.mods ?? []).map((m) => ({
      id: m.id, name: m.name, version: m.version, author: m.author,
      enabled: m.enabled === true, skipped: m.skipped === true,
      ops: m.ops ?? 0, order: m.order ?? null,
      // L3 行为模块：浏览器端从这里拿入口 URL（客户端本地跑战斗，必须与服务器加载同一份内容）
      content: m.enabled && !m.skipped && m.content ? contentUrlOf(m.id) : null,
      // 客户端界面扩展：只在玩家浏览器里跑（server/mods/client.js 的通道说明）。
      // ★ 停用的 Mod 也下发 null —— 与 content 同一口径：停用就该彻底不出现。
      client: m.enabled && !m.skipped && m.client ? clientUrlOf(m.id) : null,
      // 本 Mod 新建的干员 id：客户端靠它把「本服没有的干员」归因到具体的 Mod（干员调配的导入提示）。
      // 停用的 Mod 也照常下发 —— 正是要靠它说出「这条配置来自已停用的 Mod X」。
      chessIds: Array.isArray(m.chessIds) ? m.chessIds : [],
      errors: m.errors ?? [], warnings: m.warnings ?? [],
    }));
  }

  /** 运行态快照（喂给管理页的 getGameInfo）。 */
  function gameInfo() {
    return {
      ok: true, app: APP_VERSION, version: PROTOCOL_VERSION, startedAt,
      uptimeSec: Math.round((Date.now() - startedAt) / 1000),
      sockets: network.connectionCount, sessions: registry.size, ...lobby.stats(),
      revision, patched: [...patched].sort(), counts: countByFile(),
      reportOk: modReport ? modReport.ok === true : true, modsRunning: modsRunning(),
    };
  }

  /**
   * 热重载 Mod：重置数据单例 → 重新合并 → 重装 L3 内容 → 原地换掉 static handler 看到的两份视图。
   * ★ 不需要重启进程、也不需要任何权限。副作用：**已连接的客户端拿的还是旧数据**
   *   （客户端本地跑战斗，两端必须一致）⇒ 返回里明确提示玩家刷新。
   */
  async function reloadMods() {
    resetData();
    const r = opts.dataDir ? loadDataMerged(dataDir, { log, modsDir }) : null;
    if (r) { data = r.data; patched = r.patched; modReport = r.report; }
    else { data = getData({ dir: dataDir, log, modsDir }); patched = getPatchedDataFiles(); modReport = getModReport(); }
    // 原地更新（createStaticHandler 捕获的是同一个 Map 引用；改用重建会丢掉 gzip/ETag 缓存）
    dataOverrides.clear();
    for (const [k, v] of buildDataOverrides(data, patched)) dataOverrides.set(k, v);
    modAssetDirs = modAssetDirsOf(modReport);
    await applyModContent(modsDir, { log });
    revision += 1;
    const on = (modReport?.mods ?? []).filter((m) => m.enabled && !m.skipped);
    log.info?.(`[mods] 热重载完成（revision ${revision}）：启用 ${on.length} 个 Mod；被补丁的数据文件: ${patched.size ? [...patched].join(', ') : '(无)'}`);
    return {
      revision, modsEnabled: on.length,
      patched: [...patched].sort(), counts: countByFile(), modsRunning: modsRunning(),
    };
  }

  /** `GET /mods` 的响应体（本进程实际加载的 Mod 快照；★ 不回显服务器上的绝对路径）。 */
  function modsInfo() {
    const info = gameInfo();
    return {
      ok: true, app: info.app, startedAt, apiVersion: modReport?.apiVersion ?? null,
      // ★ 曾经这里会把 Mod 仓库的**绝对路径**一并回给客户端（公网可直接读到）——已移除，只回显示用标签。
      //   服务端自己的部署路径只通过管理 API 的 label 暴露，且由服主自定义。
      modsConfigured: !!modsDir, revision: info.revision,
      reportOk: info.reportOk, patched: modReport?.patched ?? [...patched].sort(), counts: info.counts, mods: info.modsRunning,
    };
  }

  /** 可分发单文件管理页（自带内嵌主题，不含任何令牌或部署信息）。 */
  const adminUiPath = (opts.adminUiFile !== undefined ? opts.adminUiFile : path.join(ROOT, 'tools', 'mod-admin.html')) || null;
  const admin = createModAdmin({
    root: ROOT,
    modsDir: modsDir ? path.resolve(modsDir) : null,
    token: resolveAdminToken(process.env),
    log,
    // 实例名默认值住在 server/admin.js（那份文件是 i18n-ignore-file 的运营文本）；这里只在环境变量给了值时才透传，
    // 免得把一个中文字面量带进本文件（test/i18n.test.js 会扫 server/**）。
    ...(process.env.SP_ADMIN_LABEL ? { label: process.env.SP_ADMIN_LABEL } : {}),
    allowRestart: process.env.SP_ADMIN_ALLOW_RESTART === '1' || process.env.SP_ADMIN_ALLOW_RESTART === 'true',
    uiFile: adminUiPath,
    getGameInfo: gameInfo,
    // ★ 房间明细（工序 69，docs/MODS.md §4.17）：管理页「房间 / 在线明细」的数据源 —— `GET /admin/api/rooms`。
    //   与 getGameInfo 同一形状的管道：惰性求值、只在**管理请求**里被调用（`server/admin.js`）⇒ 没设
    //   SP_ADMIN_TOKEN 时 `createModAdmin` 返回 null，本行是**永不执行的死代码** ⇒ 与上游零行为差异。
    //   真值全部来自 lobby 里的 Room / Match 实例（`server/match/roomDetail.js` 只读不存）。
    getRooms: () => roomDetailSnapshot(lobby),
    reload: reloadMods,
  });
  if (admin) log.info?.(`[admin] Mod 管理 API 已启用：${ADMIN_PREFIX}/*（label=${admin.info().label}${admin.info().allowRestart ? '，允许重启进程' : ''}）`);

  /** 下发单文件管理页（README 里也会单独分发同一份文件）。 */
  async function serveAdminUi(req, res) {
    try {
      const buf = await fsp.readFile(adminUiPath);
      res.writeHead(200, {
        'Content-Type': MIME['.html'], 'Content-Length': buf.length, 'Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
      });
      res.end(req.method === 'HEAD' ? undefined : buf);
    } catch {
      // 只给服主看的 404（管理页缺失）；本文件不是 i18n-ignore-file ⇒ 用英文，别落进 i18n 门禁
      sendError(req, res, 404, 'admin UI not installed');
    }
  }
  // content packs (docs/PACKS.md): scanned now — the start log names them — and again whenever their folders change
  const packs = createPackRegistry({ publicDir, dataDir, packsDir }, { log });
  packs.refresh(true);
  // the content hashes of the art (built in the background once listening) and the manifests served with them
  const indexOptions = assetIndexOptionsFrom(opts, publicDir);
  const assetIndex = indexOptions ? createAssetIndex({ publicDir, log, ...indexOptions }) : null;
  const views = assetIndex ? createManifestViews({ dataDir, index: assetIndex, log }) : null;
  const serveStatic = createStaticHandler({
    publicDir, dataDir, sharedDir, packsDir, packs, log, assetIndex, views,
    dataOverrides, modsDir, modAssetDirs: () => modAssetDirs,
  });
  const startedAt = Date.now();
  // The tag is per process (see buildTag): read the browser runtime once, here, not on every /healthz.
  resetBuildTag();
  buildTag();

  const traffic = createTrafficCounter();
  const server = http.createServer(createRequestHandler({
    serveStatic,
    health: { startedAt, network, registry, lobby, traffic, assetIndex, views },
    log,
    trustProxy: network.opts.trustProxy,
    admin,
    adminUi: admin ? serveAdminUi : null,
    modsInfo,
  }));
  server.on('clientError', answerClientError);
  const wss = attachWebSocket(server, { network, log, traffic });

  // The address actually bound. The default may fall back to IPv4; the returned host and url follow that.
  let boundHost;
  try {
    // A host with IPv6 switched off refuses '::'. Fall back to IPv4 rather than not booting. Only the default is
    // retried: an explicit HOST is literal (server/http/config.js bindCandidates).
    let bound = null;
    let lastError = null;
    const candidates = bindCandidates(host);
    for (let i = 0; i < candidates.length; i++) {
      const candidate = candidates[i];
      try {
        await new Promise((resolve, reject) => {
          const onError = (e) => { server.off('listening', onListening); reject(e); };
          const onListening = () => { server.off('error', onError); resolve(); };
          server.once('error', onError);
          server.once('listening', onListening);
          server.listen(port, candidate);
        });
        bound = candidate;
        break;
      } catch (e) {
        lastError = e;
        const retry = ['EAFNOSUPPORT', 'EADDRNOTAVAIL', 'EINVAL'].includes(e.code) && i < candidates.length - 1;
        if (!retry) break;
        log.warn(`[boot] cannot bind ${candidate} (${e.code}) — falling back to IPv4 only`);
      }
    }
    if (bound === null) throw lastError;
    boundHost = bound;
  } catch (e) {
    network.close(); // stop heartbeat/sweep timers of the half-built server
    assetIndex?.close();
    throw e;
  }
  server.on('error', (e) => log.error('[http] server error', e));
  assetIndex?.start();

  const addr = server.address();
  const actualPort = typeof addr === 'object' && addr ? addr.port : port;
  const url = `http://${displayHost(boundHost)}:${actualPort}`;

  let closing = null;
  async function close() {
    if (closing) return closing;
    closing = (async () => {
      try { lobby.shutdown('shutdown'); } catch (e) { log.error('[shutdown] lobby', e); }
      network.close();
      assetIndex?.close();
      await new Promise((resolve) => {
        server.close(() => resolve());
        server.closeIdleConnections?.();
        setTimeout(() => { server.closeAllConnections?.(); }, 500).unref();
      });
      try { wss.close(); } catch { /* ignore */ }
    })();
    return closing;
  }

  return { port: actualPort, host: boundHost, url, server, wss, lobby, network, registry, packs, traffic, assetIndex, views, close };
}

// `node server/index.js` / npm start: listen, print the banner, stop on SIGINT / SIGTERM (http/boot.js).
if (isProcessEntry(import.meta.url)) runMain(startServer);
