// vine-map.js — 藤蔓关卡地图（**世界坐标 + 视口内纵向平移** + 确定性路径）。见 AGENTS.md 2.3 / 5.1 与 D047（19.5）。
//
// 边界（2.3）：只做两件事 —— 读「坐标 + 星级 + 当前关 + 解锁表」→ 把地图画成 DOM/SVG，并按调用方要求平移世界。
// **不读游戏状态、不写存档、不绑全局事件**（拖拽/导航/键盘的事件全部由 app.js 绑在宿主元素上，
// 再调用本模块导出的 `panMap` / `setMapOffset` / `centerMapOn`）。坐标来自 `level.js` 的 `LEVEL_MAP_POS`
// （真相源是 `LEVELS.md` §9），星级、总星数、解锁表与云层状态都由调用方算好后传进来。
//
// 19.5 的核心口径（用户口径「把左右翻页换成藤蔓向上蔓延」，见 DECISIONS D047）：
//   · **没有「页」**：整张地图是一块**连续的世界**（世界总高 = `height × worldHeightRatio` 个 viewBox 单位）。
//   · 视口固定、`overflow: hidden`；平移的是世界自己的 `transform: translateY` ——
//     **页面本身仍然不可滚动/缩放**（5.1 不需要开例外），触摸手势也与 input.js 的 canvas 手势天然隔离。
//   · 坐标一律归一化：x 相对 `width`、y 相对**世界总高**。
//     **22.1（v1.33 / D049）原点翻转**：y **自世界底部起算**（0 = 世界最底、1 = 世界最顶），
//     `up` 时**第 1 关 y 最小（在世界最底）**、关号越大 y 越大；换算只走 `screenYOf()`：`(1 − y) × 世界高`。
//     ⚠️ 注意区分两个 y：**归一化世界 y**（数据层，自底向上）与 **SVG/屏幕 y**（自顶向下，viewBox 内即是）。
//     天空/地面/远山/云带这些**直接用 SVG 坐标**画的图层不受影响（它们本来就在 SVG 的自顶向下空间里）。
//   · 渲染按视口宽**统一缩放**（`scale = 视口宽 / width`），因此节点不会被非等比拉伸成椭圆。
//
// 确定性（设计期派生）：路径只由 `VINE_MAP_CONFIG.anchors` + `mulberry32(seed)` 决定 ——
// **代码里不写死任何控制点**，也**不使用运行时随机**；节点坐标是显式的、**不参与路径计算**（D040 的取舍）。

import { CONFIG } from './config.js';
import { LEVEL_COUNT, LEVEL_MAP_POS } from './level.js';

const MAP = CONFIG.VINE_MAP_CONFIG;
const SVG_NS = 'http://www.w3.org/2000/svg';
const SVG_TAGS = new Set(['svg', 'g', 'path', 'circle', 'ellipse', 'text', 'rect', 'line', 'polygon', 'defs', 'linearGradient', 'stop']);
const POS_BY_ID = new Map(LEVEL_MAP_POS.map((pos) => [pos.id, pos]));

/** 世界总高（viewBox 单位）。 */
export const MAP_WORLD_HEIGHT = MAP.height * MAP.worldHeightRatio;
/** ▲/▼ 一次移动的视口高比例（app.js 用它算平移量）。 */
export const MAP_NAV_STEP_RATIO = MAP.navStepRatio;
/** 视差/星光的**净**位移比例（导出给巡检与测试复算，不让调用方猜）。 */
export const MAP_PARALLAX = Object.freeze({ far: MAP.parallaxFar, near: MAP.parallaxNear });

// 远山带的带高（viewBox 单位）与云团的造型比例：**纯观感**，按 D013 留在模块内的本地常量。
// 云团的 `[fx, fy, fr]` 满足 `fx × width − fr × width ≥ ±cloudDrift`（漂移 ±7px）——
// 否则云团会被视口的 `overflow: hidden` 从两侧硬切一刀（19.5 的布局体检抓到的缺陷）。
const FAR_BAND_Y = 1024;
const CLOUD_PUFFS = [
  [0.15, 0.05, 0.1],
  [0.28, -0.14, 0.13],
  [0.42, 0.06, 0.1],
  [0.56, -0.1, 0.14],
  [0.7, 0.08, 0.1],
  [0.85, -0.06, 0.09]
];

