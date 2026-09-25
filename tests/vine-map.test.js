// tests/vine-map.test.js — vine-map.js（藤蔓地图）的单元测试。见 AGENTS.md 7.1 与 DECISIONS D040 / **D047（19.5 世界纵向平移）**。
//
// 只测**纯函数**（世界坐标、视口几何、平移夹取与居中、视口内关号、视差补偿、确定性路径、导航文本、
// 节点状态机、星级规范化）—— DOM 渲染与真实拖拽由浏览器套件取证（L2/L3），
// 坐标表 ↔ LEVELS.md 的一致性由 `_build/check-vine-map.mjs` 巡检。
//
// 19.5 的关键改写：**删掉全部分页断言**（`pageCount`/`pageOf`/`positionsOnPage`/`MAP_PAGE_SIZE` 已随
// 「左右翻页」一起退役），改为「世界 + 视口平移」的不变量：
//   · 世界是一整块（`MAP_WORLD_HEIGHT`），第 1 关在世界最底、y 随关号严格单调；
//   · 平移量把某一关放到视口正中 = `视口高/2 − 该关的世界 y`，并夹到「首/末关刚好居中」的边界；
//   · 视差图层的**净**位移 = `factor × 平移量`（图层自身补偿 `(factor − 1) × 平移量 / scale`）。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import { HIDDEN_LEVEL_IDS, LEVEL_COUNT, LEVEL_MAP_POS } from '../level.js';
import {
  MAP_NAV_STEP_RATIO,
  MAP_PARALLAX,
  MAP_WORLD_HEIGHT,
  buildVineAnchors,
  buildVinePath,
  buildVineSegments,
  centerMapOn,
  clampMapOffset,
  clampStars,
  centeredOffsetFor,
  focusedLevelId,
  mapGeometry,
  mapSnapshot,
  mulberry32,
  navLabelText,
  nodeState,
  panMap,
  parallaxCompensation,
  parallaxNetShift,
  renderMap,
  screenYOf,
  setMapOffset,
  starPath,
  visibleLevelIds,
  worldX,
  worldY
} from '../vine-map.js';

const MAP = CONFIG.VINE_MAP_CONFIG;
const round1 = (value) => Math.round(value * 10) / 10;
const round3 = (value) => Math.round(value * 1000) / 1000;
const VIEW = { w: 360, h: 760 }; // 一个常见的手机地图视口（逻辑像素）

test('世界坐标：53 个节点、y 随关号严格单调（第 1 关在世界最底）、x 落在 nodeColumns 且 ≥3 列', () => {
  const total = LEVEL_COUNT + HIDDEN_LEVEL_IDS.length;
  assertEqual(LEVEL_MAP_POS.length, total, '坐标条数 = 主线 + 隐藏关');
  assertTrue(LEVEL_MAP_POS.every((pos) => pos.x >= 0 && pos.x <= 1 && pos.y >= 0 && pos.y <= 1), '坐标都是 0–1 的归一化值');
  assertTrue(LEVEL_MAP_POS.every((pos) => MAP.nodeColumns.includes(pos.x)), `x 都落在 nodeColumns（${MAP.nodeColumns.join(' / ')}）之一`);
  assertTrue(new Set(LEVEL_MAP_POS.map((pos) => pos.x)).size >= 3, 'X 轴至少 3 个不同水平位置（打破两列对齐）');
  // 19.5：不再有「页」，取而代之的是「世界」—— y 相对世界总高，且关号越大越靠上
  // 22.1（D049）：y **自世界底部起算**（0 = 最底、1 = 最顶）⇒ 'up' 时 y 随关号**递增**
  const climbUp = MAP.climbDirection !== 'down';
  const ordered = [...LEVEL_MAP_POS].sort((a, b) => a.id - b.id);
  for (let i = 1; i < ordered.length; i += 1) {
    const ok = climbUp ? ordered[i - 1].y < ordered[i].y : ordered[i - 1].y > ordered[i].y;
    assertTrue(ok, `第 ${ordered[i].id} 关与第 ${ordered[i - 1].id} 关的上下关系正确（climbDirection = ${MAP.climbDirection}）`);
  }
  if (climbUp) {
    assertEqual(worldY(1), Math.min(...LEVEL_MAP_POS.map((pos) => pos.y)), '第 1 关在世界最底（y 最小）');
    assertEqual(worldY(HIDDEN_LEVEL_IDS[HIDDEN_LEVEL_IDS.length - 1]), Math.max(...LEVEL_MAP_POS.map((pos) => pos.y)), '最后一个隐藏关在世界最顶（y 最大）');
  }
  assertEqual(worldX(3), MAP.nodeColumns[2], '第 3 个节点的 x 取第 3 列（轮换打破对齐）');
  assertEqual(worldY(999), null, '未知关号 → null（不猜）');
  assertEqual(worldX(0), null, '非法关号 → null');
  // 世界总高 = height × worldHeightRatio（配置一改，几何与巡检一起改）
  assertEqual(MAP_WORLD_HEIGHT, MAP.height * MAP.worldHeightRatio, '世界总高 = height × worldHeightRatio');
  assertTrue(MAP_WORLD_HEIGHT > MAP.height * 5, `世界比「一个屏」高得多（${MAP_WORLD_HEIGHT}），才谈得上「向上蔓延」`);
  // 行距 > 2 × 错落：相邻两行不会塌成同一高度（巡检的同一口径）
  const rows = Math.ceil(total / MAP.nodesPerRow);
  const spanY = (1 - MAP.nodeMarginY * 2) / (rows - 1);
  assertTrue(spanY > 2 * MAP.nodeStaggerY, `行距 ${round3(spanY)} > 2 × 错落 ${2 * MAP.nodeStaggerY}`);
});

