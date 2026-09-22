// vine-map.js — 藤蔓关卡地图（SVG 渲染 + 分页）。见 AGENTS.md 2.2 / 2.3 / 5.1 与 DECISIONS D039（19.2）。
//
// 边界（2.3）：只做两件事 —— 读坐标/星级 → 画 SVG。**不读游戏状态、不写存档、不绑全局事件**
// （事件由 app.js 在宿主元素上做委托）。坐标来自 `level.js` 的 `LEVEL_MAP_POS`（真相源是 `LEVELS.md` §9），
// 星级由调用方从 `storage.js` 读好后传进来。
//
// 确定性（19.2 的核心约束）：路径控制点的抖动只由 `VINE_MAP_CONFIG.seed` 决定（`mulberry32(seed + page)`），
// **不使用运行时随机** —— 同配置永远画出同一条 `d`，因此可以断言「两次渲染完全一致」。
//
// 分页（用户批准的滚动口径 (a)）：每页 `pageSize` 关、5 页 = 50 关；页序与 §5 的 50 关表一致。
// 地图是**画布外的绝对定位层**，不参与 `computeBoardSize`，也不改变既有像素取证。

import { CONFIG } from './config.js';
import { LEVEL_MAP_POS } from './level.js';

const MAP = CONFIG.VINE_MAP_CONFIG;
const SVG_NS = 'http://www.w3.org/2000/svg';

/** 每页关卡数（= `VINE_MAP_CONFIG.pageSize`）。 */
export const MAP_PAGE_SIZE = MAP.pageSize;

/** 页数 = ⌈关卡数 / 每页关卡数⌉。 */
export function pageCount(levelCount = LEVEL_MAP_POS.length) {
  return Math.max(1, Math.ceil(levelCount / MAP.pageSize));
}

/** 第 `page` 页的关卡坐标（按关号升序）。越界页夹到 [1, 页数]。 */
export function positionsOnPage(page, levelCount = LEVEL_MAP_POS.length) {
  const total = pageCount(levelCount);
  const wanted = Math.min(Math.max(Math.trunc(Number(page)) || 1, 1), total);
  return LEVEL_MAP_POS.filter((pos) => pos.page === wanted);
}

/** 关号 → 所在页（供「进入某关后地图停在哪一页」用）。 */
export function pageOf(levelId) {
  return Math.min(Math.max(Math.ceil((Number(levelId) || 1) / MAP.pageSize), 1), pageCount());
}

/** 星级规范化：只接受 0–3 的整数（脏数据 → 0），与 3.7 的三星口径一致。 */
export function clampStars(value) {
  const stars = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(stars, 0), 3);
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
 * 第 `page` 页的藤蔓路径（SVG path 的 `d`）：从页顶边缘出发，穿过本页 10 个节点，到页底边缘
 * （上下两端各留一段「跨页接口」，视觉上是一条延续的藤蔓）。
 * 曲线用 Catmull-Rom 式的三次贝塞尔近似；**只有控制点带抖动**（节点坐标是显式的，不会被抖动挪动）。
 */
export function buildVinePath(page) {
  const anchors = buildVineAnchors(page);
  if (anchors.length < 2) return '';
  const rng = mulberry32(MAP.seed + (Math.trunc(Number(page)) || 1));
  const jitter = () => (rng() * 2 - 1) * MAP.pathJitter;
  const round = (value) => Math.round(value * 10) / 10;

  let d = `M ${round(anchors[0].x)} ${round(anchors[0].y)}`;
  for (let i = 1; i < anchors.length; i += 1) {
    const prev = anchors[i - 1];
    const curr = anchors[i];
    const dx = curr.x - prev.x;
    const dy = curr.y - prev.y;
    const c1x = prev.x + dx * 0.35 + jitter();
    const c1y = prev.y + dy * 0.3;
    const c2x = curr.x - dx * 0.35 + jitter();
    const c2y = curr.y - dy * 0.3;
    d += ` C ${round(c1x)} ${round(c1y)}, ${round(c2x)} ${round(c2y)}, ${round(curr.x)} ${round(curr.y)}`;
  }
  return d;
}

/** 路径锚点：页顶边缘 → 本页各节点 → 页底边缘（纯函数，供巡检脚本复用）。 */
export function buildVineAnchors(page) {
  const nodes = positionsOnPage(page);
  return [
    { x: MAP.width / 2, y: 0 },
    ...nodes.map((pos) => ({ x: pos.x, y: pos.y })),
    { x: MAP.width / 2, y: MAP.height }
  ];
}

