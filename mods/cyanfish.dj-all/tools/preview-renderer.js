// mods/cyanfish.dj-all/tools/preview-renderer.js —— 设置页预览的**纯 DOM 渲染器**（经典脚本，由生成器整体内联）。
//
// ★ 为什么单独一个文件：原来的写法是把渲染器塞进生成器里的"单引号字符串数组"，改一行就要动几十处引号，
//   本轮（0.4.0）它连续踩了两次语法坑。改成独立文件 + 生成器原样内联 ⇒ 可以用正常 JS 写。
//
// ★ 它必须与 client/section.js（真机上的 htm+Preact 渲染器）**逐条对齐**：类名、data-*、文案、交互语义。
//   两边读的是**同一份** `client/panels.js` 算出来的描述（`window.DJA` 命名空间），所以"哪些行 / 什么控件 /
//   什么值 / 可不可改 / 什么文案"不会漂；只有渲染器不同（DOM vs Preact）。
//
// 两种摆放（与真机一致，服主第 ④ 条）：
//   scope='full'     → 固定设置页：
//        说明 · 运行读数 · ②整个 Mod 的总开关 · 局内（入口显示 / 位置 / 浮窗不透明度 / 位置高亮）· 恢复出厂
//   scope='elements' → 局内浮窗：
//        配置（选中元素的三档 + 五参数 + ⚠）· 随机偏移 · 元素目录 · 元素恢复默认
(function () {
  var D = window.DJA;
  var TEXTS = D.TEXTS;
  var VAL = 'white-space:nowrap;width:auto;text-align:right';
  var cfg = D.sanitize(null);          // ★ 预览从出厂状态开始：默认全关、总闸开、全局数值是默认值
  var sel = null;

  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function el(tag, cls, text) { var e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; }
  function hint(text) {
    var s = el('span', 'sp-dja__info', '?');
    s.setAttribute('role', 'img'); s.tabIndex = 0; s.setAttribute('aria-label', text); s.setAttribute('data-tip', text);
    return s;
  }
  function row(attr) { var r = el('div', 'set-row'); if (attr) r.setAttribute('data-dja-' + attr, '1'); return r; }
  function label(text, tip) { var l = el('span', 'set-row__label', text); if (tip) l.appendChild(hint(tip)); return l; }
  function toggleRow(attr, text, tip, isOn, onClick) {
    var r = row(attr); r.appendChild(label(text, tip));
    var w = el('div', 'sp-dja__side-by');
    var b = el('button', 'set-toggle' + (isOn ? ' is-on' : '')); b.type = 'button'; b.setAttribute('role', 'switch');
    b.setAttribute('aria-checked', isOn ? 'true' : 'false');
    b.appendChild(el('i', '')); b.appendChild(el('span', '', isOn ? '开' : '关'));
    b.onclick = onClick; w.appendChild(b); r.appendChild(w); return r;
  }
  function sliderRow(attr, text, key, min, max, v, disabled, onInput) {
    var lab = el('label', 'set-row'); lab.setAttribute('data-dja-' + attr, key);
    lab.appendChild(el('span', 'set-row__label', text));
    var i = el('input', 'set-range sp-dja__range'); i.type = 'range'; i.min = min; i.max = max; i.step = 1;
    i.disabled = !!disabled; i.value = v;
    i.style.setProperty('--pct', Math.round(((v - min) / (max - min)) * 100) + '%');
    if (!disabled) i.oninput = function () { onInput(Number(i.value)); };
    lab.appendChild(i);
    var val = el('span', 'set-row__val num', v + '%'); val.setAttribute('data-dja-' + attr + '-val', key); val.style.cssText = VAL;
    lab.appendChild(val); return lab;
  }

  // ---- 配置写入（与真机 store 同一套语义；这里只改本地 cfg 再重画）------------------------------------
  function patch(p) {
    cfg = D.sanitize({
      on: p.on === undefined ? cfg.on : p.on,
      glob: p.glob ? Object.assign({}, cfg.glob, p.glob) : cfg.glob,
      rnd: p.rnd ? Object.assign({}, cfg.rnd, p.rnd) : cfg.rnd,
      fab: p.fab ? Object.assign({}, cfg.fab, p.fab) : cfg.fab,
      nodes: p.nodes === undefined ? cfg.nodes : p.nodes,
    });
    drawAll();
  }
  function setMode(id, m) {
    var node = D.findNode(D.TREE, id);
    var wasOff = D.modeOf(cfg, id) === 'off';
    if (wasOff && m !== 'off' && node && node.danger === true) {
      confirmDanger(node, function (ok) { if (ok) { var n = Object.assign({}, cfg.nodes); n[id] = (m === 'own') ? { m: 'own' } : { m: m }; patch({ nodes: n }); } });
      return;
    }
    var n2 = Object.assign({}, cfg.nodes); n2[id] = (m === 'own') ? { m: 'own' } : { m: m }; patch({ nodes: n2 });
  }
  function setParam(key, v) {
    if (!sel) return;
    var m = D.modeOf(cfg, sel);
    if (m === 'global') { var g = {}; g[key] = v; patch({ glob: g }); }
    else if (m === 'own') {
      var cur = D.valuesOf(cfg, sel); var own = Object.assign({}, cur); own[key] = v;
      var n = Object.assign({}, cfg.nodes); n[sel] = { m: 'own', v: D.cleanValues(own) }; patch({ nodes: n });
    }
  }
  function kv(k, v) { var o = {}; o[k] = v; return o; }

  // ---- ★⑦ 二次确认（复刻真机 confirmDialog 的文案与按钮）--------------------------------------------
  function confirmDanger(node, cb) {
    var wrap = el('div', 'pv-confirm');
    var box = el('div', 'pv-confirm__box brackets');
    var name = node.kind === 'leaf' ? node.el.name : node.name;
    box.appendChild(el('h3', 'pv-confirm__t', TEXTS.dangerConfirmTitle.replace('{name}', name)));
    box.appendChild(el('p', 'pv-confirm__x', TEXTS.dangerConfirmText));
    var acts = el('div', 'pv-confirm__acts');
    var cancel = el('button', 'btn btn--secondary btn--md'); cancel.appendChild(el('span', 'btn__label', TEXTS.dangerConfirmCancel));
    var ok = el('button', 'btn btn--danger btn--md'); ok.appendChild(el('span', 'btn__label', TEXTS.dangerConfirmOk));
    cancel.onclick = function () { wrap.remove(); cb(false); };
    ok.onclick = function () { wrap.remove(); cb(true); };
    acts.appendChild(cancel); acts.appendChild(ok); box.appendChild(acts); wrap.appendChild(box);
    (document.getElementById('pv-stage') || document.body).appendChild(wrap);
  }

  // ---- 一行参数 ------------------------------------------------------------------------------------
  function paramRow(p) {
    if (p.kind === 'seg') {
      var r = row('key'); r.setAttribute('data-dja-key', p.key);
      r.appendChild(label(p.label, p.hint));
      var seg = el('div', 'set-seg'); seg.setAttribute('role', 'radiogroup');
      (p.options || []).forEach(function (o) {
        var b = el('button', p.value === o ? 'is-on' : '', (p.optionLabels || {})[o] || o);
        b.type = 'button'; b.setAttribute('role', 'radio'); b.setAttribute('aria-checked', p.value === o ? 'true' : 'false');
        if (p.disabled) b.disabled = true; else b.onclick = function () { setParam(p.key, o); };
        seg.appendChild(b);
      });
      r.appendChild(seg); return r;
    }
    var lab = el('label', 'set-row'); lab.setAttribute('data-dja-key', p.key);
    lab.appendChild(label(p.label, p.hint));
    if (p.kind === 'frames') {
      var wrap = el('span', 'sp-dja__numwrap');
      var inp = el('input', 'sp-dja__num'); inp.type = 'number'; inp.inputMode = 'numeric';
      inp.min = p.min; inp.max = p.max; inp.step = p.step; inp.disabled = !!p.disabled;
      if (!p.disabled) inp.value = p.value;
      inp.oninput = function () { var v = Number(inp.value); if (Number.isFinite(v)) setParam(p.key, Math.round(v)); };
      wrap.appendChild(inp); wrap.appendChild(el('span', 'sp-dja__unit', '帧')); lab.appendChild(wrap);
    } else {
      var i2 = el('input', 'set-range sp-dja__range'); i2.type = 'range';
      i2.min = p.min; i2.max = p.max; i2.step = p.step; i2.disabled = !!p.disabled;
      i2.value = p.disabled ? p.min : p.value;
      i2.style.setProperty('--pct', (p.max === p.min ? 0 : Math.round(((p.value - p.min) / (p.max - p.min)) * 100)) + '%');
      if (!p.disabled) i2.oninput = function () { setParam(p.key, Number(i2.value)); };
      lab.appendChild(i2);
    }
    var val = el('span', 'set-row__val num', p.text); val.style.cssText = VAL;
    val.setAttribute('data-dja-val', p.key); lab.appendChild(val); return lab;
  }

  // ---- ★⑤ 目录树：<details> **不受控**（创建时只设一次 open）⇒ 重画时才恢复展开态，点击不触发重画 ----------
  function treeRows(list, openMap) {
    var frag = document.createDocumentFragment();
    list.forEach(function (r) {
      if (r.children) {
        var d = el('details', 'sp-dja__node');
        if (openMap[r.id]) d.open = true;                    // ★ 只在创建时定一次；用户点开的由浏览器自己记
        var sm = el('summary', r.selected ? 'is-sel' : '');
        sm.appendChild(el('span', 'sp-dja__caret', '▸'));
        sm.appendChild(el('span', 'sp-dja__leafname', r.name));
        if (r.danger) { var w = el('span', 'sp-dja__danger', '⚠'); w.title = '危险元素：转起来可能点不到设置'; sm.appendChild(w); }
        sm.appendChild(el('span', 'sp-dja__count', String(r.count)));
        sm.appendChild(el('span', 'sp-dja__badge is-' + r.mode, r.modeLabel));
        sm.onclick = function () { if (r.kind !== 'leaf') sel = r.id; markScroll(); };   // ★ 不 preventDefault、不重画
        d.appendChild(sm);
        var kids = el('div', 'sp-dja__kids'); kids.appendChild(treeRows(r.children, openMap)); d.appendChild(kids);
        frag.appendChild(d);
      } else {
        var lf = el('div', 'sp-dja__leaf' + (r.selected ? ' is-sel' : '') + (r.unavailable ? ' is-un' : ''));
        lf.setAttribute('data-dja-leaf', r.id);
        lf.title = r.unavailable || r.sub;
        lf.appendChild(el('span', 'sp-dja__leafname', r.name));
        if (r.danger) { var w2 = el('span', 'sp-dja__danger', '⚠'); w2.title = '危险元素：转起来可能点不到设置'; lf.appendChild(w2); }
        lf.appendChild(el('span', 'sp-dja__id', r.sub));
        lf.appendChild(el('span', 'sp-dja__badge is-' + r.mode, r.modeLabel));
        lf.onclick = function () { sel = r.id; markScroll(); drawAll(); };               // 选元素要重画（头部信息变了）
        frag.appendChild(lf);
      }
    });
    return frag;
  }

  function section(title, kids, attrs) {
    var s = el('div', 'sp-dja__sec');
    if (attrs) Object.keys(attrs).forEach(function (k) { s.setAttribute(k, attrs[k]); });
    s.appendChild(el('span', 'sp-dja__h', title));
    (kids || []).forEach(function (c) { if (c) s.appendChild(c); });
    return s;
  }

  // ---- ★① 战况读数 + ③ 黄框（与真机同源的两条逻辑）--------------------------------------------------
  var scrollMemo = {};
  function markScroll() { var t = document.getElementById('pv-tree'); if (t) scrollMemo.tree = t.scrollTop; }
  function restoreScroll() { var t = document.getElementById('pv-tree'); if (t && scrollMemo.tree) t.scrollTop = scrollMemo.tree; }

  function leavesOfNode(node) {
    var out = [];
    (function w(n) { if (!n) return; if (n.kind === 'leaf') { out.push(n); return; } (n.children || []).forEach(w); })(node);
    return out;
  }
  function hlDraw() {
    var layer = document.getElementById('pv-hl');
    var stage = document.getElementById('pv-battle') || document.getElementById('pv-stage');
    var res = { boxes: 0, miss: 0, pixi: 0 };
    if (!layer || !stage) return res;
    layer.textContent = '';
    var f = D.fabModel(cfg);
    if (!f.hl || !sel) return res;
    var node = D.TREE_BY_ID[sel];
    if (!node) return res;
    var sb = stage.getBoundingClientRect();
    var seen = {};
    leavesOfNode(node).forEach(function (lf) {
      var e = lf.el;
      if (!e) return;
      if (e.pixi) { res.pixi++; return; }
      if (!e.sel) return;
      var els = [];
      try { els = stage.querySelectorAll(e.sel); } catch (err) { els = []; }
      if (!els.length) { res.miss++; return; }
      for (var i = 0; i < els.length; i++) {
        var r = els[i].getBoundingClientRect();
        if (r.width <= 0.5 && r.height <= 0.5) continue;
        var d = document.createElement('i');
        d.style.left = Math.round(r.left - sb.left) + 'px'; d.style.top = Math.round(r.top - sb.top) + 'px';
        d.style.width = Math.round(r.width) + 'px'; d.style.height = Math.round(r.height) + 'px';
        if (!seen[e.id]) { seen[e.id] = 1; var t = el('b', '', e.id); d.appendChild(t); }
        layer.appendChild(d); res.boxes++;
      }
    });
    return res;
  }
  function hlCount() { return hlDraw(); }
  function hlText() {
    var f = D.fabModel(cfg);
    if (!f.hl) return TEXTS.hlOff;
    if (!sel) return '在目录里点一个元素就会标出来。';
    var n = hlCount();
    if (n.pixi > 0 && n.boxes === 0) return TEXTS.hlPixi;
    if (n.boxes > 0) return '已在画面上标出 ' + n.boxes + ' 个位置';
    if (n.miss > 0) return '这块预览画面里没有它（预览只搭了战斗屏骨架那一层，真机上是完整画面）。';
    return '没找到它在画面上的位置（这个元素此刻不在场）。';
  }
  function mockReadout() {
    var items = D.compile(cfg, D.TREE);
    var dom = items.filter(function (i) { return i.sel; });
    var grp = items.filter(function (i) { return i.pixi; });
    var r = row('ro'); r.appendChild(label('运行读数', TEXTS.footer));
    var ro = el('span', 'sp-dja__ro', '预览页没有真引擎：按配置复算 ⇒ 生效 ' + items.length + ' 项（DOM ' + dom.length
      + ' · 画布 ' + grp.length + '）。真机上这里是引擎实测读数（注入 KB / 帧耗时 / 画布帧回调）。');
    ro.setAttribute('data-dja-ro', 'run'); r.appendChild(ro); return r;
  }

  // ---- 两种摆放 ------------------------------------------------------------------------------------
  function renderFull(root) {
    var on = D.onModel(cfg); var fab = D.fabModel(cfg);
    var h = D.headModel(cfg, sel, D.TREE);
    root.textContent = '';
    var note = el('div', 'set-row'); note.appendChild(el('span', 'set-row__label', '这个 Mod 做什么'));
    note.appendChild(el('span', 'sp-dja__mode-note', TEXTS.intro));
    var warn = on.on ? null : (function () { var w = el('div', 'sp-dja__warn'); w.setAttribute('data-dja-on-warn', '1'); w.appendChild(el('b', '', '总开关是关的')); w.appendChild(el('span', '', TEXTS.onOffNote)); return w; })();
    root.appendChild(section('说明', [note, warn, mockReadout()], { 'data-dja-group': '说明' }));

    root.appendChild(section('总开关', [
      toggleRow('on', TEXTS.onLabel, TEXTS.onHint, on.on, function () { patch({ on: !on.on }); }),
      (function () { var r = row('ro'); r.appendChild(el('span', 'set-row__label', '当前')); var ro = el('span', 'sp-dja__ro', on.text); ro.setAttribute('data-dja-ro', 'on'); r.appendChild(ro); return r; })(),
    ], { 'data-dja-group': '总开关' }));

    root.appendChild(section('局内', [
      toggleRow('fab-on', TEXTS.fabOn, TEXTS.fabHint, fab.on, function () { patch({ fab: { on: !fab.on } }); }),
      (function () {
        var r = el('div', 'set-row'); r.appendChild(el('span', 'set-row__label', TEXTS.fabPos));
        var w = el('div', 'sp-dja__side-by');
        var pos = el('span', 'sp-dja__id', fab.posText); pos.setAttribute('data-dja-fab-pos', '1'); w.appendChild(pos);
        var rb = el('button', 'btn btn--secondary btn--sm'); rb.type = 'button';
        var rl = el('span', 'btn__label', TEXTS.fabReset); rb.appendChild(rl);
        rb.onclick = function () { patch({ fab: { x: 0.952, y: 0.66 } }); }; w.appendChild(rb);
        r.appendChild(w); return r;
      })(),
      sliderRow('fab-alpha', TEXTS.fabAlpha, '1', 35, 100, fab.alphaPct, false, function (v) { patch({ fab: { alpha: v / 100 } }); }),
      toggleRow('hl-on', TEXTS.hlOn, TEXTS.hlHint, fab.hl, function () { patch({ fab: { hl: !fab.hl } }); }),
      (function () { var r = row('ro'); r.appendChild(el('span', 'set-row__label', '位置高亮')); var ro = el('span', 'sp-dja__ro', hlText()); ro.setAttribute('data-dja-ro', 'hl'); r.appendChild(ro); return r; })(),
      (function () { var r = row('ro'); r.appendChild(el('span', 'set-row__label', '元素配置在哪')); var ro = el('span', 'sp-dja__ro', TEXTS.scopeFloatNote); ro.setAttribute('data-dja-ro', 'where'); r.appendChild(ro); return r; })(),
    ], { 'data-dja-group': '局内' }));

    root.appendChild(section('恢复出厂', [
      (function () {
        var r = el('div', 'set-row'); r.appendChild(label('全部', TEXTS.resetHint));
        var w = el('div', 'sp-dja__side-by');
        var b = el('button', 'btn btn--secondary btn--sm'); b.type = 'button'; b.appendChild(el('span', 'btn__label', TEXTS.resetLabel));
        b.onclick = function () { cfg = D.sanitize(null); sel = null; drawAll(); }; w.appendChild(b);
        r.appendChild(w); return r;
      })(),
    ], { 'data-dja-group': '恢复出厂' }));
  }

  function renderElements(root) {
    var h = D.headModel(cfg, sel, D.TREE);
    var on = D.onModel(cfg); var rnd = D.rndModel(cfg);
    root.textContent = '';
    // ---- 配置（选中的元素）----
    var kids = [];
    if (h.empty) {
      var em = el('div', 'sp-dja__empty'); em.innerHTML = '<b>' + esc(TEXTS.emptyTitle) + '</b><br />' + esc(TEXTS.emptyHint);
      kids.push(em);
    } else {
      var nrow = el('div', 'set-row'); nrow.setAttribute('data-dja-head', '1');
      nrow.setAttribute('data-dja-head-id', h.id); nrow.setAttribute('data-dja-head-name', h.name);
      nrow.appendChild(label(h.name, h.modeHint));
      var side = el('div', 'sp-dja__side-by');
      side.appendChild(el('span', 'sp-dja__id', h.id)); side.appendChild(el('span', 'sp-dja__count', h.pathLabel));
      nrow.appendChild(side); kids.push(nrow);
      var mrow = el('div', 'set-row'); mrow.setAttribute('data-dja-mode', '1');
      mrow.appendChild(el('span', 'set-row__label', '档位'));
      var seg = el('div', 'set-seg'); seg.setAttribute('role', 'radiogroup');
      h.modes.forEach(function (m) {
        var b = el('button', m.on ? 'is-on' : '', m.label); b.type = 'button'; b.setAttribute('role', 'radio');
        b.setAttribute('data-dja-mode-opt', m.id); b.setAttribute('aria-checked', m.on ? 'true' : 'false');
        b.onclick = function () { setMode(h.id, m.id); }; seg.appendChild(b);
      });
      mrow.appendChild(seg); kids.push(mrow);
      if (h.danger) {
        var w = el('div', 'sp-dja__warn'); w.setAttribute('data-dja-warn', '1');
        w.appendChild(el('b', '', '⚠ 危险元素')); w.appendChild(el('span', '', h.dangerText)); kids.push(w);
      }
      h.params.forEach(function (p) { kids.push(paramRow(p)); });
    }
    root.appendChild(section('配置（选中的元素）', kids, { 'data-dja-group': '配置（选中的元素）' }));

    // ---- 随机偏移（可展开）----
    var rbox = el('details', 'sp-dja__node'); rbox.setAttribute('data-dja-rnd', '1'); if (rnd.on) rbox.open = true;
    var rsm = el('summary', '');
    rsm.appendChild(el('span', 'sp-dja__caret', '▸'));
    rsm.appendChild(el('span', 'sp-dja__leafname', TEXTS.rndGroup)); rsm.appendChild(hint(TEXTS.rndHint));
    var rbadge = el('span', 'sp-dja__badge ' + (rnd.on ? 'is-own' : 'is-off'), rnd.text);
    rbadge.setAttribute('data-dja-rnd-badge', '1'); rsm.appendChild(rbadge); rbox.appendChild(rsm);
    var rkids = el('div', 'sp-dja__kids');
    rkids.appendChild(toggleRow('rnd-on', TEXTS.rndOn, '', rnd.on, function () { patch({ rnd: { on: !rnd.on } }); }));
    rkids.appendChild(sliderRow('rnd-key', '最小幅度', 'loPct', rnd.min, rnd.max, rnd.loPct, !rnd.on, function (v) { patch({ rnd: { loPct: v } }); }));
    rkids.appendChild(sliderRow('rnd-key', '最大幅度', 'hiPct', rnd.min, rnd.max, rnd.hiPct, !rnd.on, function (v) { patch({ rnd: { hiPct: v } }); }));
    var rro = row('ro'); rro.appendChild(el('span', 'set-row__label', '作用范围'));
    var rroT = el('span', 'sp-dja__ro', rnd.affects + ' · ' + TEXTS.rndNote); rroT.setAttribute('data-dja-ro', 'rnd'); rro.appendChild(rroT);
    rkids.appendChild(rro); rbox.appendChild(rkids); root.appendChild(rbox);

    // ---- 元素目录 ----
    var openMap = scrollMemo.open || { 'L:top': true, 'L:corner': true, 'L:mod': true };
    var tw = el('div', 'sp-dja__tree'); tw.id = 'pv-tree'; tw.setAttribute('data-dja-tree', '1');
    tw.appendChild(treeRows(D.annotate(D.TREE, cfg, sel, null), openMap));
    var dkids = [];
    if (!on.on) { var w2 = el('div', 'sp-dja__warn'); w2.setAttribute('data-dja-on-warn', '1'); w2.appendChild(el('b', '', '总开关是关的')); w2.appendChild(el('span', '', TEXTS.onOffNote)); dkids.push(w2); }
    dkids.push(tw);
    var brow = el('div', 'set-row'); brow.appendChild(label(TEXTS.resetElementsLabel, TEXTS.resetElementsHint));
    var bw = el('div', 'sp-dja__side-by');
    var rb = el('button', 'btn btn--secondary btn--sm'); rb.type = 'button'; rb.appendChild(el('span', 'btn__label', TEXTS.resetElementsLabel));
    rb.onclick = function () { cfg = D.sanitize({ on: cfg.on, fab: cfg.fab }); sel = null; drawAll(); };
    bw.appendChild(rb); brow.appendChild(bw); dkids.push(brow);
    root.appendChild(section('元素目录（按层级展开）', dkids, { 'data-dja-group': '元素目录' }));
  }

  function drawAll() {
    // ★⑤ 记住目录里"哪些 details 是开着的" + 滚动位置，重画后恢复（否则一点开就被顶回顶部）
    var openMap = {};
    var t0 = document.getElementById('pv-tree');
    if (t0) {
      var sc = t0.scrollTop;
      [].forEach.call(t0.querySelectorAll('details'), function (d) {
        var sum = d.querySelector('summary .sp-dja__leafname');
        if (d.open && sum) openMap['N:' + sum.textContent] = true;
      });
      scrollMemo.tree = sc;
    }
    scrollMemo.open = scrollMemo.open || {};
    // 用"名字 → id"重新映射（annotate 的顺序稳定，直接用索引也行：这里用名字前缀匹配）
    var rowsAll = D.annotate(D.TREE, cfg, sel, null);
    scrollMemo.open = {};
    (function map(list) {
      list.forEach(function (r) {
        if (r.children) { if (openMap['N:' + r.name]) scrollMemo.open[r.id] = true; map(r.children); }
      });
    })(rowsAll);

    var full = document.getElementById('pv-section');
    var floatSec = document.getElementById('pv-float-section');
    if (full) renderFull(full);
    if (floatSec) renderElements(floatSec);
    hlDraw();
    restoreScroll();
    var box = document.getElementById('pv-state');
    if (box) box.textContent = '当前配置：' + JSON.stringify({ on: cfg.on, glob: cfg.glob, rnd: cfg.rnd, fab: cfg.fab, nodes: cfg.nodes });
  }

  drawAll();

  window.__DJA_PREVIEW__ = {
    cfg: function () { return JSON.parse(JSON.stringify(cfg)); },
    sel: function () { return sel; },
    pick: function (id) { sel = id; drawAll(); return sel; },
    setMode: function (id, m) { setMode(id, m); return D.modeOf(cfg, id); },
    setParam: setParam,
    setOn: function (v) { patch({ on: !!v }); return cfg.on; },
    reset: function () { cfg = D.sanitize(null); sel = null; drawAll(); },
    resetElements: function () { cfg = D.sanitize({ on: cfg.on, fab: cfg.fab }); sel = null; drawAll(); },
    on: function () { return D.onModel(cfg); },
    rnd: function () { return D.rndModel(cfg); },
    fab: function () { return D.fabModel(cfg); },
    hl: function () { return hlDraw(); },
    treeLeaves: function () {
      var n = 0;
      (function w(l) { l.forEach(function (r) { r.children ? w(r.children) : n++; }); })(D.annotate(D.TREE, cfg, null, null));
      return n;
    },
  };
})();
