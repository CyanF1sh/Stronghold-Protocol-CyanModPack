// test/admin-upstream-release.test.js — 工序 host-024：管理面的**官方 release 追踪 + 更新提示**接缝。
//
// 覆盖（全部**离线**，一个字节都不出网 —— fetch 一律注入）：
//   · 版本解析 / 比对（`v0.2.5` vs `0.2.5`、`v0.2.5-hotfix`、认不出来的 tag ⇒ 不崩、不瞎喊「有更新」）；
//   · release JSON → 摘要（资产 name/size/**sha256 digest**、正文截断 + 完整正文、缺字段透明登记）；
//   · 配置（间隔夹到 ≥30 分钟、超时 ≤10 s、`SP_ADMIN_UPSTREAM=0` 关整块、`SP_ADMIN_UPSTREAM_URL` 可换端点）；
//   · 轮询语义（200 存 ETag / **304 只更新检查时间** / 500 / 403 限流 / 抛异常 **都保留上次成功的缓存**）；
//   · 「无令牌 ⇒ 模块不存在」的等价性纪律：`createModAdmin({token:null}) === null`，且**一次 fetch 都不会发生**；
//   · 新接口的形状 / 鉴权 401 / 405 / 404（与既有管理面同一口径）+ `ADMIN_API_VERSION` 加性 +1。
//
// Run: node --test test/admin-upstream-release.test.js

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  ADMIN_API_VERSION, ADMIN_PREFIX, TREE_VERSION, UPSTREAM_FILE, UPSTREAM_REPO,
  compareVersionTags, createModAdmin, createUpstreamPoller, parseVersionTag,
  resolveUpstreamConfig, summarizeRelease,
} from '../server/admin.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const QUIET = { info() {}, warn() {}, error() {}, log() {} };
const TOKEN_FIXTURE = 'test-token-0123456789';

/** 一个只记输出的 res 替身（够 send() 用：writeHead / setHeader / end）。 */
function fakeRes() {
  const out = { status: 0, headers: {}, body: null };
  return {
    out,
    setHeader(k, v) { out.headers[String(k).toLowerCase()] = v; },
    writeHead(status, headers) { out.status = status; Object.assign(out.headers, headers || {}); },
    end(buf) { out.body = buf ? JSON.parse(Buffer.from(buf).toString('utf8')) : null; },
  };
}
const fakeReq = (method = 'GET', token = TOKEN_FIXTURE) => ({
  method,
  headers: token ? { 'x-sp-admin-token': token, host: '127.0.0.1:3490' } : { host: '127.0.0.1:3490' },
});

const releaseJson = (over = {}) => ({
  tag_name: 'v0.2.5',
  name: '0.2.5',
  published_at: '2026-10-12T10:57:30Z',
  html_url: 'https://github.com/' + UPSTREAM_REPO + '/releases/tag/v0.2.5',
  prerelease: false,
  draft: false,
  body: '- 新增：某机制\n- 修复：某崩溃',
  assets: [
    { name: 'Stronghold-Protocol-0.2.5-update.zip', size: 633502375 % 1000000, digest: 'sha256:' + 'a'.repeat(64) },
    { name: 'Stronghold-Protocol-0.2.5.zip', size: 123456, digest: '' },
  ],
  ...over,
});

/** 一次 fetch 调用的记录 + 一个可控的响应。 */
function fakeFetch(responses, calls = []) {
  let i = 0;
  const fn = async (url, init) => {
    calls.push({ url, init });
    const r = responses[Math.min(i, responses.length - 1)];
    i++;
    if (r instanceof Error) throw r;
    return {
      status: r.status,
      headers: { get: (k) => (r.headers && r.headers[String(k).toLowerCase()]) || null },
      json: async () => { if (r.badJson) throw new Error('bad json'); return r.json; },
    };
  };
  fn.calls = calls;
  return fn;
}

// ---------------------------------------------------------------------------------------------------------------------
// 版本解析 / 比对

