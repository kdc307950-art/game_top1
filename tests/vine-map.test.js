// tests/vine-map.test.js — vine-map.js（藤蔓地图）的单元测试。见 AGENTS.md 7.1 与 19.2 v2 / DECISIONS D040。
//
// 只测**纯函数**（分页、归一化坐标、确定性路径、节点状态机、星级规范化）—— DOM 渲染部分由
// `_build/verify-step19-2.mjs` 在真实浏览器里取证（L2/L3），坐标表 ↔ LEVELS.md 的一致性由 `_build/check-vine-map.mjs` 巡检。
//
// 19.2 v2 的关键改写：**节点坐标不再参与路径计算**（用户方案），因此删掉了第一版的「每个节点都在路径上」，
// 改为「路径只由 `VINE_MAP_CONFIG.anchors` + 固定种子决定、与节点坐标无关」。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import { HIDDEN_LEVEL_IDS, LEVEL_COUNT, LEVEL_MAP_POS } from '../level.js';
import {
  MAP_PAGE_SIZE,
  buildVineAnchors,
  buildVinePath,
  buildVineSegments,
  clampStars,
  mulberry32,
  nodeState,
  pageCount,
  pageOf,
  positionsOnPage,
  renderMap,
  starPath
} from '../vine-map.js';

const MAP = CONFIG.VINE_MAP_CONFIG;
const round3 = (value) => Math.round(value * 1000) / 1000;
const round1 = (value) => Math.round(value * 10) / 10;

test('分页：每页 pageSize 关、共 6 页（5 页主线 + 1 页天边），页号 = ⌈关号 / 每页关数⌉', () => {
  assertEqual(MAP_PAGE_SIZE, MAP.pageSize, '导出的每页关数与配置一致');
  assertEqual(pageCount(), Math.ceil(LEVEL_MAP_POS.length / MAP.pageSize), '页数');
  assertEqual(pageCount(), 6, '50 关主线 + 3 关天边 = 53 个节点 / 每页 10 = 6 页');
  assertEqual(pageOf(1), 1, '第 1 关在第 1 页');
  assertEqual(pageOf(10), 1, '第 10 关在第 1 页');
  assertEqual(pageOf(11), 2, '第 11 关在第 2 页');
  assertEqual(pageOf(50), 5, '第 50 关在第 5 页');
  assertEqual(pageOf(51), 6, '第 51 关（天边第一关）在第 6 页');
  assertEqual(pageOf(0), 1, '非法关号夹到第 1 页');
  assertEqual(pageOf(999), 6, '越界关号夹到最后一页');
});

test('positionsOnPage：前 5 页各 10 关、第 6 页是天边 3 关；越界页被夹住', () => {
  const mainPages = Math.ceil(LEVEL_COUNT / MAP.pageSize);
  for (let page = 1; page <= mainPages; page += 1) {
    const positions = positionsOnPage(page);
    assertEqual(positions.length, MAP.pageSize, `第 ${page} 页的关数`);
    const ids = positions.map((pos) => pos.id);
    assertDeepEqual(ids, Array.from({ length: MAP.pageSize }, (_, i) => (page - 1) * MAP.pageSize + i + 1), `第 ${page} 页的关号`);
    assertTrue(positions.every((pos) => pos.page === page), `第 ${page} 页的 page 字段`);
  }
  const tianbian = positionsOnPage(6);
  assertDeepEqual(tianbian.map((pos) => pos.id), HIDDEN_LEVEL_IDS, '第 6 页只放隐藏关');
  assertTrue(tianbian.every((pos) => pos.page === 6), '隐藏关都属于第 6 页');
  assertEqual(positionsOnPage(0)[0].id, 1, '第 0 页夹到第 1 页');
  assertEqual(positionsOnPage(99)[0].id, HIDDEN_LEVEL_IDS[0], '第 99 页夹到最后一页（天边）');
});

