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
 * 节点状态机：`visited`（已通关）/ `attainable`（可玩未通关）/ **`locked`（星数不够，19.3 新增）**。
 * `unlocked` 由调用方（`app.js`）用 `level.isLevelUnlocked()` 算好后传入 —— **地图层不认识规则**，
 * 它只回答「这一关现在能不能玩」。注意：`visited` 与 `unlocked` 同时成立时取 `visited`（已通关的关卡
 * 永远可玩，这是 19.3 的反锁保护）。
 */
export function nodeState(earned, unlocked = true) {
  if (clampStars(earned) > 0) return 'visited';
  return unlocked ? 'attainable' : 'locked';
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
function buildNode(position, stars, current, unlocked, required) {
  const earned = clampStars(stars?.[position.id] ?? stars?.[String(position.id)] ?? 0);
  const locked = !(unlocked?.[position.id] ?? unlocked?.[String(position.id)] ?? true);
  const state = nodeState(earned, !locked);
  const need = Math.max(0, Math.trunc(Number(required?.[position.id] ?? required?.[String(position.id)] ?? 0)));
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
    'data-locked': locked ? 'true' : null,
    'data-required': String(need),
    'data-current': position.id === current ? 'true' : null,
    role: 'listitem',
    tabindex: locked ? '-1' : '0',
    'aria-disabled': locked ? 'true' : null,
    'aria-label': locked
      ? `第 ${position.id} 关，未解锁，需要 ${need} 星`
      : `第 ${position.id} 关，${earned} 星`
  });
  node.appendChild(el('circle', { class: 'vine-node-halo', cx, cy, r: MAP.nodeRadius + 6 }));
  node.appendChild(el('circle', { class: 'vine-node-ring', cx, cy, r: MAP.nodeRadius + 3 }));
  node.appendChild(el('circle', { class: 'vine-node-body', cx, cy, r: MAP.nodeRadius }));
  // 19.4 画风：左上内嵌高光（一颗半透明白点，做「鼓起来」的立体感；不参与任何状态判定）
  node.appendChild(el('circle', { class: 'vine-node-gloss', cx: round1(cx - MAP.nodeRadius * 0.32), cy: round1(cy - MAP.nodeRadius * 0.34), r: round1(MAP.nodeRadius * 0.3) }));
  node.appendChild(el('text', { class: 'vine-node-label', x: cx, y: cy + 5, 'text-anchor': 'middle' }, String(position.id)));
  // 19.3：锁定的节点在正下方显示「需要 N 星」；19.4 再补一个小锁形图标（纯 SVG path，无素材）
  if (locked) {
    node.appendChild(el('text', { class: 'vine-node-required', x: cx, y: round1(cy + MAP.nodeRadius + 20) }, `${need}⭐`));
    const lockR = MAP.nodeRadius * 0.34;
    const lockY = round1(cy - MAP.nodeRadius * 0.16);
    const lock = el('g', { class: 'vine-node-lock' });
    lock.appendChild(el('path', {
      class: 'vine-node-lock-shackle',
      d: `M ${round1(cx - lockR)} ${lockY} v ${round1(-lockR * 0.9)} a ${round1(lockR)} ${round1(lockR)} 0 0 1 ${round1(lockR * 2)} 0 v ${round1(lockR * 0.9)}`,
      fill: 'none'
    }));
    lock.appendChild(el('rect', {
      class: 'vine-node-lock-body',
      x: round1(cx - lockR * 1.25),
      y: lockY,
      width: round1(lockR * 2.5),
      height: round1(lockR * 1.9),
      rx: round1(lockR * 0.35)
    }));
    node.appendChild(lock);
  }
  // 19.4：当前关卡上方加一枚**指向它的指针**（对应参考专利里「指向玩家最高关卡的指针」，
  // 也解决「从下往上」时不易一眼找到自己位置的问题）；纯 SVG path + CSS 轻微上下浮动。
  if (position.id === current) {
    const tip = round1(cy - MAP.nodeRadius - MAP.arrowOffsetY);
    const half = MAP.arrowSize / 2;
    node.appendChild(el('path', {
      class: 'vine-node-arrow',
      d: `M ${cx} ${round1(tip + MAP.arrowSize)} L ${round1(cx - half)} ${tip} L ${round1(cx + half)} ${tip} Z`
    }));
  }
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