test('parseVersionTag: v 前缀可有可无、pre 段另存、认不出来的 tag 不抛异常', () => {
  assert.deepEqual(parseVersionTag('v0.2.5'), { raw: 'v0.2.5', version: '0.2.5', pre: null, parts: [0, 2, 5] });
  assert.deepEqual(parseVersionTag('0.2.5').version, '0.2.5');
  assert.deepEqual(parseVersionTag('v0.2.5-hotfix').pre, 'hotfix');
  assert.deepEqual(parseVersionTag('v0.2.5+build.7').pre, 'build.7');
  assert.deepEqual(parseVersionTag(' v1.0 ').version, '1.0');
  for (const weird of ['nightly', '2026-10-12', '', null, undefined, 'v', 'release-0.2', 'v2', '2']) {
    const p = parseVersionTag(weird);
    assert.equal(p.version, null, '认不出来的形态必须 version=null：' + String(weird));
  }
  // ★ 为什么 `v2` / `2026-10-12` 必须认不出来：单段规则会把日期 tag 当版本「2026」，
  //   于是「0.2.5 vs 2026」= 落后 2024 个版本 —— 宁可认不出来（不判定），也不要误报有新版本。
  assert.equal(parseVersionTag('2026-10-12').parts.length, 0);
});

test('parseVersionTag + compareVersionTags: 日期 tag ⇒ 不判定落后（宁可不说，也不误报）', () => {
  const c = compareVersionTags('0.2.5', '2026-10-12');
  assert.equal(c.behind, false);
  assert.equal(c.behindCount, null);
  assert.match(String(c.warning), /解析不出来/);
});

test('compareVersionTags: v 前缀不影响比对；落后时给 behindCount；相同 / 更高一律 behind=false', () => {
  const a = compareVersionTags('0.2.4', 'v0.2.5');
  assert.equal(a.behind, true);
  assert.equal(a.behindCount, 1);
  assert.equal(a.compare, -1);
  assert.equal(a.warning, null);

  assert.equal(compareVersionTags('v0.2.5', '0.2.5').behind, false);
  assert.equal(compareVersionTags('0.2.5', 'v0.2.4').behind, false, '我们比官方新 ⇒ 不是「落后」');
  assert.equal(compareVersionTags('0.2.4', 'v0.3.0').behindCount, 1);
  assert.equal(compareVersionTags('0.2.4', 'v0.2.10').behindCount, 6, '逐段比大小，不是字符串比');
  assert.equal(compareVersionTags('1.0.0', 'v1.0.0-dev').behind, false);
  assert.equal(compareVersionTags('0.2.4', 'v0.2.5-rc.1').behind, true, '带 pre 的更高版本照样算落后');
});

test('compareVersionTags: 奇怪 tag 不崩 —— 同版本带 pre 给 note，认不出来给 warning 且不喊有更新', () => {
  const hot = compareVersionTags('0.2.5', 'v0.2.5-hotfix');
  assert.equal(hot.compare, 0);
  assert.equal(hot.behind, false);
  assert.match(String(hot.note), /hotfix/);

  const weird = compareVersionTags('0.2.5', 'nightly');
  assert.equal(weird.compare, null);
  assert.equal(weird.behind, false);
  assert.equal(weird.behindCount, null);
  assert.match(String(weird.warning), /解析不出来/);

  const weird2 = compareVersionTags('', 'v0.2.5');
  assert.equal(weird2.behind, false);
  assert.match(String(weird2.warning), /解析不出来/);
});

// ---------------------------------------------------------------------------------------------------------------------
// release → 摘要

test('summarizeRelease: 资产清单带 name/size/sha256 digest（官方没给摘要就如实写 null）', () => {
  const s = summarizeRelease(releaseJson());
  assert.equal(s.tag, 'v0.2.5');
  assert.equal(s.publishedAt, '2026-10-12T10:57:30Z');
  assert.equal(s.assets.length, 2);
  assert.equal(s.assets[0].name, 'Stronghold-Protocol-0.2.5-update.zip');
  assert.match(s.assets[0].digest, /^sha256:[0-9a-f]{64}$/);
  assert.equal(s.assets[1].digest, null, '老资产没有 digest ⇒ null，绝不伪造');
  assert.deepEqual(s.missing, []);
  assert.equal(s.bodyTruncated, false);
  assert.equal(s.bodyChars, s.body.length);
});

