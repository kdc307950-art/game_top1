// vine-map.js — 藤蔓关卡地图（SVG 渲染 + 分页 + 确定性路径）。见 AGENTS.md 2.2 / 2.3 / 5.1 与 DECISIONS D040（19.2 v2）。
//
// 边界（2.3）：只做两件事 —— 读「坐标 + 星级 + 当前关」→ 画 SVG。**不读游戏状态、不写存档、不绑全局事件**
// （事件由 app.js 在宿主元素上做委托）。坐标来自 `level.js` 的 `LEVEL_MAP_POS`（真相源是 `LEVELS.md` §9），
// 星级与总星数由调用方从 `storage.js` 读好后传进来（总星数可经 `getTotalStars()` 纯函数派生）。
//
// 归一化坐标（19.2 v2 的核心口径）：`VINE_MAP_CONFIG.anchors` 与 `LEVEL_MAP_POS` 都是 **0–1** 的值，
// 渲染时乘 viewBox 宽高（`width`/`height`），再由 SVG 缩放到容器 —— 巡检脚本只比归一化值，不依赖设备像素。
//
// 确定性（设计期派生）：路径只由 `VINE_MAP_CONFIG.anchors` + `mulberry32(seed + page)` 决定 ——
// **代码里不写死任何控制点**，也**不使用运行时随机**；节点坐标是显式的、**不参与路径计算**（D040 的取舍）。
//
// 分页（用户批准的滚动口径 (a)）：每页 `pageSize` 关、5 页 = 50 关；分页是**按钮**（不是滚动容器），
// 翻页用 `transform: translateX` + `transition` 做平滑位移。地图是**画布外的绝对定位层**，不参与 `computeBoardSize`。

import { CONFIG } from './config.js';
import { LEVEL_MAP_POS } from './level.js';

const MAP = CONFIG.VINE_MAP_CONFIG;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'text', 'rect', 'line', 'polygon']);

/** 每页关卡数（= `VINE_MAP_CONFIG.pageSize`）。 */
export const MAP_PAGE_SIZE = MAP.pageSize;

/** 页数 = ⌈关卡数 / 每页关卡数⌉。 */
export function pageCount(levelCount = LEVEL_MAP_POS.length) {
  return Math.max(1, Math.ceil(levelCount / MAP.pageSize));
}

/** 第 `page` 页的关卡坐标（按关号升序，归一化）。越界页夹到 [1, 页数]。 */
export function positionsOnPage(page, levelCount = LEVEL_MAP_POS.length) {
  const wanted = clampPage(page, pageCount(levelCount));
  return LEVEL_MAP_POS.filter((pos) => pos.page === wanted);
}

/** 关号 → 所在页（供「进入某关后地图停在哪一页」用）。 */
export function pageOf(levelId) {
  return clampPage(Math.ceil((Number(levelId) || 1) / MAP.pageSize), pageCount());
}

/** 星级规范化：只接受 0–3 的整数（脏数据 → 0），与 3.7 的三星口径一致。 */
export function clampStars(value) {
  const stars = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(stars, 0), 3);
}

/**
 * 节点状态机：只有 `visited`（已通关）与 `attainable`（可玩未通关）两态。
 * **19.2 阶段不允许出现 `locked`** —— 只画不拦，点哪关进哪关（D039 第 5 条 / D040）。
 */
export function nodeState(earned) {
  return clampStars(earned) > 0 ? 'visited' : 'attainable';
}