/** 宿主元素 → 世界几何与平移状态（地图层自己不绑事件，因此状态跟着宿主走）。 */
const WORLDS = new WeakMap();

// ---------------------------------------------------------------------------
// 纯几何（全部可在 Node 里单测；不碰 DOM）
// ---------------------------------------------------------------------------

/** 关号 → 世界归一化 y（0 = 世界顶部、1 = 世界底部）；未知关号返回 null。 */
export function worldY(levelId) {
  const pos = POS_BY_ID.get(Math.trunc(Number(levelId)));
  return pos ? pos.y : null;
}

/** 关号 → 世界归一化 x。 */
export function worldX(levelId) {
  const pos = POS_BY_ID.get(Math.trunc(Number(levelId)));
  return pos ? pos.x : null;
}

/**
 * **22.1（v1.33 / D049）唯一的 y 换算口径**：世界归一化 y → 世界内的像素 y。
 *
 * `LEVEL_MAP_POS.y` 自**世界底部**起算（0 = 世界最底、1 = 世界最顶），而 SVG 与屏幕的 y 轴都是
 * **自上而下**的，因此： `screenY = (1 − y) × 世界高`。
 * 所有需要「世界 y」的地方（几何、可见性、焦点、锚点、节点圆心）**必须**走这一个函数 ——
 * 口径只在一处，`_build/check-vine-map.mjs` 与 `tests/vine-map.test.js` 都按它复算。
 */
export function screenYOf(y, worldHeight) {
  return (1 - y) * worldHeight;
}

/**
 * 由视口尺寸算出这一帧的世界几何：
 *   `scale` = 视口宽 / width（**统一缩放**，宽对齐）；`worldHeight` = 世界总高 × scale（CSS 像素）；
 *   `minOffset` = 最底的那一关居中时的平移量；`maxOffset` = 最顶的那一关居中时的平移量。
 * 平移量 T 的定义：世界左上角相对视口左上角的 y 偏移（负值 = 世界被向上推）。
 */
export function mapGeometry(viewportWidth, viewportHeight) {
  const width = Number(viewportWidth) > 0 ? Number(viewportWidth) : MAP.width;
  const height = Number(viewportHeight) > 0 ? Number(viewportHeight) : MAP.height;
  const scale = width / MAP.width;
  const worldHeight = MAP_WORLD_HEIGHT * scale;
  let top = Infinity;
  let bottom = -Infinity;
  for (const pos of LEVEL_MAP_POS) {
    const y = screenYOf(pos.y, worldHeight);
    if (y < top) top = y;
    if (y > bottom) bottom = y;
  }
  const mid = height / 2;
  return {
    viewportWidth: width,
    viewportHeight: height,
    scale,
    worldHeight,
    top,
    bottom,
    minOffset: mid - bottom, // 最底的关居中
    maxOffset: mid - top, // 最顶的关居中
    yOf: (levelId) => {
      const y = worldY(levelId);
      return y === null ? null : screenYOf(y, worldHeight);
    }
  };
}

/** 平移量夹到「首关 / 末关都能居中」的范围（因此两端都能真的居中，不会差半屏）。 */
export function clampMapOffset(offset, geometry) {
  const value = Number(offset);
  const safe = Number.isFinite(value) ? value : 0;
  return Math.min(Math.max(safe, geometry.minOffset), geometry.maxOffset);
}

/** 把某一关放到视口正中所需的平移量（已夹到边界）。 */
export function centeredOffsetFor(levelId, geometry) {
  const y = geometry.yOf(levelId);
  if (y === null) return clampMapOffset(geometry.maxOffset, geometry);
  return clampMapOffset(geometry.viewportHeight / 2 - y, geometry);
}

/** 当前平移量下「落在视口内（含节点半径余量）」的关号，按关号升序。 */
export function visibleLevelIds(offset, geometry) {
  const margin = (MAP.nodeRadius + 4) * geometry.scale;
  const ids = [];
  for (const pos of LEVEL_MAP_POS) {
    const screenY = screenYOf(pos.y, geometry.worldHeight) + offset;
    if (screenY >= -margin && screenY <= geometry.viewportHeight + margin) ids.push(pos.id);
  }
  return ids;
}