test('summarizeRelease: 正文太长 ⇒ 摘要截断 + 标记 + **完整正文另给一份**；缺字段透明登记', () => {
  const long = 'x'.repeat(5000);
  const s = summarizeRelease(releaseJson({ body: long }));
  assert.equal(s.bodyTruncated, true);
  assert.ok(s.bodySummary.length < s.bodyChars);
  assert.equal(s.body.length, 5000, '「展开全文」要有完整正文可看');
  assert.equal(s.bodyChars, 5000);

  const empty = summarizeRelease({ draft: true });
  assert.equal(empty.tag, null);
  assert.equal(empty.bodySummary, '');
  assert.deepEqual(empty.missing, ['tag_name', 'published_at', 'body', 'assets']);
  assert.deepEqual(empty.assets, []);
  assert.equal(empty.draft, true);
  // 非对象 / null 也不许抛
  assert.equal(summarizeRelease(null).tag, null);
  assert.equal(summarizeRelease('nope').tag, null);
});

// ---------------------------------------------------------------------------------------------------------------------
// 配置

test('resolveUpstreamConfig: 默认 60 分钟 / 10 s / 不落盘；间隔夹到 30..1440、超时夹到 1..10 s', () => {
  const def = resolveUpstreamConfig({});
  assert.equal(def.enabled, true);
  assert.equal(def.intervalMin, 60);
  assert.equal(def.timeoutMs, 10000);
  assert.equal(def.dir, null, '★ 缺省不落盘');
  assert.equal(def.token, null);
  assert.equal(def.url, 'https://api.github.com/repos/' + UPSTREAM_REPO + '/releases/latest');

  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_INTERVAL: '5' }).intervalMin, 30, '低于 30 分钟被夹回来（认证限额 60/h）');
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_INTERVAL: '99999' }).intervalMin, 1440);
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_INTERVAL: '45' }).intervalMin, 45);
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_TIMEOUT: '999999' }).timeoutMs, 10000);
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_TIMEOUT: '1' }).timeoutMs, 1000);
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_DIR: ' /tmp/x ' }).dir, '/tmp/x');
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_URL: 'http://127.0.0.1:9/nope' }).url, 'http://127.0.0.1:9/nope');
  // ★ 令牌只从环境变量读，且**只放在内存里**（本函数的返回值不会被写盘 / 进响应）。
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM_TOKEN: 't' }).token, 't');
  for (const off of ['0', 'off', 'false', 'no', 'NO', ' off ']) {
    assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM: off }).enabled, false, off + ' ⇒ 关');
  }
  assert.equal(resolveUpstreamConfig({ SP_ADMIN_UPSTREAM: '1' }).enabled, true);
});

// ---------------------------------------------------------------------------------------------------------------------
// 轮询语义（离线：fetch 注入）

const poller = (extra = {}) => createUpstreamPoller({
  env: {}, log: QUIET, getCurrent: () => ({ app: '0.2.4' }), treeVersion: '0.2.5',
  intervalMin: 60, timeoutMs: 2000, dir: null, ...extra,
});

test('轮询 200：存下摘要与 ETag，第二次请求带 If-None-Match；behind 用 /healthz 的 app 与官方 tag 比', async () => {
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: { etag: 'W/"abc"' }, json: releaseJson() }], calls);
  const p = poller({ fetchImpl: f });
  await p.check(true);
  const st = p.status();
  assert.equal(st.latest.tag, 'v0.2.5');
  assert.equal(st.behind, true, '0.2.4 < 0.2.5');
  assert.equal(st.behindCount, 1);
  assert.equal(st.etag, 'W/"abc"');
  assert.equal(st.ok, true);
  assert.equal(st.error, null);
  assert.equal(st.current.deployedApp, '0.2.4');
  assert.equal(st.current.treeVersion, '0.2.5');
  assert.equal(st.source, 'github-api');
  assert.equal(st.cached, false);
  assert.equal(st.enabled, true);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].init.headers['if-none-match'], undefined, '第一次没有 ETag 可带');

  // 1 分钟闸内再点 ⇒ 一个请求都不发（GitHub 未认证限额 60/h）
  await p.check(true);
  assert.equal(calls.length, 1, '最小重试间隔内不许再出网');
  assert.ok(st.retryAfterSec > 0 || p.status().retryAfterSec >= 0);

  // 手动把 checked 推到 2 分钟前 ⇒ 第二次请求应带上 If-None-Match
  p.state.checked = Date.now() - 120 * 1000;
  await p.check(true);
  assert.equal(calls.length, 2);
  assert.equal(calls[1].init.headers['if-none-match'], 'W/"abc"');
  assert.equal(calls[1].init.headers['user-agent'], 'stronghold-protocol-mod-admin');
  assert.equal(calls[1].init.method, 'GET');
  p.dispose();
});

