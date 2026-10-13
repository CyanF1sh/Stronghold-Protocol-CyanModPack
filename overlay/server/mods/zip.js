// server/mods/zip.js — 零依赖的最小 ZIP 读写（store / deflate）。
// (i18n-ignore-file: Mod 平台（加载器 / 打包 / 管理 API），不是游戏界面文案 — docs/I18N.md)
//
// 为什么自己写：.spmod 需要「单文件、可分发、随便什么解压工具都能打开」。
// 但 Node 没有内置 zip，而服务器上不保证有 `zip` 命令、Windows 上默认也没有 ⇒ 纯 JS 实现最稳。
// 只支持 ZIP 的最小子集（无 zip64 / 无加密 / 无分卷），足够装几十 MB 的 Mod 包。
//
// 支持：文件名 UTF-8（通用位标记 0x0800）、deflate 压缩、目录项跳过、CRC32 校验。

import zlib from 'node:zlib';

// ---------------------------------------------------------------- CRC32

const CRC_TABLE = (() => {
  const t = new Int32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c;
  }
  return t;
})();

/** CRC32（优先用 Node 内置，缺失时回退查表实现）。@param {Buffer} buf */
export function crc32(buf) {
  if (typeof zlib.crc32 === 'function') return zlib.crc32(buf) >>> 0;
  let c = -1;
  for (let i = 0; i < buf.length; i++) c = CRC_TABLE[(c ^ buf[i]) & 0xff] ^ (c >>> 8);
  return (c ^ -1) >>> 0;
}

// ---------------------------------------------------------------- DOS 时间

function dosDateTime(d = new Date()) {
  const time = ((d.getHours() & 0x1f) << 11) | ((d.getMinutes() & 0x3f) << 5) | ((d.getSeconds() / 2) & 0x1f);
  const date = (((d.getFullYear() - 1980) & 0x7f) << 9) | (((d.getMonth() + 1) & 0x0f) << 5) | (d.getDate() & 0x1f);
  return { time, date };
}

// ---------------------------------------------------------------- 写

/**
 * 打包成 zip Buffer。
 * @param {Array<{name: string, data: Buffer|string}>} entries 路径用 `/` 分隔；目录条目自动跳过
 * @param {{ level?: number, mtime?: Date }} [opts] level=0 表示不压缩（store）
 * @returns {Buffer}
 */