/** 单个节点的 SVG（`<g data-level data-stars role=listitem tabindex=0 aria-label>`）。 */
function buildNode(position, stars) {
  const earned = clampStars(stars?.[position.id] ?? stars?.[String(position.id)] ?? 0);
  const group = document.createElementNS(SVG_NS, 'g');
  group.setAttribute('class', 'vine-node');
  group.setAttribute('data-level', String(position.id));
  group.setAttribute('data-stars', String(earned));
  group.setAttribute('role', 'listitem');
  group.setAttribute('tabindex', '0');
  group.setAttribute('aria-label', `第 ${position.id} 关，${earned} 星`);
  if (earned > 0) group.classList.add('vine-node--cleared');

  const circle = document.createElementNS(SVG_NS, 'circle');
  circle.setAttribute('class', 'vine-node-body');
  circle.setAttribute('cx', String(position.x));
  circle.setAttribute('cy', String(position.y));
  circle.setAttribute('r', String(MAP.nodeRadius));
  group.appendChild(circle);

  const label = document.createElementNS(SVG_NS, 'text');
  label.setAttribute('class', 'vine-node-label');
  label.setAttribute('x', String(position.x));
  label.setAttribute('y', String(position.y + 5));
  label.setAttribute('text-anchor', 'middle');
  label.textContent = String(position.id);
  group.appendChild(label);

  const starsText = document.createElementNS(SVG_NS, 'text');
  starsText.setAttribute('class', 'vine-node-stars');
  starsText.setAttribute('x', String(position.x));
  starsText.setAttribute('y', String(position.y + MAP.nodeRadius + 14));
  starsText.setAttribute('text-anchor', 'middle');
  starsText.textContent = '★'.repeat(earned) + '☆'.repeat(3 - earned);
  group.appendChild(starsText);
  return group;
}

/**
 * 把地图画进宿主元素（`index.html` 的 `#map`）。**幂等**：每次调用都重建内容。
 * 返回 `{ page, total }`；事件（点节点 / 点分页）由调用方在宿主上做事件委托 —— 本函数不绑事件。
 */
export function renderMap(host, { page = 1, stars = {}, levelCount = LEVEL_MAP_POS.length } = {}) {
  if (!host) return { page: 1, total: 1 };
  const total = pageCount(levelCount);
  const current = Math.min(Math.max(Math.trunc(Number(page)) || 1, 1), total);
  host.textContent = '';

  const svg = document.createElementNS(SVG_NS, 'svg');
  svg.setAttribute('class', 'vine-svg');
  svg.setAttribute('viewBox', `0 0 ${MAP.width} ${MAP.height}`);
  svg.setAttribute('role', 'list');
  svg.setAttribute('aria-label', '关卡地图');

  const path = document.createElementNS(SVG_NS, 'path');
  path.setAttribute('id', 'vine-path');
  path.setAttribute('class', 'vine-path');
  path.setAttribute('d', buildVinePath(current));
  svg.appendChild(path);

  for (let p = 1; p <= total; p += 1) {
    const group = document.createElementNS(SVG_NS, 'g');
    group.setAttribute('class', 'vine-page');
    group.setAttribute('data-page', String(p));
    group.style.display = p === current ? '' : 'none'; // 只显示当前页；其余仍在 DOM 里（便于断言 50 节点齐全）
    for (const position of LEVEL_MAP_POS.filter((pos) => pos.page === p)) {
      group.appendChild(buildNode(position, stars));
    }
    svg.appendChild(group);
  }
  host.appendChild(svg);

  const pager = document.createElement('div');
  pager.setAttribute('class', 'vine-pager');
  pager.setAttribute('role', 'group');
  pager.setAttribute('aria-label', '地图分页');
  for (let p = 1; p <= total; p += 1) {
    const button = document.createElement('button');
    button.type = 'button';
    button.setAttribute('class', 'vine-pager-button');
    button.setAttribute('data-pager', String(p));
    button.setAttribute('aria-current', p === current ? 'true' : 'false');
    button.textContent = `${(p - 1) * MAP.pageSize + 1}–${p * MAP.pageSize}`;
    pager.appendChild(button);
  }
  host.appendChild(pager);

  // 路径生长动画：下一帧加 .grown（`stroke-dashoffset` 0 → 藤蔓从页顶「长」出来）
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => path.classList.add('grown'));
  }
  return { page: current, total };
}