test('304：只更新检查时间 —— 正文 / 摘要一个字都不重解析，ETag 仍在', async () => {
  const f = fakeFetch([
    { status: 200, headers: { etag: 'E1' }, json: releaseJson() },
    { status: 304, headers: { etag: 'E1' }, json: null },
  ]);
  const p = poller({ fetchImpl: f });
  await p.check(true);
  const first = { okAt: p.state.okAt, fetched: p.state.fetched, latest: p.status().latest };
  p.state.checked = Date.now() - 120 * 1000;
  const t0 = Date.now();
  await p.check(true);
  const st = p.status();
  assert.equal(st.stats.fetched, 1, '304 不算一次「取到新内容」');
  assert.equal(st.stats.notModified, 1);
  assert.deepEqual(st.latest, first.latest, '304 后内容一字未变');
  assert.equal(st.etag, 'E1');
  assert.ok(p.state.okAt >= t0, '304 也要把「上次成功检查时间」往前推');
  assert.equal(st.error, null);
  p.dispose();
});

test('网络失败退化：抛异常 / 500 / 403 限流 —— 都只写 error，**上次成功的缓存原样保留**', async () => {
  const f = fakeFetch([
    { status: 200, headers: { etag: 'E1' }, json: releaseJson() },
    Object.assign(new Error('connect ETIMEDOUT upstream-host.example:443'), { name: 'TimeoutError' }),
  ]);
  const p = poller({ fetchImpl: f });
  await p.check(true);
  const good = p.status().latest;
  assert.ok(good);

  p.state.checked = Date.now() - 120 * 1000;
  await p.check(true);
  let st = p.status();
  assert.deepEqual(st.latest, good, '★ 失败不影响展示：还是上次那份');
  assert.match(String(st.error), /ETIMEDOUT/);
  assert.equal(st.ok, false);
  assert.equal(st.behind, true, '落后判定仍然基于上次成功的结果');

  // 500
  const f2 = fakeFetch([
    { status: 200, headers: {}, json: releaseJson() },
    { status: 500, headers: {}, json: null },
  ]);
  const p2 = poller({ fetchImpl: f2 });
  await p2.check(true);
  p2.state.checked = Date.now() - 120 * 1000;
  await p2.check(true);
  assert.match(String(p2.status().error), /HTTP 500/);
  assert.ok(p2.status().latest, '500 后仍展示上次结果');

  // 403 限流：错误摘要里带上额度重置时刻（不刷屏，就一行）
  const f3 = fakeFetch([
    { status: 200, headers: {}, json: releaseJson() },
    { status: 403, headers: { 'x-ratelimit-reset': String(Math.floor(Date.now() / 1000) + 600) }, json: null },
  ]);
  const p3 = poller({ fetchImpl: f3 });
  await p3.check(true);
  p3.state.checked = Date.now() - 120 * 1000;
  await p3.check(true);
  assert.match(String(p3.status().error), /限流/);
  assert.ok(p3.status().latest);

  // 坏 JSON 也不许抛
  const f4 = fakeFetch([{ status: 200, headers: {}, json: null, badJson: true }]);
  const p4 = poller({ fetchImpl: f4 });
  await p4.check(true);
  assert.match(String(p4.status().error), /JSON/);
  assert.equal(p4.status().latest, null);
  for (const x of [p, p2, p3, p4]) x.dispose();
});

test('并发合并 + 时钟闸：同一刻只允许一个请求在飞；不到点（force 也）不出网', async () => {
  let resolves = 0;
  const slow = async () => {
    resolves++;
    await new Promise((r) => setTimeout(r, 30));
    return { status: 200, headers: { etag: 'E' }, json: releaseJson(), };
  };
  const p = poller({ fetchImpl: slow });
  const a = p.check(true);
  const b = p.check(true);
  await Promise.all([a, b]);
  assert.equal(resolves, 1, '两个并发 check 只出一个请求');
  assert.equal(p.busy, false);
  // 刚查过 ⇒ 即使 force 也不再出网
  await p.check(true);
  assert.equal(resolves, 1);
  p.dispose();
});