/** mulberry32：小而确定的 PRNG —— 只用于「同种子同路径」，不用于玩法。 */
export function mulberry32(seed) {
  let state = seed >>> 0;
  return function next() {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * 路径锚点（viewBox 像素）：**只来自 `VINE_MAP_CONFIG.anchors`**，与 `LEVEL_MAP_POS` / 节点无关。
 * 归一化 y 允许略超 1（出口）与小于 1（入口），两页衔接即「延伸出屏」的接口。
 */
export function buildVineAnchors() {
  return MAP.anchors.map((anchor) => ({ x: round3(anchor.x * MAP.width), y: round3(anchor.y * MAP.height) }));
}

/**
 * 路径的贝塞尔分段：控制点 = **弦中点分解 + 固定种子抖动**（两类来源，代码里不写死控制点坐标）。
 * 返回 `[{ from, c1, c2, to }]`，与 `buildVinePath` 的 `d` 一一对应（供测试断言「曲线不是直线拼接」）。
 */
export function buildVineSegments(page) {
  const anchors = buildVineAnchors();
  const rng = mulberry32(MAP.seed + clampPage(page, pageCount()));
  const jitter = () => (rng() * 2 - 1) * MAP.pathJitter;
  const segments = [];
  for (let i = 1; i < anchors.length; i += 1) {
    const from = anchors[i - 1];
    const to = anchors[i];
    const mid = { x: (from.x + to.x) / 2, y: (from.y + to.y) / 2 };
    segments.push({
      from,
      c1: { x: round1((from.x + mid.x) / 2 + jitter()), y: round1((from.y + mid.y) / 2 + jitter()) },
      c2: { x: round1((to.x + mid.x) / 2 + jitter()), y: round1((to.y + mid.y) / 2 + jitter()) },
      to
    });
  }
  return segments;
}

/** 第 `page` 页的藤蔓 `d`：一条平滑的三次贝塞尔曲线（M → 若干 C）。 */
export function buildVinePath(page) {
  const segments = buildVineSegments(page);
  if (segments.length === 0) return '';
  const { from, c1, c2, to } = segments[0];
  let d = `M ${round1(from.x)} ${round1(from.y)}`;
  d += ` C ${round1(c1.x)} ${round1(c1.y)}, ${round1(c2.x)} ${round1(c2.y)}, ${round1(to.x)} ${round1(to.y)}`;
  for (const seg of segments.slice(1)) {
    d += ` C ${round1(seg.c1.x)} ${round1(seg.c1.y)}, ${round1(seg.c2.x)} ${round1(seg.c2.y)}, ${round1(seg.to.x)} ${round1(seg.to.y)}`;
  }
  return d;
}

/** 五角星路径（星星用真实形状而不是 `★` 字形，才能按 px 放大与描边）。 */
export function starPath(cx, cy, size) {
  const outer = size / 2;
  const inner = outer * 0.45;
  let d = '';
  for (let i = 0; i < 10; i += 1) {
    const radius = i % 2 === 0 ? outer : inner;
    const angle = -Math.PI / 2 + (i * Math.PI) / 5;
    d += `${i === 0 ? 'M' : 'L'} ${round1(cx + radius * Math.cos(angle))} ${round1(cy + radius * Math.sin(angle))} `;
  }
  return `${d}Z`;
}

/** 单个节点（`<g data-level data-stars data-state role=listitem tabindex=0 aria-label>`，无内联样式）。 */
function buildNode(position, stars, current) {
  const earned = clampStars(stars?.[position.id] ?? stars?.[String(position.id)] ?? 0);
  const state = nodeState(earned);
  const cx = round1(position.x * MAP.width);
  const cy = round1(position.y * MAP.height);
  const classes = ['vine-node', `vine-node--${state}`];
  if (state === 'visited') classes.push('vine-node--cleared');
  if (position.id === current) classes.push('vine-node--current');
  const node = el('g', {
    class: classes.join(' '),
    'data-level': String(position.id),
    'data-stars': String(earned),
    'data-state': state,
    'data-current': position.id === current ? 'true' : null,
    role: 'listitem',
    tabindex: '0',
    'aria-label': `第 ${position.id} 关，${earned} 星`
  });
  node.appendChild(el('circle', { class: 'vine-node-halo', cx, cy, r: MAP.nodeRadius + 6 }));
  node.appendChild(el('circle', { class: 'vine-node-ring', cx, cy, r: MAP.nodeRadius + 3 }));
  node.appendChild(el('circle', { class: 'vine-node-body', cx, cy, r: MAP.nodeRadius }));
  node.appendChild(el('text', { class: 'vine-node-label', x: cx, y: cy + 5, 'text-anchor': 'middle' }, String(position.id)));
  // 星星：从节点正下方**移出**到右侧（不再压在藤蔓上），尺寸 = starSize × starScale（比原来大 40%），间距 starGap
  const size = MAP.starSize * MAP.starScale;
  const firstX = cx + MAP.nodeRadius + MAP.starGap + size / 2;
  for (let i = 0; i < 3; i += 1) {
    const sx = firstX + i * (size + MAP.starGap);
    node.appendChild(
      el('path', {
        class: `vine-node-star${i < earned ? ' vine-node-star--on' : ''}`,
        d: starPath(sx, cy, size),
        'data-star': String(i + 1)
      })
    );
  }
  return node;
}

/**
 * 叶子与卷须点缀：沿**已入 DOM 的路径**每 `leafSpacing` px 取一点，按前后两点的切线方向旋转。
 * 叶子是内联 `<ellipse>`（零外部素材、零新依赖）；`data-along` / `data-angle` 供巡检脚本独立复算取证。
 */
function decorateLeaves(pathEl, svg) {
  if (typeof pathEl.getTotalLength !== 'function') return 0;
  const total = pathEl.getTotalLength();
  if (!Number.isFinite(total) || total <= MAP.leafSpacing) return 0;
  const at = (length) => pathEl.getPointAtLength(Math.min(Math.max(length, 0), total));
  let count = 0;
  for (let along = MAP.leafSpacing / 2; along <= total - MAP.leafSpacing / 4; along += MAP.leafSpacing) {
    const point = at(along);
    const before = at(along - 2);
    const after = at(along + 2);
    const angle = round1((Math.atan2(after.y - before.y, after.x - before.x) * 180) / Math.PI);
    const leaf = el('g', {
      class: 'vine-leaf',
      transform: `translate(${round1(point.x)} ${round1(point.y)}) rotate(${angle})`,
      'data-along': String(round1(along)),
      'data-angle': String(angle)
    });
    leaf.appendChild(
      el('ellipse', { class: 'vine-leaf-blade', cx: round1(MAP.leafSize * 0.9), cy: 0, rx: MAP.leafSize, ry: round1(MAP.leafSize * 0.45) })
    );
    svg.appendChild(leaf);
    count += 1;
  }
  return count;
}

/** 一页：`<div data-page><svg role=list><path>叶子…节点…</svg></div>`（当前页的路径带 `#vine-path` 供取证）。 */
function buildPage(page, stars, activePage, current) {
  const wrap = el('div', { class: `vine-page${page === activePage ? ' vine-page--active' : ''}`, 'data-page': String(page) });
  const svg = el('svg', {
    class: 'vine-page-svg',
    viewBox: `0 0 ${MAP.width} ${MAP.height}`,
    role: 'list',
    'aria-label': `第 ${page} 页关卡`
  });
  const path = el('path', {
    class: 'vine-path',
    id: page === activePage ? 'vine-path' : null,
    d: buildVinePath(page)
  });
  svg.appendChild(path);
  wrap.dataset.leaves = String(decorateLeaves(path, svg));
  for (const position of positionsOnPage(page)) svg.appendChild(buildNode(position, stars, current));
  wrap.appendChild(svg);
  return wrap;
}

/** 总星数进度条（`⭐ 12/150`；总星数是**派生量**，由调用方从 `storage.js` 读或 `getTotalStars()` 算）。 */
function buildProgress(earned, totalStars) {
  const stars = Math.min(Math.max(Math.trunc(Number(earned)) || 0, 0), totalStars);
  const bar = el('div', { class: 'vine-progress', role: 'img', 'aria-label': `总星数 ${stars} / ${totalStars}` });
  bar.appendChild(el('span', { class: 'vine-progress-text' }, `⭐ ${stars}/${totalStars}`));
  const track = el('div', { class: 'vine-progress-bar' });
  const fill = el('div', { class: 'vine-progress-fill' });
  fill.style.width = `${totalStars > 0 ? round1((stars / totalStars) * 100) : 0}%`; // 唯一的内联样式（进度值，非节点状态）
  track.appendChild(fill);
  bar.appendChild(track);
  return bar;
}

/** 分页控件：`[◀] 第 N / 5 页 [▶]`（按钮，不是滚动容器 —— 5.1 的禁滚动不受影响）。 */
function buildPager(page, total) {
  const pager = el('div', { class: 'vine-pager', role: 'group', 'aria-label': '地图分页' });
  pager.appendChild(
    el('button', { type: 'button', class: 'vine-pager-button', 'data-pager': 'prev', 'aria-label': '上一页', disabled: page <= 1 ? '' : null }, '◀')
  );
  pager.appendChild(el('span', { class: 'vine-pager-label', 'data-pager-label': 'true' }, `第 ${page} / ${total} 页`));
  pager.appendChild(
    el('button', { type: 'button', class: 'vine-pager-button', 'data-pager': 'next', 'aria-label': '下一页', disabled: page >= total ? '' : null }, '▶')
  );
  return pager;
}

/**
 * 把地图画进宿主元素（`index.html` 的 `#map`）。**幂等**：每次调用都重建内容。
 * `fromPage` 用于翻页位移（先落在上一页、再滑到 `page`）；`current` 是当前关卡（呼吸光效高亮）；
 * `totalStars` 是**已获得的总星数**（由调用方用 `storage.getTotalStars()` 派生，地图层不碰存档）。
 * 返回 `{ page, total }`；事件（点节点 / 点分页箭头）由调用方在宿主上做委托 —— 本函数不绑事件。
 */
export function renderMap(host, { page = 1, fromPage = null, stars = {}, current = null, totalStars = 0, levelCount = LEVEL_MAP_POS.length } = {}) {
  if (!host) return { page: 1, total: 1 };
  const total = pageCount(levelCount);
  const active = clampPage(page, total);
  const from = fromPage === null ? active : clampPage(fromPage, total);
  host.textContent = '';
  // 时长/周期数值归 config，样式仍归 CSS：用自定义属性桥接（见 D040）
  host.style.setProperty('--vine-pulse-ms', `${MAP.pulseMs}ms`);
  host.style.setProperty('--vine-leaf-ms', `${MAP.leafSwayMs}ms`);
  host.style.setProperty('--vine-slide-ms', `${MAP.pageSlideMs}ms`);

  const viewport = el('div', { class: 'vine-viewport' });
  const track = el('div', { class: 'vine-track', 'data-active-page': String(active) });
  track.style.setProperty('--vine-pages', String(total)); // 页数来自 config，位移比例仍由 CSS 计算
  track.style.transform = `translateX(${pageShift(from, total)}%)`;
  for (let p = 1; p <= total; p += 1) track.appendChild(buildPage(p, stars, active, current));
  viewport.appendChild(track);
  host.appendChild(viewport);
  // 总星数由调用方用 `storage.getTotalStars()` 派生后传入（地图层不碰存档，也不重复实现派生口径）
  host.appendChild(buildProgress(totalStars, levelCount * 3));
  host.appendChild(buildPager(active, total));

  if (from !== active) {
    // FLIP 式位移：先提交上一页的位置，再改到目标页 —— CSS 的 transition 才有起点可插值
    void track.getBoundingClientRect().width;
    track.style.transform = `translateX(${pageShift(active, total)}%)`;
  }
  // 路径生长观感：下一帧加 `.grown`（`stroke-dashoffset` 4000 → 0）；不依赖 JS 逐帧
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      for (const path of host.querySelectorAll('.vine-path')) path.classList.add('grown');
    });
  }
  return { page: active, total };
}

/** 归一化页码 → 轨道位移百分比（每页 = 100 / total %）。 */
function pageShift(page, total) {
  return round1((-(page - 1) * 100) / Math.max(total, 1));
}

function clampPage(page, total) {
  return Math.min(Math.max(Math.trunc(Number(page)) || 1, 1), total);
}

/** 建元素：SVG 标签走 SVG 命名空间，其余走 HTML（`null` 属性不写）。 */
function el(name, attrs = {}, text = null) {
  const node = SVG_TAGS.has(name) ? document.createElementNS(SVG_NS, name) : document.createElement(name);
  for (const [key, value] of Object.entries(attrs)) if (value !== null && value !== undefined) node.setAttribute(key, String(value));
  if (text !== null) node.textContent = text;
  return node;
}

function round1(value) {
  return Math.round(value * 10) / 10;
}

function round3(value) {
  return Math.round(value * 1000) / 1000;
}