test('mapGeometry：scale = 视口宽 / width（统一缩放）、worldHeight = 世界总高 × scale', () => {
  const g = mapGeometry(VIEW.w, VIEW.h);
  assertEqual(g.scale, 1, '360 宽的视口 → scale = 1（1 个 viewBox 单位 = 1px，节点不会被压成椭圆）');
  assertEqual(g.worldHeight, MAP_WORLD_HEIGHT, '世界高度（CSS 像素）= 世界总高 × scale');
  const narrow = mapGeometry(320, 700);
  assertEqual(round3(narrow.scale), round3(320 / MAP.width), '窄屏按宽等比缩小');
  assertEqual(round1(narrow.worldHeight), round1(MAP_WORLD_HEIGHT * narrow.scale), '窄屏世界高度同步缩小');
  // 22.1（D049）：top/bottom 是**屏幕/SVG 的 y**（自顶向下）= (1 − 归一化 y) × 世界高
  assertEqual(round1(g.top), round1(screenYOf(Math.max(...LEVEL_MAP_POS.map((pos) => pos.y)), MAP_WORLD_HEIGHT)), 'top = 最顶的关（归一化 y 最大）');
  assertEqual(round1(g.bottom), round1(screenYOf(Math.min(...LEVEL_MAP_POS.map((pos) => pos.y)), MAP_WORLD_HEIGHT)), 'bottom = 最底的关（归一化 y 最小）');
  assertTrue(g.minOffset < g.maxOffset, '平移区间非空（能爬）');
  assertEqual(mapGeometry(0, 0).scale, 1, '量不到尺寸时回落到 width/height 兜底值');
});

test('平移：centeredOffsetFor 把节点放到视口正中，且首/末关刚好等于边界（两端都能真居中）', () => {
  const g = mapGeometry(VIEW.w, VIEW.h);
  const bottomId = 1;
  const topId = LEVEL_MAP_POS[LEVEL_MAP_POS.length - 1].id;
  assertEqual(centeredOffsetFor(bottomId, g), g.minOffset, '最底的那一关居中 = 平移下限');
  assertEqual(centeredOffsetFor(topId, g), g.maxOffset, '最顶的那一关居中 = 平移上限');
  for (const id of [1, 7, 26, 50, 53]) {
    const offset = centeredOffsetFor(id, g);
    const screenY = screenYOf(worldY(id), g.worldHeight) + offset;
    assertTrue(Math.abs(screenY - VIEW.h / 2) <= 0.001, `第 ${id} 关落在视口正中（y = ${round3(screenY)}）`);
  }
  assertEqual(clampMapOffset(-999999, g), g.minOffset, '往回滑到底 → 夹到下限');
  assertEqual(clampMapOffset(999999, g), g.maxOffset, '往上滑到顶 → 夹到上限');
  assertEqual(clampMapOffset(Number.NaN, g), g.maxOffset, '脏值（NaN）→ 落到上限（世界顶部）');
  const centered = centeredOffsetFor(13, g);
  assertEqual(clampMapOffset(centered, g), centered, '居中值本来就在区间内，夹取不改变它');
});

