// test/ui/52-no-dual-tooltip.test.js —— 工序 52 的**门禁**：任何"自有气泡"元素都不许再挂原生 `title`。
//
// 病因（服主口径 ②）：`title` 与自有气泡（`::after { content: attr(data-tip) }` / 宿主 `ui.Tooltip`）
// 同时存在 ⇒ 浏览器悬停弹**原生气泡**（白底黑字）+ 我们弹**自有面板** ⇒ **两套框重合**。
// 规范：`docs/MODS.md` §4.12.2 二 / 五（工序 52 把 `title` 从规范形状里删掉了）。
//
// 判据（源码级，扫 `html\`…\`` 模板字面量）：
//   · 一段模板里同时出现「自有气泡标记」（`data-tip` / `class="tooltip"` / `class="…tooltip…"`）与「`title=`」
//     ⇒ 报错。**例外**：`aria-label` 不算；`title=` 后面跟着的 `data-tip`（同一模板里的别的元素）由
//     逐元素判断兜不住，因此**只按模板粒度**报错并要求人把它拆成两个模板 —— 这样才不会有假阴性。
//   · 已知豁免（白名单，逐条写明理由）：**已清空**。工序 52 当时把 `mods/cyanfish.skinvoice/**`
//     整条豁免掉（另一条线正在改那一行 UI）；工序 55（skinvoice 0.17.0）把那个 `HintDot` 的原生
//     `title` 删掉了 ⇒ 豁免连同下面那条"仍是老形状"的断言一起退场，改成正向断言（见最后一个 test）。
//
// ★ 工序 106（2026-10-11）：本文件原先在两处点名 `cyanfish.dj-models` / `cyanfish.dj-bgm`。这两个 Mod
//   已从 `mods/` **移出并单独归档**（`<归档目录>/`，服主裁定：后续可能完全重新设计）⇒
//   ①「dj-models 在扫描面里」那条覆盖断言改成**与具体 Mod 无关**的「mods/** 扫到 >30 个 js」；
//   ② HintDot 规范形状的名单里那两个文件换成同样带规范形状的 `cyanfish.debug-console/client/panel.js`。
//   **判据本身（不许自有气泡 + 原生 title 并存）一个字没改。**
import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');

/** 工序 52 明令不许碰的路径。★ 工序 55 起**空表**：skinvoice 那一处已按规范修好。 */
const EXEMPT = [];

/** 递归收集 .js（跳过 vendor / assets / node_modules）。 */
function jsFiles(dir, out = []) {
  for (const e of readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (/^(node_modules|vendor|assets|\.git)$/.test(e.name)) continue;
      jsFiles(p, out);
    } else if (e.name.endsWith('.js')) out.push(p);
  }
  return out;
}

/** 抽出一个文件里所有 `html\`…\`` 模板字面量（规范禁止嵌套反引号 ⇒ 配对法成立）。 */
function htmlTemplates(src) {
  const out = [];
  const re = /html`/g;
  let m;
  while ((m = re.exec(src))) {
    const start = m.index + 4;            // 反引号之后
    let i = start;
    while (i < src.length) {
      const c = src[i];
      if (c === '\\') { i += 2; continue; }
      if (c === '`') break;
      i++;
    }
    const body = src.slice(start, i);
    const line = src.slice(0, m.index).split('\n').length;
    out.push({ body, line });
  }
  return out;
}