/**
 * 19.4 画风增强之一：**分层背景**（零素材，全部程序化）——
 * 天空渐变（`<linearGradient>`，id 带页码避免跨页冲突）→ 两层远山剪影 → 地面色带。
 * 只是观感层：不参与命中、不改变任何节点/路径坐标，也不引入 `<image>`/`<use>`/`<foreignObject>`。
 */
function buildBackdrop(page) {
  const svgNS = SVG_NS;
  const group = el('g', { class: 'vine-backdrop', 'aria-hidden': 'true' });
  const defs = document.createElementNS(svgNS, 'defs');
  const gradient = document.createElementNS(svgNS, 'linearGradient');
  gradient.setAttribute('id', `vine-sky-${page}`);
  gradient.setAttribute('x1', '0');
  gradient.setAttribute('y1', '1'); // 自下而上的天空：底部偏暖、顶部偏冷
  gradient.setAttribute('x2', '0');
  gradient.setAttribute('y2', '0');
  for (const [offset, color] of [['0%', '#25423a'], ['55%', '#1d3330'], ['100%', '#16262a']]) {
    const stop = document.createElementNS(svgNS, 'stop');
    stop.setAttribute('offset', offset);
    stop.setAttribute('stop-color', color);
    gradient.appendChild(stop);
  }
  defs.appendChild(gradient);
  group.appendChild(defs);
  group.appendChild(el('rect', { class: 'vine-sky', x: 0, y: 0, width: MAP.width, height: MAP.height, fill: `url(#vine-sky-${page})` }));
  group.appendChild(el('path', {
    class: 'vine-hill vine-hill--far',
    d: `M 0 ${round1(MAP.height * 0.34)} Q ${round1(MAP.width * 0.28)} ${round1(MAP.height * 0.22)} ${round1(MAP.width * 0.55)} ${round1(MAP.height * 0.33)} T ${MAP.width} ${round1(MAP.height * 0.26)} V ${MAP.height} H 0 Z`
  }));
  group.appendChild(el('path', {
    class: 'vine-hill vine-hill--near',
    d: `M 0 ${round1(MAP.height * 0.58)} Q ${round1(MAP.width * 0.32)} ${round1(MAP.height * 0.42)} ${round1(MAP.width * 0.62)} ${round1(MAP.height * 0.56)} T ${MAP.width} ${round1(MAP.height * 0.48)} V ${MAP.height} H 0 Z`
  }));
  group.appendChild(el('rect', { class: 'vine-ground', x: 0, y: round1(MAP.height * 0.93), width: MAP.width, height: round1(MAP.height * 0.07) }));
  return group;
}

/** 一页：`<div data-page><svg role=list><背景><路径（双层）>叶子…节点…云层…</svg></div>`（当前页的路径带 `#vine-path` 供取证）。 */
function buildPage(page, stars, activePage, current, options) {
  const wrap = el('div', { class: `vine-page${page === activePage ? ' vine-page--active' : ''}`, 'data-page': String(page) });
  const svg = el('svg', {
    class: 'vine-page-svg',
    viewBox: `0 0 ${MAP.width} ${MAP.height}`,
    role: 'list',
    'aria-label': `第 ${page} 页关卡`
  });
  svg.appendChild(buildBackdrop(page));
  const d = buildVinePath(page);
  // 19.4：藤蔓画**两层**（深色描边 + 亮色核心）—— 同一份 `d`、更粗更「藤」的观感；仍然是确定性路径
  svg.appendChild(el('path', { class: 'vine-path-under', d }));
  const path = el('path', {
    class: 'vine-path',
    id: page === activePage ? 'vine-path' : null,
    d
  });
  svg.appendChild(path);
  wrap.dataset.leaves = String(decorateLeaves(path, svg));
  let hidden = 0;
  for (const position of positionsOnPage(page)) {
    // 天边云层未散去时，隐藏关**不渲染**（19.3：云层代替节点，而不是把节点画暗）
    if (options.revealed?.[position.id] === false || options.revealed?.[String(position.id)] === false) {
      hidden += 1;
      continue;
    }
    svg.appendChild(buildNode(position, stars, current, options.unlocked, options.required));
  }
  if (hidden > 0 && options.tianbian) svg.appendChild(buildCloud(options.tianbian));
  wrap.dataset.hiddenNodes = String(hidden);
  wrap.appendChild(svg);
  return wrap;
}