test('visibleLevelIds / focusedLevelId：视口内的关号按升序、正中那一关就是「你正在看」的关', () => {
  const g = mapGeometry(VIEW.w, VIEW.h);
  const offset = centeredOffsetFor(26, g);
  assertEqual(focusedLevelId(offset, g), 26, '把第 26 关居中后，焦点关就是 26');
  const visible = visibleLevelIds(offset, g);
  assertTrue(visible.length >= 3, `一屏能看到多个节点（实得 ${visible.length} 个：${visible.join(',')}）`);
  assertDeepEqual(visible, [...visible].sort((a, b) => a - b), '按关号升序');
  assertTrue(visible.includes(26), '居中的那一关一定在视口里');
  for (const id of visible) {
    const screenY = screenYOf(worldY(id), g.worldHeight) + offset;
    assertTrue(screenY >= -40 && screenY <= VIEW.h + 40, `第 ${id} 关在视口范围内（y = ${round3(screenY)}）`);
  }
  // 爬到世界两端时，视口里仍然有节点（不会滑到空白区）
  assertTrue(visibleLevelIds(g.minOffset, g).includes(1), '滑到底时第 1 关可见');
  assertTrue(visibleLevelIds(g.maxOffset, g).includes(LEVEL_MAP_POS[LEVEL_MAP_POS.length - 1].id), '滑到顶时最后一个隐藏关可见');
  assertTrue(focusedLevelId(g.maxOffset, g) !== focusedLevelId(g.minOffset, g), '两端看到的不是同一关');
});

test('视差：图层的净位移 = factor × 平移量；图层自身只补 (factor − 1) × 平移量 / scale', () => {
  assertEqual(MAP_PARALLAX.far, MAP.parallaxFar, '导出的远景比例与配置一致');
  assertEqual(MAP_PARALLAX.near, MAP.parallaxNear, '导出的近景比例与配置一致');
  assertTrue(MAP.parallaxFar < 1 && MAP.parallaxNear > 1, '远景比世界慢（<1）、近景比世界快（>1）');
  for (const offset of [-2500, -1200, 0]) {
    assertEqual(parallaxNetShift(MAP.parallaxFar, offset), MAP.parallaxFar * offset, `远景净位移 = ${MAP.parallaxFar} × 平移量`);
    assertEqual(parallaxNetShift(MAP.parallaxNear, offset), MAP.parallaxNear * offset, `近景净位移 = ${MAP.parallaxNear} × 平移量`);
  }
  assertEqual(parallaxCompensation(MAP.parallaxFar, -1000, 1), 750, '远景自身要往回补 +750（(0.25 − 1) × −1000），净位移才只剩 0.25 倍');
  assertEqual(round1(parallaxCompensation(MAP.parallaxNear, -1000, 1)), -450, '近景自身再快一步（(1.45 − 1) × −1000），净位移达到 1.45 倍');
  assertEqual(parallaxCompensation(MAP.parallaxFar, -1000, 0.5), 1500, '缩放过半时，同样的屏幕位移在 SVG 内部要放大一倍（750 / 0.5）');
  assertEqual(parallaxCompensation(MAP.parallaxFar, -1000, 0), 750, '脏 scale（0）按 1 处理，不产生 Infinity');
});

test('导航文本：主线显示「第 N 关 / 共 50 关」，隐藏关只显示关号（不剧透天边）', () => {
  assertEqual(navLabelText(1), `第 1 关 / 共 ${LEVEL_COUNT} 关`, '第 1 关');
  assertEqual(navLabelText(50), `第 50 关 / 共 ${LEVEL_COUNT} 关`, '第 50 关');
  assertEqual(navLabelText(52), '第 52 关', '隐藏关不显示分母');
  assertEqual(navLabelText(Number.NaN), `共 ${LEVEL_COUNT} 关`, '脏值 → 只显示总数');
  assertTrue(MAP_NAV_STEP_RATIO > 0 && MAP_NAV_STEP_RATIO < 2, `▲/▼ 一次移动 ${MAP_NAV_STEP_RATIO} 个视口高（不越界、也不只挪一点点）`);
});

test('mulberry32：同种子同序列、不同种子不同序列（确定性 PRNG，不用于玩法）', () => {
  const a1 = mulberry32(MAP.seed);
  const a2 = mulberry32(MAP.seed);
  const b = mulberry32(MAP.seed + 1);
  const seqA1 = [a1(), a1(), a1(), a1()];
  const seqA2 = [a2(), a2(), a2(), a2()];
  const seqB = [b(), b(), b(), b()];
  assertDeepEqual(seqA1, seqA2, '同种子得到同一序列');
  assertFalse(JSON.stringify(seqA1) === JSON.stringify(seqB), '不同种子得到不同序列');
  assertTrue(seqA1.every((v) => v >= 0 && v < 1), '取值落在 [0,1)');
});

