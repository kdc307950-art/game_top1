// tests/vine-map.test.js — vine-map.js（藤蔓地图）的单元测试。见 AGENTS.md 7.1 与 19.2 / DECISIONS D039。
//
// 只测**纯函数**（分页、坐标、确定性路径、星级规范化）—— DOM 渲染部分由 `_build/verify-step19-2.mjs`
// 在真实浏览器里取证（L2/L3），坐标表 ↔ LEVELS.md 的一致性由 `_build/check-vine-map.mjs` 巡检。

import { test, assertEqual, assertTrue, assertFalse, assertDeepEqual, summarize } from './assert.js';
import { CONFIG } from '../config.js';
import { LEVEL_COUNT, LEVEL_MAP_POS } from '../level.js';
import { MAP_PAGE_SIZE, buildVineAnchors, buildVinePath, clampStars, mulberry32, pageCount, pageOf, positionsOnPage, renderMap } from '../vine-map.js';

const MAP = CONFIG.VINE_MAP_CONFIG;

test('分页：每页 pageSize 关、共 5 页，页号 = ⌈关号 / 每页关数⌉', () => {
  assertEqual(MAP_PAGE_SIZE, MAP.pageSize, '导出的每页关数与配置一致');
  assertEqual(pageCount(), Math.ceil(LEVEL_COUNT / MAP.pageSize), '页数');
  assertEqual(pageCount(), 5, '50 关 / 每页 10 关 = 5 页');
  assertEqual(pageOf(1), 1, '第 1 关在第 1 页');
  assertEqual(pageOf(10), 1, '第 10 关在第 1 页');
  assertEqual(pageOf(11), 2, '第 11 关在第 2 页');
  assertEqual(pageOf(50), 5, '第 50 关在第 5 页');
  assertEqual(pageOf(0), 1, '非法关号夹到第 1 页');
  assertEqual(pageOf(999), 5, '越界关号夹到最后一页');
});

test('positionsOnPage：每页恰好 10 关且关号连续；越界页被夹住', () => {
  for (let page = 1; page <= pageCount(); page += 1) {
    const positions = positionsOnPage(page);
    assertEqual(positions.length, MAP.pageSize, `第 ${page} 页的关数`);
    const ids = positions.map((pos) => pos.id);
    assertDeepEqual(ids, Array.from({ length: MAP.pageSize }, (_, i) => (page - 1) * MAP.pageSize + i + 1), `第 ${page} 页的关号`);
    assertTrue(positions.every((pos) => pos.page === page), `第 ${page} 页的 page 字段`);
  }
  assertEqual(positionsOnPage(0)[0].id, 1, '第 0 页夹到第 1 页');
  assertEqual(positionsOnPage(99)[0].id, 41, '第 99 页夹到第 5 页');
});

test('LEVEL_MAP_POS：50 项、关号连续、坐标落在 viewBox 内、页内 5 行 × 2 列', () => {
  assertEqual(LEVEL_MAP_POS.length, LEVEL_COUNT, '坐标条数 = 关卡数');
  assertDeepEqual(LEVEL_MAP_POS.map((pos) => pos.id), Array.from({ length: LEVEL_COUNT }, (_, i) => i + 1), '关号 1..50 连续');
  assertTrue(
    LEVEL_MAP_POS.every((pos) => pos.x === MAP.marginX || pos.x === MAP.width - MAP.marginX),
    'x 都在两列之一'
  );
  assertTrue(LEVEL_MAP_POS.every((pos) => pos.y >= MAP.marginY && pos.y <= MAP.height - MAP.marginY), 'y 在上下边距之间');
  // 页内是 5 行 × 2 列，所以「页 + 坐标」才唯一（不同页可以复用同一组 x/y）
  assertEqual(new Set(LEVEL_MAP_POS.map((pos) => `${pos.page},${pos.x},${pos.y}`)).size, LEVEL_COUNT, '没有两关落在同一页的同一坐标');
  assertEqual(new Set(LEVEL_MAP_POS.map((pos) => `${pos.x},${pos.y}`)).size, MAP.pageSize, '页内恰好 10 个不同坐标（5 行 × 2 列）');
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

test('buildVinePath：同页永远同一条 d（设计期派生），且路径依次经过本页每个节点', () => {
  const first = buildVinePath(1);
  assertEqual(first, buildVinePath(1), '同一页两次结果相同');
  assertTrue(first.startsWith('M '), '以 M 开头');
  assertEqual(first.split('C').length - 1, buildVineAnchors(1).length - 1, '每两个锚点之间一段三次贝塞尔');
  assertFalse(buildVinePath(1) === buildVinePath(2), '不同页的路径不同（种子随页变化）');

  const anchors = buildVineAnchors(1);
  const nodes = positionsOnPage(1);
  assertEqual(anchors.length, nodes.length + 2, '锚点 = 页顶边缘 + 本页节点 + 页底边缘');
  assertDeepEqual(anchors[0], { x: MAP.width / 2, y: 0 }, '起点在页顶边缘');
  assertDeepEqual(anchors[anchors.length - 1], { x: MAP.width / 2, y: MAP.height }, '终点在页底边缘（跨页接口）');
  nodes.forEach((node, index) => {
    assertDeepEqual(anchors[index + 1], { x: node.x, y: node.y }, `第 ${index + 1} 个锚点 = 第 ${node.id} 关的坐标`);
    assertTrue(first.includes(` ${node.x} ${node.y}`), '路径的 d 里出现该节点坐标（节点落在藤蔓上）');
  });
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