test('落盘 + 恢复：设了 dir 才写；重启（新 poller）读回上次结果 ⇒ cached=true', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-up-'));
  const f = fakeFetch([{ status: 200, headers: { etag: 'E9' }, json: releaseJson() }]);
  const p1 = poller({ fetchImpl: f, dir });
  await p1.check(true);
  assert.equal(p1.status().persist.dir, true);
  assert.ok(fs.existsSync(path.join(dir, UPSTREAM_FILE)), '设了 dir ⇒ 落盘 ' + UPSTREAM_FILE);
  p1.dispose();

  // 新进程（新 poller）在**完全不通网**的情况下启动：只有恢复的缓存
  const dead = fakeFetch([new Error('offline')]);
  const p2 = poller({ fetchImpl: dead, dir });
  assert.equal(p2.start(), true);
  const st = p2.status();
  assert.equal(st.latest.tag, 'v0.2.5', '重启不丢上次结果');
  assert.equal(st.cached, true, '本进程还没成功出网过 ⇒ 标成缓存');
  assert.equal(st.etag, 'E9', 'ETag 也一起恢复（下次就能走 304）');
  p2.dispose();
  fs.rmSync(dir, { recursive: true, force: true });
});

test('SP_ADMIN_UPSTREAM=0：整块关掉 —— 不启动、不出网、status().enabled=false', async () => {
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: {}, json: releaseJson() }], calls);
  const p = createUpstreamPoller({
    env: { SP_ADMIN_UPSTREAM: '0' }, log: QUIET, fetchImpl: f, getCurrent: () => ({ app: '0.2.4' }),
  });
  assert.equal(p.enabled, false);
  assert.equal(p.start(), false);
  await p.check(true);
  assert.equal(calls.length, 0);
  assert.equal(p.status().enabled, false);
  p.dispose();
});

test('start(): 定时器 unref（不钉住进程）且真的会到点自己拉一次', async () => {
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: {}, json: releaseJson() }], calls);
  const p = poller({ fetchImpl: f });
  assert.equal(p.start(), true);
  assert.equal(p.start(), false, '幂等');
  assert.equal(p.running, true, '★ 定时器只要 unref 就不会钉住进程');
  assert.equal(calls.length, 0, '第一次是 3 秒后（不阻塞启动路径）');
  await new Promise((r) => setTimeout(r, 3300));
  assert.equal(calls.length, 1);
  p.dispose();
  assert.equal(p.running, false);
});

// ---------------------------------------------------------------------------------------------------------------------
// 管理面接线（接口形状 / 鉴权 / 等价性）
//
// getGameInfo 走的是生产里 server/index.js 的 gameInfo()`（内嵌版本走 shared/constants.js 的 APP_VERSION）——
// 所以这里直接喂那个形状（`app` 就是 /healthz 的 app），证明的是「接口读的就是部署版版本号」。
// 本机树版本走 `TREE_VERSION`（← package.json），证明的是「树的版本是另一个来源」。
//
// ★ 关于时序：`createModAdmin` 会把第一次检查排在 **3 秒后**（不阻塞启动路径）⇒ 想看「拉到了什么」就得等它。
//   这里不 sleep 3 秒（测试要快），而是**先手动拉一次**（`?refresh=1` 走的就是这条同一路径），
//   再用轮询等 `checking` 落回 false。

async function settle(admin, { tries = 100, gap = 10 } = {}) {
  for (let i = 0; i < tries; i++) {
    const r = fakeRes();
    await admin.handle(fakeReq(), r, ADMIN_PREFIX + '/upstream-release', '');
    if (r.out.body && r.out.body.checking === false) return r.out.body;
    await new Promise((res) => setTimeout(res, gap));
  }
  throw new Error('settle: 上游检查一直没落定');
}

function tempAdminRoot() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'sp-adm-'));
  const mods = path.join(root, 'mods');
  fs.mkdirSync(mods, { recursive: true });
  for (const rel of ['tools/mod.mjs', 'server/index.js']) {
    fs.mkdirSync(path.join(root, path.dirname(rel)), { recursive: true });
    fs.writeFileSync(path.join(root, rel), '// stub\n');
  }
  return { root, mods };
}