test('buildVineAnchors：22.2 起 = 入口延伸点 + **53 个节点圆心** + 出口延伸点（节点仍是真相源）', () => {
  const anchors = buildVineAnchors();
  const expected = [
    { x: round3(MAP.anchors[0].x * MAP.width), y: round3(screenYOf(MAP.anchors[0].y, MAP_WORLD_HEIGHT)) },
    ...[...LEVEL_MAP_POS]
      .sort((a, b) => a.id - b.id)
      .map((pos) => ({ x: round3(pos.x * MAP.width), y: round3(screenYOf(pos.y, MAP_WORLD_HEIGHT)) })),
    { x: round3(MAP.anchors[1].x * MAP.width), y: round3(screenYOf(MAP.anchors[1].y, MAP_WORLD_HEIGHT)) }
  ];
  assertDeepEqual(anchors, expected, '曲线要穿过的点 = [入口] + 节点（按关号升序）+ [出口]');
  assertEqual(anchors.length, LEVEL_MAP_POS.length + 2, '点数 = 节点数 + 两个延伸点');
  assertEqual(MAP.anchors.length, 2, '延伸点只有入口/出口两个（不再是一串独立锚点）');
  assertTrue(anchors[0].y > MAP_WORLD_HEIGHT, '入口在**世界下方之外**（屏幕 y > 世界总高）');
  assertTrue(anchors[anchors.length - 1].y < 0, '出口在**世界上方之外**（屏幕 y < 0）');
  // 22.2 的取舍：为了「藤蔓穿过节点」，路径**必须**经过节点坐标 —— 旧口径（节点不参与路径）已退役
  const nodePoints = LEVEL_MAP_POS.map((pos) => `${round3(pos.x * MAP.width)} ${round3(screenYOf(pos.y, MAP_WORLD_HEIGHT))}`);
  const onCurve = anchors.filter((a) => nodePoints.includes(`${a.x} ${a.y}`)).length;
  assertEqual(onCurve, LEVEL_MAP_POS.length, '全部 53 个节点坐标都在曲线点上（这正是 22.2 要达到的效果）');
});

test('buildVinePath：**一条**贯穿世界的 d、设计期派生、曲线而不是直线拼接、且**穿过每个节点**', () => {
  const first = buildVinePath();
  assertEqual(first, buildVinePath(), '两次结果完全相同（确定性路径，不使用运行时随机）');
  assertTrue(first.startsWith('M '), '以 M 开头');
  const segments = buildVineSegments();
  assertEqual(first.split('C').length - 1, segments.length, '每两个点之间一段三次贝塞尔');
  assertEqual(segments.length, buildVineAnchors().length - 1, '分段数 = 点数 − 1');
  // 22.2 的硬指标（与 _build/check-vine-map.mjs 同口径）：曲线**精确穿过每个节点圆心**
  const nodes = [...LEVEL_MAP_POS].sort((a, b) => a.id - b.id);
  const at = (seg, t) => {
    const u = 1 - t;
    return {
      x: u * u * u * seg.from.x + 3 * u * u * t * seg.c1.x + 3 * u * t * t * seg.c2.x + t * t * t * seg.to.x,
      y: u * u * u * seg.from.y + 3 * u * u * t * seg.c1.y + 3 * u * t * t * seg.c2.y + t * t * t * seg.to.y
    };
  };
  const samples = [];
  for (const seg of segments) for (let s = 0; s <= 40; s += 1) samples.push(at(seg, s / 40));
  let worst = 0;
  for (const node of nodes) {
    const point = { x: round3(node.x * MAP.width), y: round3(screenYOf(node.y, MAP_WORLD_HEIGHT)) };
    let best = Infinity;
    for (const s of samples) {
      const dist = Math.hypot(s.x - point.x, s.y - point.y);
      if (dist < best) best = dist;
    }
    if (best > worst) worst = best;
  }
  assertTrue(worst <= 0.5, `每个节点到曲线的距离 ≤ 0.5px（实得 ${round3(worst)}px）`);
  const deviations = segments.map((seg) => {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = (point) => Math.abs((point.x - seg.from.x) * dy - (point.y - seg.from.y) * dx) / length;
    return Math.max(distance(seg.c1), distance(seg.c2));
  });
  assertTrue(Math.max(...deviations) > 0.5, '曲线确实弯曲（控制点偏离弦）');
});

