// mods/cyanfish.demo/client/index.js —— 示例 Mod 的「界面那一半」（L4 轴）。
//
// ★ 这个文件是**给人照着抄的**，所以每一步都写了「为什么」。它一共只做一件事：
//   在**首页顶栏**挂一枚小按钮，点开弹一个说明面板。
//   · 数据那一半（新增示例干员）在 data/chess.json，两边**互不依赖**：删掉本文件，干员照旧进商店。
//   · 本文件**只在玩家浏览器里跑**，服务端根本不加载它（docs/MODS.md §6.1）
//     ⇒ 它不可能影响战斗结果、数据或战报。要影响战斗得写 content/index.js（L3 轴），那是另一条通道。
//
// 谁调用它：public/js/ui/extensions.js 的 loadClientMods()
//   页面启动 → GET /mods → import(本文件) → setup(hostApi) → 返回的 dispose 由宿主保管
//   （停用 / 卸载本 Mod 时宿主调 dispose，把下面那次插槽注册撤掉）
//
// ★★ 三条最容易踩的纪律（都是真机踩出来的，直接照做就行）：
//   1. **setup 必须同步返回**（返回一个 dispose 函数，**不是 Promise**）。宿主是 `await setup(...)`
//      一个接一个装载的，你在这里 await 一个网络请求，会把后面所有 Mod 的装载一起拖住。
//   2. **插槽名必须取自 `hostApi.slots.names`**。名字写错宿主**直接抛错**（这是故意的：
//      否则你会一直找「我的按钮为什么不出现」）。
//   3. **任何失败都要自己吞掉并 `log.warn`**（§6.6）。宿主不会把你的异常弹给玩家看 ——
//      它只会把整个 Mod 记成 failed，并**撤销你已经注册的插槽**。

/** 本 Mod 的 id（与 mod.json 的 `id`、目录名三者逐字符相同）。 */
const MOD_ID = 'cyanfish.demo';

/** 要挂的插槽。权威名单 = public/js/ui/extensions.js 的 `UI_SLOTS`（运行时读 `api.slots.names`）。 */
const SLOT = 'lobby.topbar';

/**
 * Mod 入口，宿主装载时调用一次。
 * @param {object} api 宿主 API：`{ apiVersion, mod, snapshot, getMods, ui, slots, loadout, data, log }`（§6.2）
 * @returns {() => void} 同步的 dispose（★ 不是 Promise，见文件头纪律 1）
 */
export default function setup(api) {
  try {
    // ★ 先确认宿主真的有这条插槽：老宿主、或将来插槽改名时，这里要安静地不注册，而不是炸掉整个页面。
    //   `api.slots.names` 就是 UI_SLOTS 的键值对（`names.LOBBY_TOPBAR === 'lobby.topbar'`）。
    const names = api?.slots?.names;
    if (!names || names.LOBBY_TOPBAR !== SLOT) {
      api?.log?.warn?.(`[${MOD_ID}] 宿主没有 ${SLOT} 插槽，界面那一半不生效（数据那一半不受影响）`);
      return () => {};
    }
    // 注册：**宿主拥有「放哪」，本 Mod 拥有「放什么」**。同一插槽的多个注册者会依次渲染成兄弟节点。
    const dispose = api.slots.register(SLOT, () => api.ui.html`<${DemoButton} api=${api} />`);
    // 返回清理函数：宿主在停用 / 卸载本 Mod 时调用它，把上面那次注册撤掉（不撤就会留半个注册）。
    return () => { try { dispose?.(); } catch { /* 忽略 */ } };
  } catch (e) {
    api?.log?.warn?.(`[${MOD_ID}] 注册插槽失败（已忽略）`, e);
    return () => {};
  }
}

/**
 * 顶栏上那一枚按钮。组件写成**普通函数**，用宿主的 `html` 与宿主的 hooks（§6.4-1）。
 * @param {{ api: object }} props
 */
function DemoButton({ api }) {
  const { html, Button, alertDialog } = api.ui;
  // ★ `api.mod` 是宿主给你的那份清单（`{ id, name, version, author }`，冻结）—— 这里拿它当版本读数。
  const version = api.mod?.version ?? '?';
  // ★ 弹富面板的唯一姿势：`alertDialog({ title, micro: '', okText, text })`（§4.12.2）。
  //   `micro` 是弹窗标题上方那行小字，**默认值就是英文 eyebrow "CONFIRMATION"**
  //   ⇒ 不想要英文就**必须显式传空串**（§4.12.8 明令清掉英文副标题）。
  const open = () => alertDialog({
    title: '示例 Mod',
    micro: '',
    okText: '知道了',
    text: html`<${DemoPanel} api=${api} version=${version} />`,
  });
  // 用宿主的 Button（`variant="secondary" size="sm"`）：不要自己画按钮（§6.4-4、§4.12.9 的命名空间那一条）。
  return html`<${Button} variant="secondary" size="sm" onClick=${open}>示例 Mod<//>`;
}

/**
 * 弹窗里的正文。宿主没有把 `Panel` 暴露给 Mod，所以这里只用最朴素的节点 + 宿主自己的 `modal__text`。
 * ★ 「宿主已有的类名照用、不算占名」是 §4.12.9 的明文规则。
 * ★ 注意 `html` **不是全局变量**：它只能从 `api.ui` 拿（每个组件自己取一次，别指望闭包传进来）。
 * @param {{ api: object, version: string }} props
 */
function DemoPanel({ api, version }) {
  const { html } = api.ui;
  return html`<div>
    <p class="modal__text">这是 cyanfish.demo 的界面那一半（L4 轴）：跑在浏览器里，与战斗无关。</p>
    <p class="modal__text">它读到的清单版本是 ${version}。这一行能显示出来，就说明插槽和组件都通了。</p>
    <p class="modal__text">想改成别的内容：改本文件里 DemoPanel 的这几行，刷新页面即可看到。</p>
  </div>`;
}