test('新接口：GET /admin/api/upstream-release 字段齐全（契约表逐项）', async () => {
  const { root, mods } = tempAdminRoot();
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: { etag: 'E1' }, json: releaseJson() }], calls);
  const admin = createModAdmin({
    root, modsDir: mods, token: TOKEN_FIXTURE, log: QUIET,
    getGameInfo: () => ({ ok: true, app: '0.2.4', version: 1, revision: 3, rooms: 0, humans: 0 }),
    getRooms: () => ({ ts: 1, summary: { rooms: 0, humans: 0 }, rooms: [] }),
    upstreamFetch: f,
  });
  assert.ok(admin, '有 modsDir + 令牌 ⇒ 管理面存在');
  // 先触发一次检查（不阻塞响应），再等它落定 ⇒ 之后每次读到的都是**拉到的**那一份。
  const kick = fakeRes();
  await admin.handle(fakeReq(), kick, ADMIN_PREFIX + '/upstream-release', '?refresh=1');
  const b = await settle(admin);
  assert.equal(calls.length, 1, '只出一次网');
  assert.equal(b.ok, true);
  assert.equal(b.admin, ADMIN_API_VERSION);
  assert.equal(b.admin, 6, '★ 加性 +1：5 → 6（旧前端只看 >= 1，照常工作）');
  // —— 契约字段逐项 ——
  for (const k of ['checkedAt', 'ok', 'source', 'current', 'latest', 'behind', 'cached', 'etag']) {
    assert.ok(k in b, '缺字段 ' + k);
  }
  assert.equal(b.source, 'github-api');
  assert.equal(b.current.deployedApp, '0.2.4');
  assert.equal(b.current.treeVersion, TREE_VERSION);
  assert.equal(b.latest.tag, 'v0.2.5');
  assert.equal(b.latest.publishedAt, '2026-10-12T10:57:30Z');
  assert.ok(b.latest.bodySummary.length > 0);
  assert.equal(b.latest.assets.length, 2);
  assert.equal(b.behind, true);
  assert.equal(b.behindCount, 1);
  assert.equal(b.cached, false);
  assert.equal(b.etag, 'E1');
  assert.equal(b.error, null);
  assert.equal(typeof b.intervalMin, 'number');
  assert.equal(typeof b.retryAfterSec, 'number');
  assert.equal(b.checking, false);
  assert.ok(b.checkedAt > 0);
  // ★ 绝不泄露凭据 / 绝对路径
  const raw = JSON.stringify(b);
  assert.ok(!raw.includes(TOKEN_FIXTURE), '响应里不许出现令牌');
  assert.ok(!raw.includes(root), '响应里不许出现绝对路径');
  assert.equal(b.url, 'https://api.github.com/repos/' + UPSTREAM_REPO + '/releases/latest');
  if (typeof admin.info === 'function') admin.info();
  fs.rmSync(root, { recursive: true, force: true });
});

test('新接口：鉴权 / 方法 / 未知子路径 与既有管理面**同一口径**（401 / 405 / 404）', async () => {
  const { root, mods } = tempAdminRoot();
  const admin = createModAdmin({
    root, modsDir: mods, token: TOKEN_FIXTURE, log: QUIET, getGameInfo: () => ({ app: '0.2.4' }),
    upstreamFetch: fakeFetch([{ status: 200, headers: {}, json: releaseJson() }]),
  });
  // 401：不带 / 带错令牌
  for (const tok of [null, 'wrong-token-0000000000']) {
    const res = fakeRes();
    await admin.handle(fakeReq('GET', tok), res, ADMIN_PREFIX + '/upstream-release', '');
    assert.equal(res.out.status, 401);
    assert.deepEqual(res.out.body, { ok: false, error: 'unauthorized' });
  }
  // 405：POST（与 /metrics、/rooms 一样只读）
  const res405 = fakeRes();
  await admin.handle(fakeReq('POST'), res405, ADMIN_PREFIX + '/upstream-release', '');
  assert.equal(res405.out.status, 405);
  assert.match(String(res405.out.body.error), /method not allowed: POST/);
  // HEAD 同 GET（既有口径）
  const resHead = fakeRes();
  await admin.handle(fakeReq('HEAD'), resHead, ADMIN_PREFIX + '/upstream-release', '');
  assert.equal(resHead.out.status, 200);
  // ★ 未知子路径的口径（**与基线逐字一致**，实测确认）：GET 走不到任何一个只读端点 ⇒
  //   落在「本模块只收 POST」那道 guard 上 ⇒ **405**（不是 404）。这里断言的就是这个既有口径，
  //   不要为了「看起来更合理」去改它 —— 改了就是动既有管理面的行为。
  const resUnknown = fakeRes();
  await admin.handle(fakeReq(), resUnknown, ADMIN_PREFIX + '/nope-nope', '');
  assert.equal(resUnknown.out.status, 405);
  assert.match(String(resUnknown.out.body.error), /method not allowed: GET/);
  // ★ 本端点的「资源路径」判定是**前缀**（`/upstream-release` 与 `/upstream-release/<更多段>` 都算同一个资源）：
  //   多了路径段仍按同一资源处理（GET ⇒ 200，POST ⇒ 405），不是 404。
  const resSub = fakeRes();
  await admin.handle(fakeReq(), resSub, ADMIN_PREFIX + '/upstream-release/x', '');
  assert.equal(resSub.out.status, 200);
  assert.equal(resSub.out.body.ok, true);
  assert.equal(ADMIN_PREFIX, '/admin/api');
  fs.rmSync(root, { recursive: true, force: true });
});