export function zipWrite(entries, { level = 9, mtime = new Date() } = {}) {
  const { time, date } = dosDateTime(mtime);
  const locals = [];
  const centrals = [];
  let offset = 0;
  for (const e of entries) {
    const name = String(e.name).replace(/\\/g, '/');
    if (!name || name.endsWith('/')) continue;
    const raw = Buffer.isBuffer(e.data) ? e.data : Buffer.from(String(e.data), 'utf8');
    const nameBuf = Buffer.from(name, 'utf8');
    const crc = crc32(raw);
    let method = 0;
    let body = raw;
    if (level > 0 && raw.length > 0) {
      const def = zlib.deflateRawSync(raw, { level });
      if (def.length < raw.length) { method = 8; body = def; }
    }
    const lh = Buffer.alloc(30);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0x0800, 6);
    lh.writeUInt16LE(method, 8);
    lh.writeUInt16LE(time, 10);
    lh.writeUInt16LE(date, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(body.length, 18);
    lh.writeUInt32LE(raw.length, 22);
    lh.writeUInt16LE(nameBuf.length, 26);
    lh.writeUInt16LE(0, 28);
    locals.push(lh, nameBuf, body);

    const ch = Buffer.alloc(46);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0x0800, 8);
    ch.writeUInt16LE(method, 10);
    ch.writeUInt16LE(time, 12);
    ch.writeUInt16LE(date, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(body.length, 20);
    ch.writeUInt32LE(raw.length, 24);
    ch.writeUInt16LE(nameBuf.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    centrals.push(ch, nameBuf);
    offset += lh.length + nameBuf.length + body.length;
  }
  const cdBuf = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(entries.filter((e) => !String(e.name).endsWith('/')).length, 8);
  eocd.writeUInt16LE(entries.filter((e) => !String(e.name).endsWith('/')).length, 10);
  eocd.writeUInt32LE(cdBuf.length, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);
  return Buffer.concat([...locals, cdBuf, eocd]);
}

// ---------------------------------------------------------------- 读

/**
 * 解 zip Buffer。返回 `{ entries: [{name, data}], errors: string[] }`。
 * **安全**：拒绝路径穿越（`..`）、绝对路径、盘符、反斜杠穿越 —— 这类条目直接丢弃并记入 errors。
 * @param {Buffer} buf
 * @returns {{ entries: Array<{name:string, data:Buffer}>, errors: string[] }}
 */
export function zipRead(buf) {
  const entries = [];
  const errors = [];
  if (!Buffer.isBuffer(buf) || buf.length < 22) { errors.push('不是有效的 zip（太短）'); return { entries, errors }; }
  // 从尾部找 EOCD
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 65535); i--) {
    if (buf.readUInt32LE(i) === 0x06054b50) { eocd = i; break; }
  }
  if (eocd < 0) { errors.push('找不到 zip 中央目录（EOCD）'); return { entries, errors }; }
  const total = buf.readUInt16LE(eocd + 10);
  let cdOff = buf.readUInt32LE(eocd + 16);
  for (let n = 0; n < total; n++) {
    if (cdOff + 46 > buf.length || buf.readUInt32LE(cdOff) !== 0x02014b50) { errors.push(`中央目录第 ${n} 项损坏`); break; }
    const method = buf.readUInt16LE(cdOff + 10);
    const crc = buf.readUInt32LE(cdOff + 16);
    const compSize = buf.readUInt32LE(cdOff + 20);
    const rawSize = buf.readUInt32LE(cdOff + 24);
    const nameLen = buf.readUInt16LE(cdOff + 28);
    const extraLen = buf.readUInt16LE(cdOff + 30);
    const cmtLen = buf.readUInt16LE(cdOff + 32);
    const lho = buf.readUInt32LE(cdOff + 42);
    const name = buf.slice(cdOff + 46, cdOff + 46 + nameLen).toString('utf8');
    cdOff += 46 + nameLen + extraLen + cmtLen;
    if (name.endsWith('/')) continue;
    if (!safeName(name)) { errors.push(`拒绝不安全的条目路径: ${name}`); continue; }
    if (lho + 30 > buf.length || buf.readUInt32LE(lho) !== 0x04034b50) { errors.push(`${name}: 本地头损坏`); continue; }
    const lNameLen = buf.readUInt16LE(lho + 26);
    const lExtraLen = buf.readUInt16LE(lho + 28);
    const start = lho + 30 + lNameLen + lExtraLen;
    const body = buf.slice(start, start + compSize);
    let data;
    try {
      data = method === 0 ? Buffer.from(body) : method === 8 ? zlib.inflateRawSync(body) : null;
      if (data === null) { errors.push(`${name}: 不支持的压缩方式 ${method}`); continue; }
    } catch (e) { errors.push(`${name}: 解压失败 ${e.message}`); continue; }
    if (data.length !== rawSize) errors.push(`${name}: 解压后长度不符（期望 ${rawSize}，实得 ${data.length}）`);
    else if (crc32(data) !== crc) errors.push(`${name}: CRC32 校验失败`);
    entries.push({ name, data });
  }
  return { entries, errors };
}

/** 路径安全：相对路径、无 ..、无盘符、无反斜杠。 */
function safeName(name) {
  if (typeof name !== 'string' || !name) return false;
  if (name.includes('\\')) return false;
  if (/^[a-zA-Z]:/.test(name)) return false;
  if (name.startsWith('/')) return false;
  const parts = name.split('/');
  return !parts.some((p) => p === '..' || p === '' && parts.indexOf(p) !== 0);
}