/** 视口正中最近的关号（导航文本显示的就是它 —— 「你正在看哪一关」）。 */
export function focusedLevelId(offset, geometry) {
  const mid = geometry.viewportHeight / 2;
  let best = null;
  let bestDistance = Infinity;
  for (const pos of LEVEL_MAP_POS) {
    const distance = Math.abs(screenYOf(pos.y, geometry.worldHeight) + offset - mid);
    if (distance < bestDistance) {
      bestDistance = distance;
      best = pos.id;
    }
  }
  return best;
}

/**
 * 视差图层的**净**屏幕位移 = `factor × offset`（factor < 1 比世界慢、> 1 更快/反向）。
 * 图层是世界的子元素（已经跟着世界走了 `offset`），因此它自己还要补偿 `(factor − 1) × offset`；
 * 这个补偿量在 SVG 内部是 viewBox 单位，需要除以 `scale` 才是屏幕像素。
 */
export function parallaxNetShift(factor, offset) {
  return factor * offset;
}

/** 视差图层自身要施加的补偿位移（viewBox 单位 / 也是在 `scale = 1` 时的像素）。 */
export function parallaxCompensation(factor, offset, scale) {
  const safeScale = Number(scale) > 0 ? Number(scale) : 1;
  return ((factor - 1) * offset) / safeScale;
}

/** 星级规范化：只接受 0–3 的整数（脏数据 → 0），与 3.7 的三星口径一致。 */
export function clampStars(value) {
  const stars = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.min(Math.max(stars, 0), 3);
}

/**
 * 节点状态机：`visited`（已通关）/ `attainable`（可玩未通关）/ `locked`（星数不够，19.3 新增）。
 * `unlocked` 由调用方（`app.js`）用 `level.isLevelUnlocked()` 算好后传入 —— **地图层不认识规则**，
 * 它只回答「这一关现在能不能玩」。注意：`visited` 与 `unlocked` 同时成立时取 `visited`（19.3 的反锁保护）。
 */
export function nodeState(earned, unlocked = true) {
  if (clampStars(earned) > 0) return 'visited';
  return unlocked ? 'attainable' : 'locked';
}

/** mulberry32：小而确定的 PRNG —— 只用于「同种子同路径/同星光」，不用于玩法。 */
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
 * 路径锚点（世界 viewBox 像素）：**只来自 `VINE_MAP_CONFIG.anchors`**，与 `LEVEL_MAP_POS` / 节点无关。
 * 归一化 y 允许略超 1（世界下方）与小于 0（世界上方）—— 两端的漫出量正好被平移极限吃掉。
 */
export function buildVineAnchors() {
  return MAP.anchors.map((anchor) => ({ x: round3(anchor.x * MAP.width), y: round3(screenYOf(anchor.y, MAP_WORLD_HEIGHT)) }));
}

/**
 * 路径的贝塞尔分段：控制点 = **弦中点分解 + 固定种子抖动**（两类来源，代码里不写死控制点坐标）。
 * 返回 `[{ from, c1, c2, to }]`，与 `buildVinePath` 的 `d` 一一对应（供测试断言「曲线不是直线拼接」）。
 */