// 云层的观感常量（只影响画面，不参与规则；与 buildNode 的 +6 / +3 / +5 同类，见 D013）
const CLOUD_PUFFS = [
  [-0.31, 0, 0.24],
  [0, -0.09, 0.3],
  [0.33, 0.02, 0.23],
  [-0.1, 0.08, 0.2],
  [0.18, 0.09, 0.19]
];

/** 天边云层（19.3）：隐藏关未揭示时占据这一页，附「还差 N ⭐」提示（纯 SVG，无内联样式）。 */
function buildCloud(tianbian) {
  const required = Math.max(0, Math.trunc(Number(tianbian?.required) || 0));
  const stars = Math.max(0, Math.trunc(Number(tianbian?.stars) || 0));
  const missing = Math.max(0, required - stars);
  const cx = MAP.width / 2;
  const cy = MAP.height / 2;
  const base = MAP.width * 0.0016 + MAP.nodeRadius;
  const group = el('g', {
    class: 'vine-cloud',
    'data-cloud': 'closed',
    'data-required': String(required),
    'data-missing': String(missing)
  });
  for (const [dx, dy, r] of CLOUD_PUFFS) {
    group.appendChild(
      el('circle', {
        class: 'vine-cloud-puff',
        cx: round1(cx + dx * MAP.width),
        cy: round1(cy + dy * MAP.height),
        r: round1(r * base)
      })
    );
  }
  group.appendChild(el('text', { class: 'vine-cloud-text', x: cx, y: round1(cy + 6), 'text-anchor': 'middle' }, `还差 ${missing} ⭐`));
  group.appendChild(el('text', { class: 'vine-cloud-hint', x: cx, y: round1(cy + 40), 'text-anchor': 'middle' }, `累计 ${required} 星解锁天边关卡`));
  return group;
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
export function renderMap(host, {
  page = 1,
  fromPage = null,
  stars = {},
  current = null,
  totalStars = 0,
  levelCount = LEVEL_MAP_POS.length,
  unlocked = null, // 19.3：{ 关卡id: 是否可玩 }（由 app.js 用 level.isLevelUnlocked 算好；地图层不认识规则）
  required = null, // 19.3：{ 关卡id: 需要多少星 }（节点上显示，供提示与巡检）
  revealed = null, // 19.3：{ 关卡id: false } = 天边云层未散去、不渲染该节点
  tianbian = null, // 19.3：{ open, stars, required } —— 云层状态（云层代替未揭示的节点）
  starTotal = null // 19.3：⭐ n/X 的分母（**主线**满星数，隐藏关不计入）；缺省按节点数 × 3
} = {}) {
  if (!host) return { page: 1, total: 1 };
  const total = pageCount(levelCount);
  const active = clampPage(page, total);
  const from = fromPage === null ? active : clampPage(fromPage, total);
  host.textContent = '';
  // 时长/周期数值归 config，样式仍归 CSS：用自定义属性桥接（见 D040）
  host.style.setProperty('--vine-pulse-ms', `${MAP.pulseMs}ms`);
  host.style.setProperty('--vine-leaf-ms', `${MAP.leafSwayMs}ms`);
  host.style.setProperty('--vine-slide-ms', `${MAP.pageSlideMs}ms`);
  host.style.setProperty('--vine-cloud-ms', `${MAP.cloudDriftMs}ms`); // 19.4：云层的缓慢横向漂移周期

  const viewport = el('div', { class: 'vine-viewport' });
  const track = el('div', { class: 'vine-track', 'data-active-page': String(active) });
  track.style.setProperty('--vine-pages', String(total)); // 页数来自 config，位移比例仍由 CSS 计算
  track.style.transform = `translateX(${pageShift(from, total)}%)`;
  const options = { unlocked, required, revealed, tianbian };
  for (let p = 1; p <= total; p += 1) track.appendChild(buildPage(p, stars, active, current, options));
  viewport.appendChild(track);
  host.appendChild(viewport);
  // 总星数由调用方用 `storage.getTotalStars()` 派生后传入（地图层不碰存档，也不重复实现派生口径）
  // 19.3：分母是**主线**满星数（隐藏关不计入）—— 由调用方给 `starTotal`，缺省按节点数 × 3
  host.appendChild(buildProgress(totalStars, Number.isFinite(starTotal) ? starTotal : levelCount * 3));
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
