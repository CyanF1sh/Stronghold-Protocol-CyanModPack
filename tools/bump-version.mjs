#!/usr/bin/env node
/*
 * bump-version.mjs —— 把本仓「对齐的官方版本」从一个版本换到另一个（**升级官方版本时跑它**）
 *
 * 用法（在本仓根目录下）：
 *   node tools/bump-version.mjs 0.2.7            # 写 VERSION + 改 14 个 mod.json 的 gameVersion
 *   node tools/bump-version.mjs 0.2.7 --dry-run  # 只看会改什么
 *
 * 它会做两件事（都很机械）：
 *   ① 写仓根 `VERSION`（本仓对齐的官方版本 —— 发布集的唯一权威）；
 *   ② 把 `mods/<id>/mod.json` 的 `gameVersion` 全部改成新版本（★ 装载器是**严格相等**校验：漏改一个，
 *      那个 Mod 就会被整包跳过）。
 *
 * 它**不会**替你做的（要人过目，见 docs/BUMP.md）：
 *   · 改文档里写着的具体版本号（本文件只会把它们**列出来**给你看，不盲改）；
 *   · 重新对齐覆盖层（`overlay/` 里那些「官方也改过」的文件要按新版本重算 `ORIGIN.sha256` —— 那是另一件事）。
 */
import { readdirSync, readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = resolve(HERE, '..');
const argv = process.argv.slice(2);
const next = (argv.find((a) => /^\d+\.\d+\.\d+/.test(a)) || '').trim();
const dryRun = argv.includes('--dry-run');

if (!next) {
  console.error('用法: node tools/bump-version.mjs <新版本，如 0.2.7> [--dry-run]');
  process.exit(2);
}

const vPath = join(REPO, 'VERSION');
const old = existsSync(vPath) ? readFileSync(vPath, 'utf8').trim().split(/\s+/)[0] : '(无)';
console.log('=== 本仓对齐的官方版本：' + old + ' -> ' + next + (dryRun ? '（dry-run）' : '') + ' ===');

if (!dryRun) writeFileSync(vPath, next + '\n', 'utf8');
console.log('  ① VERSION            ' + (dryRun ? '(跳过)' : '已写') + ' ' + next);

const modsDir = join(REPO, 'mods');
let n = 0;
for (const id of readdirSync(modsDir)) {
  const p = join(modsDir, id, 'mod.json');
  if (!existsSync(p)) continue;
  const raw = readFileSync(p, 'utf8');
  const d = JSON.parse(raw);
  if (d.gameVersion === next) continue;
  d.gameVersion = next;
  if (!dryRun) writeFileSync(p, JSON.stringify(d, null, 2) + '\n', 'utf8');
  n += 1;
}
console.log('  ② mods/*/mod.json    ' + (dryRun ? '(跳过)' : '已改') + ' ' + n + ' 个');

/* ③ 只报告：文档里还写着旧版本号的地方（不盲改 —— 那些话术要人过目） */
const docs = ['README.md', 'NOTICE.md', 'THIRD-PARTY.md', 'RELEASE-NOTES.md',
  'docs/QUICKSTART.md', 'docs/INSTALL.md', 'docs/MODS-LIST.md', 'docs/BUMP.md', 'tools/apply-overlay.mjs'];
console.log('  ③ 仍需**人工过目**的地方（文档里出现 ' + old + ' 的行）：');
let hits = 0;
for (const f of docs) {
  const p = join(REPO, f);
  if (!existsSync(p)) continue;
  readFileSync(p, 'utf8').split('\n').forEach((line, i) => {
    if (line.includes(old)) { hits += 1; if (hits <= 40) console.log('     ' + f + ':' + (i + 1) + '  ' + line.trim().slice(0, 100)); }
  });
}
console.log('     （共 ' + hits + ' 行）★ 按 docs/BUMP.md 的第 3 步过一遍');
console.log('');
console.log('别忘了（见 docs/BUMP.md）：④ 重新对齐覆盖层与 ORIGIN.sha256  ⑤ 跑 publish-scan 与 apply-overlay --dry-run');