export function buildVineSegments() {
  const anchors = buildVineAnchors();
  const rng = mulberry32(MAP.seed);
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

/** 贯穿整个世界的藤蔓 `d`：**一条**平滑的三次贝塞尔曲线（M → 若干 C）。 */
export function buildVinePath() {
  const segments = buildVineSegments();
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

/** 导航文本（虚拟世界里的「第 N 关 / 共 M 关」；隐藏关不显示分母，避免剧透天边）。 */
export function navLabelText(levelId, mainCount = LEVEL_COUNT) {
  const id = Math.trunc(Number(levelId));
  if (!Number.isFinite(id) || id <= 0) return `共 ${mainCount} 关`;
  return id > mainCount ? `第 ${id} 关` : `第 ${id} 关 / 共 ${mainCount} 关`;
}

// ---------------------------------------------------------------------------
// 渲染
// ---------------------------------------------------------------------------

/** 单个节点（`<g data-level data-stars data-state role=listitem tabindex=0 aria-label>`，无内联样式）。 */
function buildNode(position, stars, current, unlocked, required) {
  const earned = clampStars(stars?.[position.id] ?? stars?.[String(position.id)] ?? 0);
  const locked = !(unlocked?.[position.id] ?? unlocked?.[String(position.id)] ?? true);
  const state = nodeState(earned, !locked);
  const need = Math.max(0, Math.trunc(Number(required?.[position.id] ?? required?.[String(position.id)] ?? 0)));
  const cx = round1(position.x * MAP.width);
  const cy = round1(screenYOf(position.y, MAP_WORLD_HEIGHT));
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
    'data-world-y': String(position.y),
    role: 'listitem',
    tabindex: locked ? '-1' : '0',
    'aria-disabled': locked ? 'true' : null,
    'aria-label': locked ? `第 ${position.id} 关，未解锁，需要 ${need} 星` : `第 ${position.id} 关，${earned} 星`
  });
  node.appendChild(el('circle', { class: 'vine-node-halo', cx, cy, r: MAP.nodeRadius + 6 }));
  node.appendChild(el('circle', { class: 'vine-node-ring', cx, cy, r: MAP.nodeRadius + 3 }));
  node.appendChild(el('circle', { class: 'vine-node-body', cx, cy, r: MAP.nodeRadius }));
  // 19.4 画风：左上内嵌高光（一颗半透明白点，做「鼓起来」的立体感；不参与任何状态判定）
  node.appendChild(el('circle', { class: 'vine-node-gloss', cx: round1(cx - MAP.nodeRadius * 0.32), cy: round1(cy - MAP.nodeRadius * 0.34), r: round1(MAP.nodeRadius * 0.3) }));
  node.appendChild(el('text', { class: 'vine-node-label', x: cx, y: round1(cy + 5), 'text-anchor': 'middle' }, String(position.id)));
  // 19.3：锁定的节点显示「需要 N 星」+ 19.4 的小锁形图标（纯 SVG path，无素材）
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
  // 19.4：当前关卡上方加一枚**指向它的指针**（参考专利里「指向玩家最高关卡的指针」）；纯 SVG path + CSS 浮动
  if (position.id === current) {
    const tip = round1(cy - MAP.nodeRadius - MAP.arrowOffsetY);
    const half = MAP.arrowSize / 2;
    node.appendChild(el('path', {
      class: 'vine-node-arrow',
      d: `M ${cx} ${round1(tip + MAP.arrowSize)} L ${round1(cx - half)} ${tip} L ${round1(cx + half)} ${tip} Z`
    }));
  }
  // 星星：节点右侧（不压在藤蔓上），尺寸 = starSize × starScale，间距 starGap
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
    leaf.appendChild(el('ellipse', { class: 'vine-leaf-blade', cx: round1(MAP.leafSize * 0.9), cy: 0, rx: MAP.leafSize, ry: round1(MAP.leafSize * 0.45) }));
    svg.appendChild(leaf);
    count += 1;
  }
  return count;
}

/** 19.5：天空底色（世界**底部深绿 → 顶部深空蓝**，见 D047）。 */
function buildSky() {
  const defs = el('defs', {});
  const gradient = el('linearGradient', { id: 'vine-sky', gradientUnits: 'userSpaceOnUse', x1: 0, y1: round1(MAP_WORLD_HEIGHT), x2: 0, y2: 0 });
  for (const [offset, color] of [['0%', '#2b4a3a'], ['38%', '#1e3833'], ['72%', '#17293a'], ['100%', '#0e1a33']]) {
    gradient.appendChild(el('stop', { offset, 'stop-color': color }));
  }
  defs.appendChild(gradient);
  return [
    defs,
    el('rect', {
      class: 'vine-sky',
      x: 0,
      y: round1(-MAP.backdropBleed),
      width: MAP.width,
      height: round1(MAP_WORLD_HEIGHT + MAP.backdropBleed * 2),
      fill: 'url(#vine-sky)'
    }),
    el('rect', {
      class: 'vine-ground',
      x: 0,
      y: round1(MAP_WORLD_HEIGHT - MAP_WORLD_HEIGHT * 0.055),
      width: MAP.width,
      height: round1(MAP_WORLD_HEIGHT * 0.055 + MAP.backdropBleed)
    })
  ];
}