// 第三轮视觉评审（用户 P0）：**「分段渐粗」退役** —— 分段 + round linecap 会在每个接缝留下圆形隆起
// （用户看到的「打了结的绳子」）。因此 `buildVineTaperSegments` 的用例按新口径改写为
// 「整条藤蔓是**一条**平滑曲线」：单一 `d`、以 M 开头、含三次贝塞尔、两次调用完全相同。
test('buildVinePath：整条藤蔓是**一条**平滑曲线（不再分段渐粗），且确定性', () => {
  const d = buildVinePath();
  assertEqual(d, buildVinePath(), '两次结果完全相同（纯函数、无随机）');
  assertTrue(d.startsWith('M '), '是一条完整路径（M 开头）');
  assertTrue((d.match(/ C /g) ?? []).length >= 50, `沿途至少有 50 段三次贝塞尔（实得 ${(d.match(/ C /g) ?? []).length}）`);
  // 53 个节点 + 入口/出口延伸点 ⇒ 至少 54 个锚点；曲线必须一阶连续（每段都有 C）
  assertTrue(d.split('M ').length === 2, '只有一个子路径（没有分段拼接）');
});

test('nodeState：19.3 起是三态 —— visited / attainable / locked（locked 只由「未解锁」决定）', () => {
  assertEqual(nodeState(0, true), 'attainable', '0 星 + 已解锁 → attainable');
  assertEqual(nodeState(0, false), 'locked', '0 星 + 未解锁 → locked');
  assertEqual(nodeState(1, true), 'visited', '1 星 → visited');
  assertEqual(nodeState(3, false), 'visited', '3 星即使门槛没到也是 visited（**反锁保护**：已通关的关卡永远可玩）');
  assertEqual(nodeState(-1, false), 'locked', '脏值 −1 按 0 星处理 → locked');
  assertEqual(nodeState(undefined, false), 'locked', '缺省 → locked');
  const states = new Set([-1, 0, 0.5, 1, 2, 3, 9, 'x', null, undefined].flatMap((value) => [nodeState(value, true), nodeState(value, false)]));
  assertDeepEqual([...states].sort(), ['attainable', 'locked', 'visited'], '任何输入都只会得到这三态');
});

test('starPath：五角星是 10 个顶点的闭合路径；尺寸 = starSize × starScale（比第一版大 40%）', () => {
  const d = starPath(0, 0, MAP.starSize * MAP.starScale);
  assertTrue(d.startsWith('M '), '以 M 开头');
  assertTrue(d.trim().endsWith('Z'), '闭合路径');
  assertEqual(d.split('L').length - 1, 9, '10 个顶点（1 个 M + 9 个 L）');
  assertEqual(MAP.starScale, 1.4, '放大倍率是 1.4（比第一版的 11px 大字 40%）');
  assertEqual(round1(MAP.starSize * MAP.starScale), 15.4, '星星尺寸 = 11 × 1.4 = 15.4px');
});

test('clampStars：星级只接受 0–3 的整数（脏数据 → 0）', () => {
  assertEqual(clampStars(3), 3, '3 星');
  assertEqual(clampStars(0), 0, '0 星');
  assertEqual(clampStars(2.7), 2, '小数取整');
  assertEqual(clampStars(-1), 0, '负数 → 0');
  assertEqual(clampStars(9), 3, '超过 3 → 3');
  assertEqual(clampStars('2'), 0, '字符串不是数字 → 0');
  assertEqual(clampStars(undefined), 0, '缺省 → 0');
});

test('renderMap / 平移 API：没有宿主元素时安全返回（不在 Node 里碰 DOM）', () => {
  const empty = renderMap(null, {});
  assertDeepEqual(empty, { offset: 0, geometry: null, visible: [], focused: null, total: LEVEL_MAP_POS.length }, '无宿主 → 不抛错，返回兜底快照');
  assertEqual(mapSnapshot(null), null, '没有世界状态时快照为 null');
  assertEqual(panMap(null, 100), null, '没有世界状态时平移是空操作');
  assertEqual(setMapOffset(null, 10), null, '没有世界状态时设置偏移是空操作');
  assertEqual(centerMapOn(null, 5), null, '没有世界状态时回中是空操作');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