/** 模板里有没有"自有气泡"标记。 */
const OWN_BUBBLE = /data-tip|class\s*=\s*(?:"|')?[^"'`>\s]*tooltip|class=\$\{cx\([^)]*tooltip/;
/** 模板里有没有原生 title 属性（排除 aria-label / 普通对象字面量里的 title:）。 */
const NATIVE_TITLE = /(?<![-\w])title\s*=\s*\$\{|(?<![-\w])title\s*=\s*"/;

function scan(files) {
  const hits = [];
  for (const f of files) {
    const rel = path.relative(ROOT, f);
    if (EXEMPT.some((re) => re.test(f))) continue;
    const src = readFileSync(f, 'utf8');
    for (const { body, line } of htmlTemplates(src)) {
      if (OWN_BUBBLE.test(body) && NATIVE_TITLE.test(body)) {
        hits.push({ file: rel.replace(/\\/g, '/'), line, snippet: body.replace(/\s+/g, ' ').slice(0, 120) });
      }
    }
  }
  return hits;
}

describe('工序 52：自有气泡与原生 title 不许并存（两套提示框会重合）', () => {
  const files = [...jsFiles(path.join(ROOT, 'public', 'js')), ...jsFiles(path.join(ROOT, 'mods'))];

  test('扫描面足够大（public/js + mods 都扫到了）', () => {
    assert.ok(files.length > 100, `扫到的 js 文件数 ${files.length}（应当 >100）`);
    assert.ok(files.some((f) => f.endsWith(path.join('js', 'screens', 'diy.js'))), 'public/js/screens/diy.js 在扫描面里');
    // ★ 工序 106：原来这里点名 `cyanfish.dj-models/client/section.js`。该 Mod 已从 `mods/` **移出并单独归档**
    //   （`<归档目录>/`，服主裁定：后续可能完全重新设计）⇒ 点它的名字必然失败。
    //   覆盖判据改成**与具体 Mod 无关**的：mods/ 那一半必须真的扫到相当数量的文件。
    assert.ok(files.filter((f) => f.includes(`${path.sep}mods${path.sep}`)).length > 30,
      `mods/** 扫到的 js 文件数 ${files.filter((f) => f.includes(`${path.sep}mods${path.sep}`)).length}（应当 >30）`);
    assert.ok(files.some((f) => f.endsWith(path.join('cyanfish.skinvoice', 'client', 'panels.js'))), 'cyanfish.skinvoice 在扫描面里');
  });

  test('没有任何模板同时带「自有气泡」与「原生 title」', () => {
    const hits = scan(files);
    assert.deepEqual(hits, [], '这些地方同时有自有气泡与原生 title（会把两套提示框画在一起）：\n'
      + hits.map((h) => `  ${h.file}:${h.line}  ${h.snippet}`).join('\n'));
  });

  test('HintDot 逐字等于规范形状（无 title）', async () => {
    const want = 'role="img" tabindex="0" aria-label=${text} data-tip=${text}';
    // ★ 工序 106：名单里的 `cyanfish.dj-bgm/client/section.js` 与 `cyanfish.dj-models/client/section.js`
    //   随这两个 Mod **移出归档**而消失；补上同样带规范形状 HintDot 的 `cyanfish.debug-console/client/panel.js`
    //   （现状：仓库里带这条形状的就是 diy.js / debug-console / skinvoice 三处）。
    for (const f of ['public/js/screens/diy.js', 'mods/cyanfish.debug-console/client/panel.js',
      'mods/cyanfish.skinvoice/client/panels.js']) {
      const src = readFileSync(path.join(ROOT, f), 'utf8');
      assert.match(src, new RegExp(want.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/\s+/g, '\\s+')),
        `${f} 的小圈形状必须是规范形状（无 title）`);
      assert.doesNotMatch(src, /aria-label=\$\{text\}\s+title=\$\{text\}/, `${f} 不许把 title 加回来`);
    }
  });

  test('★ cyanfish.skinvoice 的 HintDot 也已按规范修好（工序 55：豁免取消，改成正向断言）', () => {
    const src = readFileSync(path.join(ROOT, 'mods/cyanfish.skinvoice/client/panels.js'), 'utf8');
    assert.doesNotMatch(src, /aria-label=\$\{text\}\s+title=\$\{text\}/,
      'skinvoice 的 HintDot 不许再有原生 title（与 data-tip 会画出两套重合的提示框）');
    assert.doesNotMatch(src, /title=\$\{text\}/, 'skinvoice 的 HintDot 那一行不许出现任何 title=${text}');
    assert.match(src, /class="sp-sv__info" role="img" tabindex="0" aria-label=\$\{text\} data-tip=\$\{text\}/,
      'skinvoice 的 HintDot 仍是自有气泡（data-tip）+ aria-label + tabindex 的规范形状');
  });
});