/**
 * 19.5 视差**远景层**：一列远山剪影（每 `FAR_BAND_Y` 一个带，带内带外重叠出层次）+ 少量雾团。
 * 只是观感层：不参与命中、不改变任何节点/路径坐标（也不引入 `<image>`/`<use>`/`<foreignObject>`）。
 */
function buildFarLayer(spanTop, spanBottom) {
  const group = el('g', { class: 'vine-parallax vine-parallax--far', 'data-parallax': 'far', 'aria-hidden': 'true' });
  const rng = mulberry32(MAP.seed + 104729);
  for (let top = spanTop; top < spanBottom; top += FAR_BAND_Y) {
    const ridge = round1(top + FAR_BAND_Y * (0.4 + rng() * 0.2));
    const bottom = round1(top + FAR_BAND_Y * 1.35);
    group.appendChild(el('path', {
      class: 'vine-ridge',
      d: [
        `M 0 ${ridge}`,
        `C ${round1(MAP.width * 0.26)} ${round1(ridge - FAR_BAND_Y * (0.12 + rng() * 0.1))}`,
        `${round1(MAP.width * 0.62)} ${round1(ridge + FAR_BAND_Y * (0.04 + rng() * 0.08))}`,
        `${MAP.width} ${round1(ridge - FAR_BAND_Y * (0.05 + rng() * 0.1))}`,
        `V ${bottom}`,
        'H 0 Z'
      ].join(' ')
    }));
    if (rng() > 0.35) {
      group.appendChild(el('ellipse', {
        class: 'vine-haze',
        cx: round1(MAP.width * (0.15 + rng() * 0.7)),
        cy: round1(top + FAR_BAND_Y * (0.2 + rng() * 0.2)),
        rx: round1(MAP.width * (0.18 + rng() * 0.16)),
        ry: round1(FAR_BAND_Y * (0.04 + rng() * 0.03))
      }));
    }
  }
  return group;
}

/** 19.5 视差**近景层**：确定性星光点（`particleCount` 个；同种子同位置，闪烁相位由 class 决定）。 */
function buildNearLayer(spanTop, spanBottom) {
  const group = el('g', { class: 'vine-parallax vine-parallax--near', 'data-parallax': 'near', 'aria-hidden': 'true' });
  const rng = mulberry32(MAP.seed + 7907);
  for (let i = 0; i < MAP.particleCount; i += 1) {
    const cx = round1(rng() * MAP.width);
    const cy = round1(spanTop + rng() * (spanBottom - spanTop));
    const r = round1(0.9 + rng() * 1.6);
    const phase = Math.floor(rng() * 4);
    group.appendChild(el('circle', { class: `vine-star vine-star--p${phase}`, cx, cy, r }));
  }
  return group;
}

