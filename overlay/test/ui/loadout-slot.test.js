// test/ui/loadout-slot.test.js — v0.2.2 重缝验收：`loadout.topbar` 客户端 Mod 插槽在新「干员调配」页上**真的挂上了**
//
// 背景（<开发期报告>/34-upstream-022-recon.md B 表 #6）：0.2.2 把「干员调配」整页重写成**一张表**
// （每名干员一行，技能 / 模组 / 潜能·练度各一列），而 `cyanfish.loadout-io` 等客户端 Mod 挂在
// `loadout.topbar`（ui/extensions.js 的 LOADOUT_TOPBAR）上的界面片段必须重挂到新结构上。
//
// 本测试钉死三条不可回退的约定（与 diy-ui.test.js 里 `loadout.diySlotActions` 那条同构）：
//   ① 插槽在「干员调配」这一 tab 的顶栏**右簇**里，位置 = `调配截止` 倒计时之后；
//   ② 不装 Mod（0 注册者）⇒ `uiExtensionCount === 0` ⇒ 插槽渲染成 null ⇒ **不产生任何节点**；
//   ③ 传下去的 props 足够让 Mod 认出上下文：entries / nChanged / rosterSize / locked / sync。
//
// Run: node --test test/ui/loadout-slot.test.js

import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = readFileSync(path.join(ROOT, 'public/js/screens/loadout.js'), 'utf8');
const ext = await import('../../public/js/ui/extensions.js');

describe('\u2605 loadout.topbar 在新「干员调配」表式页上', () => {
  test('插槽名与宿主用法：LOADOUT_TOPBAR + <UiSlot name=… props=…>', () => {
    assert.equal(ext.UI_SLOTS.LOADOUT_TOPBAR, 'loadout.topbar');
    assert.ok(src.includes("import { UiSlot, UI_SLOTS } from '../ui/extensions.js';"), '宿主 import 了 UiSlot / UI_SLOTS');
    assert.ok(src.includes('<${UiSlot} name=${UI_SLOTS.LOADOUT_TOPBAR}'), '宿主挂了 loadout.topbar 插槽');
  });

  test('插槽排在官方「调配截止」倒计时之后、同步状态之前（官方三件一个不少）', () => {
    const iCountdown = src.indexOf('<${Countdown} deadline=${infoDeadline}');
    const iSlot = src.indexOf('<${UiSlot} name=${UI_SLOTS.LOADOUT_TOPBAR}');
    const iSync = src.indexOf('${syncText ? html`<span class=${cx(\'lo-sync\', syncCls)} role="status">');
    assert.ok(iCountdown > 0, '官方倒计时还在');
    assert.ok(iSlot > iCountdown, '插槽在倒计时之后');
    assert.ok(iSync > iSlot, '插槽在同步状态之前');
    for (const label of ["t('导出')", "t('导入')", "t('全部恢复默认')"]) {
      assert.ok(src.includes(label), `官方按钮还在：${label}`);
    }
  });

  test('插槽的 props 形状：entries / nChanged / rosterSize / locked / sync', () => {
    const at = src.indexOf('<${UiSlot} name=${UI_SLOTS.LOADOUT_TOPBAR}');
    assert.ok(at > 0, '插槽那一段能定位到');
    const line = src.slice(at, at + 400);
    for (const key of ['entries', 'nChanged', 'rosterSize', 'locked', 'sync']) {
      // 既接受 `k: v` 也接受 ES6 简写 `k,` / `k }`
      assert.ok(new RegExp('(^|[\\s{])' + key + '\\s*[:,}]').test(line) || new RegExp('(^|[\\s{])' + key + '\\s*,').test(line),
        `props 带 ${key}`);
    }
  });

  test('不装 Mod ⇒ 0 注册者 ⇒ UiSlot 的第一行就返回 null（零节点）', () => {
    ext.clearUiExtensions();
    const slot = ext.UI_SLOTS.LOADOUT_TOPBAR;
    assert.equal(ext.uiExtensionCount(slot), 0, '没有注册者时是空的');
    // ★ UiSlot 是 hooks 组件（useStore），不能在 Node 里裸调用（要 Preact 的渲染上下文）。
    //   这里钉的是它的**实现约束**：空注册表 ⇒ `return null`（不产生节点），与源码逐字一致。
    const impl = readFileSync(path.join(ROOT, 'public/js/ui/extensions.js'), 'utf8');
    const body = impl.slice(impl.indexOf('export function UiSlot'), impl.indexOf('// ---- host API'));
    assert.match(body, /if \(!list \|\| !list\.length\) return null;/, '空插槽 return null（零节点）');
    assert.ok(body.includes('list.map') && body.includes('e.render'), '有注册者时逐个渲染，且**没有包裹元素**');
    const dispose = ext.registerUiExtension(slot, () => null, { modId: 'test.probe' });
    assert.equal(ext.uiExtensionCount(slot), 1, '有注册者后计数为 1');
    dispose();
    ext.clearUiExtensions();
    assert.equal(ext.uiExtensionCount(slot), 0, 'dispose 后回到 0');
  });

  test('另外两个客户端的设置页 / 自选槽位也还挂着（同一次重缝的回归）', () => {
    const diy = readFileSync(path.join(ROOT, 'public/js/screens/diy.js'), 'utf8');
    const settings = readFileSync(path.join(ROOT, 'public/js/ui/settings.js'), 'utf8');
    assert.equal(ext.UI_SLOTS.LOADOUT_DIY_SLOT_ACTIONS, 'loadout.diySlotActions');
    assert.ok(diy.includes('<${UiSlot} name=${UI_SLOTS.LOADOUT_DIY_SLOT_ACTIONS}'), 'diy.js 仍挂着 diySlotActions');
    assert.ok(settings.includes('<${UiSlot} name=${UI_SLOTS.SETTINGS_SECTIONS}'), 'settings.js 仍挂着 settings.sections');
  });
});