test('LEVEL_MAP_POS：主线 50 + 天边 3、关号连续、坐标是归一化值、X 轴 ≥3 个水平位置', () => {
  const total = LEVEL_COUNT + HIDDEN_LEVEL_IDS.length;
  assertEqual(LEVEL_MAP_POS.length, total, '坐标条数 = 主线 + 隐藏关');
  assertDeepEqual(
    LEVEL_MAP_POS.filter((pos) => pos.id <= LEVEL_COUNT).map((pos) => pos.id),
    Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1),
    '主线关号 1..50 连续'
  );
  assertDeepEqual(LEVEL_MAP_POS.filter((pos) => pos.id > LEVEL_COUNT).map((pos) => pos.id), HIDDEN_LEVEL_IDS, '天边关号 = HIDDEN_LEVEL_IDS');
  assertTrue(LEVEL_MAP_POS.every((pos) => pos.x >= 0 && pos.x <= 1 && pos.y >= 0 && pos.y <= 1), '坐标都是 0–1 的归一化值');
  assertTrue(
    LEVEL_MAP_POS.every((pos) => MAP.nodeColumns.includes(pos.x)),
    `x 都落在 nodeColumns（${MAP.nodeColumns.join(' / ')}）之一`
  );
  assertTrue(new Set(LEVEL_MAP_POS.map((pos) => pos.x)).size >= 3, 'X 轴至少 3 个不同水平位置（打破两列对齐）');
  for (let page = 1; page <= pageCount(); page += 1) {
    const columns = new Set(positionsOnPage(page).map((pos) => pos.x));
    assertTrue(columns.size >= 3, `第 ${page} 页也有 ≥3 个不同 X 水平位置`);
  }
  // 页内是 5 行 × 2 个：Y 由公式给出，行内两个节点一高一低（±nodeStaggerY）形成错落
  const spanY = (1 - MAP.nodeMarginY * 2) / (MAP.nodeRows - 1);
  const yExact = LEVEL_MAP_POS.every((pos) => {
    const index = (pos.id - 1) % MAP.pageSize;
    const expected = round3(MAP.nodeMarginY + Math.floor(index / 2) * spanY + (index % 2 === 0 ? -MAP.nodeStaggerY : MAP.nodeStaggerY));
    return pos.y === expected;
  });
  assertTrue(yExact, 'y 与「每页 5 行 + ±错落」的公式一致');
  assertEqual(new Set(LEVEL_MAP_POS.map((pos) => `${pos.page},${pos.x},${pos.y}`)).size, total, '没有两个节点落在同一页的同一坐标');
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

test('buildVineAnchors：只来自 VINE_MAP_CONFIG.anchors（归一化 × viewBox），与节点坐标无关', () => {
  const anchors = buildVineAnchors();
  assertDeepEqual(
    anchors,
    MAP.anchors.map((anchor) => ({ x: round3(anchor.x * MAP.width), y: round3(anchor.y * MAP.height) })),
    '锚点 = config 的归一化锚点 × viewBox 宽高'
  );
  assertTrue(anchors.length >= 4, '锚点至少 4 个');
  assertTrue(anchors[0].y < MAP.height, '入口在页内（y < 1）');
  assertTrue(anchors[anchors.length - 1].y > MAP.height, '出口略超出页底（y > 1，跨屏接口）');
  // 跨屏衔接：上一屏出口 y − 1 屏高 = 下一屏入口 y
  assertTrue(Math.abs(MAP.anchors[MAP.anchors.length - 1].y - 1 - MAP.anchors[0].y) < 1e-9, '出口与下一页入口在 Y 轴上衔接');
  const nodePoints = positionsOnPage(1).map((pos) => ({ x: round1(pos.x * MAP.width), y: round1(pos.y * MAP.height) }));
  assertTrue(
    anchors.every((anchor) => !nodePoints.some((point) => point.x === anchor.x && point.y === anchor.y)),
    '锚点与节点坐标不重合（路径不经过节点）'
  );
});

test('buildVinePath：同页永远同一条 d（设计期派生）、是曲线而不是直线拼接、且与节点坐标无关', () => {
  const first = buildVinePath(1);
  assertEqual(first, buildVinePath(1), '同一页两次结果相同');
  assertTrue(first.startsWith('M '), '以 M 开头');
  assertEqual(first.split('C').length - 1, buildVineAnchors().length - 1, '每两个锚点之间一段三次贝塞尔');
  assertFalse(buildVinePath(1) === buildVinePath(2), '不同页的路径不同（种子随页变化）');

  // 节点坐标是显式的、**不参与路径计算**（19.2 v2 的用户方案取舍，见 D040）：
  // 因此路径里不应出现任何节点坐标。
  positionsOnPage(1).forEach((node) => {
    const point = `${round1(node.x * MAP.width)} ${round1(node.y * MAP.height)}`;
    assertFalse(first.includes(` ${point}`), `第 ${node.id} 关的坐标不出现在路径 d 里`);
  });

  // 「曲线而不是直线拼接」：每段的控制点都偏离弦（直线时垂距为 0），且整体确实弯了
  const segments = buildVineSegments(1);
  assertEqual(segments.length, buildVineAnchors().length - 1, '分段数 = 锚点数 − 1');
  const deviations = segments.map((seg) => {
    const dx = seg.to.x - seg.from.x;
    const dy = seg.to.y - seg.from.y;
    const length = Math.hypot(dx, dy) || 1;
    const distance = (point) => Math.abs((point.x - seg.from.x) * dy - (point.y - seg.from.y) * dx) / length;
    return Math.max(distance(seg.c1), distance(seg.c2));
  });
  assertTrue(deviations.every((value) => value > 0.5), `每段都不是直线（控制点偏离弦）：${JSON.stringify(deviations)}`);
  assertTrue(Math.max(...deviations) > 5, '曲线确实弯曲（最大偏离 > 5px）');
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

test('renderMap：没有宿主元素时安全返回（不在 Node 里碰 DOM）', () => {
  assertDeepEqual(renderMap(null, { page: 1 }), { page: 1, total: 1 }, '无宿主 → 不抛错，返回兜底值');
});

if (!globalThis.__XXL_TEST_BUNDLE__) await summarize();