/** 天边云层（19.3 的「第 6 页」→ 19.5 的「世界顶部云层带」）：隐藏关未揭示时铺满世界顶端一带。 */
function buildCloudBand(tianbian) {
  const required = Math.max(0, Math.trunc(Number(tianbian?.required) || 0));
  const stars = Math.max(0, Math.trunc(Number(tianbian?.stars) || 0));
  const missing = Math.max(0, required - stars);
  const bandH = MAP.tianbianBand * MAP_WORLD_HEIGHT;
  const group = el('g', {
    class: 'vine-cloud',
    'data-cloud': 'closed',
    'data-required': String(required),
    'data-missing': String(missing),
    'data-band': String(round1(bandH))
  });
  for (const [fx, fy, fr] of CLOUD_PUFFS) {
    group.appendChild(
      el('circle', {
        class: 'vine-cloud-puff',
        cx: round1(fx * MAP.width),
        cy: round1(bandH * 0.55 + fy * bandH),
        r: round1(fr * MAP.width)
      })
    );
  }
  group.appendChild(el('text', { class: 'vine-cloud-text', x: round1(MAP.width / 2), y: round1(bandH * 0.55 + 9), 'text-anchor': 'middle' }, `还差 ${missing} ⭐`));
  group.appendChild(el('text', { class: 'vine-cloud-hint', x: round1(MAP.width / 2), y: round1(bandH * 0.55 + 40), 'text-anchor': 'middle' }, `累计 ${required} 星解锁天边关卡`));
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

/** 导航条：`[▲] 第 N 关 / 共 M 关 [▼]`（19.5 取代左右翻页；按钮，不是滚动容器）。 */
function buildNav() {
  const nav = el('div', { class: 'vine-nav', role: 'group', 'aria-label': '地图导航' });
  nav.appendChild(el('button', { type: 'button', class: 'vine-nav-button', 'data-nav': 'up', 'aria-label': '向上看' }, '▲'));
  nav.appendChild(el('span', { class: 'vine-nav-label', 'data-nav-label': 'true' }, ''));
  nav.appendChild(el('button', { type: 'button', class: 'vine-nav-button', 'data-nav': 'down', 'aria-label': '向下看' }, '▼'));
  return nav;
}

/** 「回到当前关」悬浮按钮（固定在地图右上角，不随世界平移）。 */
function buildRecenter(levelId) {
  const button = el('button', {
    type: 'button',
    class: 'vine-recenter',
    'data-nav': 'current',
    'aria-label': Number.isFinite(Number(levelId)) ? `回到当前关（第 ${levelId} 关）` : '回到当前关'
  }, '回到当前关');
  return button;
}

/**
 * 把地图画进宿主元素（`index.html` 的 `#map`）。**幂等**：每次调用都重建内容。
 *
 * `centerOn`（缺省 = `current`，再缺省 = 第 1 关）是**进入地图时居中的那一关**；平移状态记在模块的 WeakMap 上，
 * 由调用方通过 `panMap` / `setMapOffset` / `centerMapOn` 驱动 —— 本函数**不绑任何事件**。
 * 返回 `{ offset, geometry, visible, focused, total }`（巡检与日志可用）。
 */
export function renderMap(host, {
  stars = {},
  current = null,
  totalStars = 0,
  unlocked = null, // 19.3：{ 关卡id: 是否可玩 }（由 app.js 用 level.isLevelUnlocked 算好；地图层不认识规则）
  required = null, // 19.3：{ 关卡id: 需要多少星 }（节点上显示，供提示与巡检）
  revealed = null, // 19.3：{ 关卡id: false } = 天边云层未散去、不渲染该节点
  tianbian = null, // 19.3：{ open, stars, required } —— 云层状态（云带代替未揭示的节点）
  starTotal = null, // 19.3：⭐ n/X 的分母（**主线**满星数，隐藏关不计入）；缺省按节点数 × 3
  levelCount = LEVEL_MAP_POS.length,
  centerOn = undefined // 19.5：进入地图时居中的关号
} = {}) {
  const fallback = { offset: 0, geometry: null, visible: [], focused: null, total: LEVEL_MAP_POS.length };
  if (!host) return fallback;
  host.textContent = '';
  // 时长/周期数值归 config，样式仍归 CSS：用自定义属性桥接（见 D040 / D047）
  host.style.setProperty('--vine-pulse-ms', `${MAP.pulseMs}ms`);
  host.style.setProperty('--vine-leaf-ms', `${MAP.leafSwayMs}ms`);
  host.style.setProperty('--vine-scroll-ms', `${MAP.scrollMs}ms`);
  host.style.setProperty('--vine-cloud-ms', `${MAP.cloudDriftMs}ms`);
  host.style.setProperty('--vine-world-w', `${MAP.width}px`);
  host.style.setProperty('--vine-world-h', `${MAP_WORLD_HEIGHT}px`);

  // ---------- ① 先立视口与固定 UI（视口高度受它们影响，因此必须先入 DOM 再量） ----------
  const viewport = el('div', { class: 'vine-viewport', 'data-vine-viewport': 'true', role: 'region', 'aria-label': '藤蔓关卡地图' });
  host.appendChild(viewport);
  host.appendChild(buildProgress(totalStars, Number.isFinite(starTotal) ? starTotal : levelCount * 3));
  const nav = buildNav();
  host.appendChild(nav);
  const anchorId = Number.isFinite(Number(centerOn)) ? Number(centerOn) : Number(current);
  // 「回到当前关」挂在**视口内**（不是宿主上）：这样它贴着地图列的对齐边，不会越过世界左右边界（19.5 布局体检）
  viewport.appendChild(buildRecenter(anchorId));

  // ---------- ② 量出视口尺寸 → 世界几何 ----------
  const geometry = mapGeometry(viewport.clientWidth, viewport.clientHeight);
  const options = { unlocked, required, revealed, tianbian };

  // ---------- ③ 世界：单张 SVG（viewBox = 世界总高，1 单位 = 1px），视差用两个 `<g>` 图层 ----------
  const world = el('div', { class: 'vine-world', 'data-vine-world': 'true' });
  const svg = el('svg', {
    class: 'vine-world-svg',
    viewBox: `0 0 ${MAP.width} ${MAP_WORLD_HEIGHT}`,
    preserveAspectRatio: 'none',
    role: 'list',
    'aria-label': `藤蔓关卡地图，共 ${LEVEL_MAP_POS.length} 个节点`
  });
  for (const node of buildSky()) svg.appendChild(node);
  const panRange = geometry.maxOffset - geometry.minOffset;
  const farShift = Math.abs(parallaxCompensation(MAP.parallaxFar, panRange, geometry.scale));
  const nearShift = Math.abs(parallaxCompensation(MAP.parallaxNear, panRange, geometry.scale));
  const far = buildFarLayer(-farShift - FAR_BAND_Y, MAP_WORLD_HEIGHT + farShift + FAR_BAND_Y);
  far.setAttribute('data-parallax-factor', String(MAP.parallaxFar));
  svg.appendChild(far);
  // 藤蔓画**两层**（深色垫层 + 亮色芯）—— 同一份 `d`、更粗更「藤」的观感；仍然是确定性路径
  const d = buildVinePath();
  svg.appendChild(el('path', { class: 'vine-path-under', d }));
  const path = el('path', { class: 'vine-path', id: 'vine-path', d });
  svg.appendChild(path);
  const vines = el('g', { class: 'vine-nodes' });
  let hidden = 0;
  for (const position of LEVEL_MAP_POS) {
    // 天边云层未散去时，隐藏关**不渲染**（19.3：云带代替节点，而不是把节点画暗）
    if (options.revealed?.[position.id] === false || options.revealed?.[String(position.id)] === false) {
      hidden += 1;
      continue;
    }
    vines.appendChild(buildNode(position, stars, current, options.unlocked, options.required));
  }
  svg.appendChild(vines);
  if (hidden > 0 && options.tianbian) svg.appendChild(buildCloudBand(options.tianbian));
  const near = buildNearLayer(-nearShift, MAP_WORLD_HEIGHT + nearShift);
  near.setAttribute('data-parallax-factor', String(MAP.parallaxNear));
  svg.appendChild(near);
  world.appendChild(svg);
  viewport.appendChild(world);
  world.dataset.leaves = String(decorateLeaves(path, svg));
  world.dataset.hiddenNodes = String(hidden);
  viewport.dataset.worldHeight = String(round1(geometry.worldHeight));
  viewport.dataset.scale = String(round3(geometry.scale));
  viewport.dataset.visibleNodes = String(visibleLevelIds(0, geometry).length);

  WORLDS.set(host, { geometry, world, far, near, nav, viewport, current, offset: 0, animating: 0 });
  applyOffset(host, centeredOffsetFor(anchorId, geometry), { animate: false });
  // 路径生长观感：下一帧加 `.grown`（`stroke-dashoffset` 9000 → 0）；不依赖 JS 逐帧
  if (typeof requestAnimationFrame === 'function') {
    requestAnimationFrame(() => {
      if (WORLDS.get(host)?.world !== world) return; // 期间又重画过：不要给旧节点加类
      for (const p of host.querySelectorAll('.vine-path')) p.classList.add('grown');
    });
  }
  return mapSnapshot(host);
}

/** 把平移量写进世界与两个视差图层（唯一的写点）。 */
function applyOffset(host, offset, { animate = false } = {}) {
  const state = WORLDS.get(host);
  if (!state) return null;
  const next = clampMapOffset(offset, state.geometry);
  state.offset = next;
  state.world.classList.toggle('vine-world--instant', !animate);
  state.world.style.transform = `translateY(${round1(next)}px) scale(${round3(state.geometry.scale)})`;
  state.world.dataset.offset = String(round1(next));
  // 视差：图层已经跟着世界走了 `offset`，这里补上 (factor − 1) × offset（净位移 = factor × offset）
  for (const [layer, factor] of [[state.far, MAP.parallaxFar], [state.near, MAP.parallaxNear]]) {
    const compensation = parallaxCompensation(factor, next, state.geometry.scale);
    layer.setAttribute('transform', `translate(0 ${round1(compensation)})`);
    layer.dataset.parallaxShift = String(round1(compensation));
    layer.dataset.parallaxNet = String(round1(parallaxNetShift(factor, next)));
  }
  if (state.viewport) state.viewport.dataset.visibleNodes = String(visibleLevelIds(next, state.geometry).length);
  updateNav(host);
  return next;
}

/** 导航条与「回到当前关」的可用性 / 文本（每次平移后刷新）。 */
function updateNav(host) {
  const state = WORLDS.get(host);
  if (!state?.nav) return;
  const focused = focusedLevelId(state.offset, state.geometry);
  const label = state.nav.querySelector('[data-nav-label]');
  if (label) label.textContent = navLabelText(focused, LEVEL_COUNT);
  state.nav.dataset.focusedLevel = String(focused ?? '');
  const atTop = state.offset >= state.geometry.maxOffset - 0.5;
  const atBottom = state.offset <= state.geometry.minOffset + 0.5;
  const up = state.nav.querySelector('[data-nav="up"]');
  const down = state.nav.querySelector('[data-nav="down"]');
  if (up) up.disabled = atTop;
  if (down) down.disabled = atBottom;
  state.atTop = atTop;
  state.atBottom = atBottom;
}

/** 只读快照（给 app.js / 巡检用；不暴露内部 DOM 状态对象）。 */
export function mapSnapshot(host) {
  const state = WORLDS.get(host);
  if (!state) return null;
  return {
    offset: state.offset,
    minOffset: state.geometry.minOffset,
    maxOffset: state.geometry.maxOffset,
    viewportHeight: state.geometry.viewportHeight,
    viewportWidth: state.geometry.viewportWidth,
    scale: state.geometry.scale,
    worldHeight: state.geometry.worldHeight,
    focused: focusedLevelId(state.offset, state.geometry),
    visible: visibleLevelIds(state.offset, state.geometry),
    atTop: state.offset >= state.geometry.maxOffset - 0.5,
    atBottom: state.offset <= state.geometry.minOffset + 0.5,
    current: state.current
  };
}

/** 平移世界（拖拽/惯性用；`animate` 时走 CSS 过渡，见 `.vine-world`）。 */
export function panMap(host, delta, { animate = false } = {}) {
  const state = WORLDS.get(host);
  if (!state) return null;
  return applyOffset(host, state.offset + Number(delta || 0), { animate });
}

/** 直接把世界平移到某个偏移（已夹到边界）。 */
export function setMapOffset(host, offset, { animate = false } = {}) {
  const state = WORLDS.get(host);
  if (!state) return null;
  return applyOffset(host, offset, { animate });
}

/** 把某一关放到视口正中（进入地图与「回到当前关」用）。 */
export function centerMapOn(host, levelId, { animate = false } = {}) {
  const state = WORLDS.get(host);
  if (!state) return null;
  return applyOffset(host, centeredOffsetFor(levelId, state.geometry), { animate });
}

/** 视口尺寸变化后重算几何（保持「当前关居中」的语义，避免旋转屏幕后世界跑偏）。 */
export function relayoutMap(host, { centerOn = undefined } = {}) {
  const state = WORLDS.get(host);
  if (!state?.viewport) return null;
  const geometry = mapGeometry(state.viewport.clientWidth, state.viewport.clientHeight);
  state.geometry = geometry;
  state.viewport.dataset.worldHeight = String(round1(geometry.worldHeight));
  state.viewport.dataset.scale = String(round3(geometry.scale));
  const anchorId = Number.isFinite(Number(centerOn)) ? Number(centerOn) : Number(state.current);
  applyOffset(host, centeredOffsetFor(anchorId, geometry), { animate: false });
  return mapSnapshot(host);
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