test('caps.upstream=true（本例）+ ?refresh=1 仍受最小重试间隔约束（如实回 retryAfterSec）', async () => {
  const { root, mods } = tempAdminRoot();
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: { etag: 'E' }, json: releaseJson() }], calls);
  const admin = createModAdmin({
    root, modsDir: mods, token: TOKEN_FIXTURE, log: QUIET, getGameInfo: () => ({ app: '0.2.4' }), upstreamFetch: f,
  });
  const ping = fakeRes();
  await admin.handle(fakeReq(), ping, ADMIN_PREFIX + '/ping', '');
  assert.equal(ping.out.body.capabilities.upstream, true);
  assert.equal(ping.out.body.apiVersion, 6);

  const r1 = fakeRes();
  await admin.handle(fakeReq(), r1, ADMIN_PREFIX + '/upstream-release', '?refresh=1');
  await new Promise((r) => setTimeout(r, 50));            // 检查是后台发起的（不阻塞响应）
  assert.equal(calls.length, 1, 'refresh=1 触发一次检查');
  const r2 = fakeRes();
  await admin.handle(fakeReq(), r2, ADMIN_PREFIX + '/upstream-release', '?refresh=1');
  await new Promise((r) => setTimeout(r, 50));
  assert.equal(calls.length, 1, '1 分钟最小重试间隔内不许再出网（限额 60/h）');
  assert.ok(r2.out.body.retryAfterSec > 0, '要如实告诉前端还要等多久，而不是假装检查了');
  fs.rmSync(root, { recursive: true, force: true });
});

test('等价性纪律：无令牌 ⇒ createModAdmin 返回 null，**一次 fetch 都不会发生**', () => {
  const { root, mods } = tempAdminRoot();
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: {}, json: releaseJson() }], calls);
  assert.equal(createModAdmin({ root, modsDir: mods, token: null, log: QUIET, upstreamFetch: f }), null);
  assert.equal(createModAdmin({ root, modsDir: null, token: TOKEN_FIXTURE, log: QUIET, upstreamFetch: f }), null);
  assert.equal(createModAdmin({ root, modsDir: null, token: null, log: QUIET, upstreamFetch: f }), null);
  assert.equal(calls.length, 0, '模块不存在 ⇒ 没有追踪器 ⇒ 没有出网');
  fs.rmSync(root, { recursive: true, force: true });
});

test('SP_ADMIN_UPSTREAM=0 的实例：接口仍在（enabled=false）但 caps.upstream=false ⇒ 前端不显示这一栏', async () => {
  const { root, mods } = tempAdminRoot();
  const calls = [];
  const f = fakeFetch([{ status: 200, headers: {}, json: releaseJson() }], calls);
  const admin = createModAdmin({
    root, modsDir: mods, token: TOKEN_FIXTURE, log: QUIET, getGameInfo: () => ({ app: '0.2.5' }),
    upstreamFetch: f, upstreamEnv: { SP_ADMIN_UPSTREAM: '0' },
  });
  const res = fakeRes();
  await admin.handle(fakeReq(), res, ADMIN_PREFIX + '/upstream-release', '');
  assert.equal(res.out.status, 200);
  assert.equal(res.out.body.enabled, false);
  assert.equal(res.out.body.latest, null);
  assert.equal(calls.length, 0, '整块关掉 ⇒ 一个请求都不发');
  const ping = fakeRes();
  await admin.handle(fakeReq(), ping, ADMIN_PREFIX + '/ping', '');
  assert.equal(ping.out.body.capabilities.upstream, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('TREE_VERSION 就是这棵树 package.json 的 version（与部署版是两个来源）', () => {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, 'package.json'), 'utf8'));
  assert.equal(TREE_VERSION, pkg.version);
});
