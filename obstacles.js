// obstacles.js — 障碍物创建、消除、层数管理。见 AGENTS.md 2.3 / 3.4 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
// 所有可调数值来自 config.js 的 CONFIG（附录 B），本文件不出现魔法数字。
//
// 3.4（v1.12 明文）把障碍物分两类，本模块只负责「障碍物自身」：
//   覆层障碍 ice/vine：格内有动物，动物被消除后该格补位而障碍物留在原格；
//   占格障碍 snow/choc：格内没有动物，不参与匹配、不补位、不下落。
// 「哪些格子本层该受损」的策略在 board.js 的消除流程里（那里才知道本层的清除集合与邻域关系），
// 两者通过 4.2 的 damageObstacle 衔接 —— 本模块不认识「匹配」也不认识「级联」。

import { CONFIG, OBSTACLE_TYPE } from './config.js';

const LIMITS = CONFIG.OBSTACLE_CONFIG;
const SCORE = CONFIG.SCORE_CONFIG;

// 3.5（v1.17）：冰块/雪块按层计分，巧克力按块计分（同为 1000）；**藤蔓不登记** ——
// v1.17 口径下它永不被清除、不会产生层数分，漏登记即得 0 分正是期望行为。
const SCORE_PER_LAYER = {
  [OBSTACLE_TYPE.ICE]: SCORE.icePerLayer,
  [OBSTACLE_TYPE.SNOW]: SCORE.snowPerLayer,
  [OBSTACLE_TYPE.CHOC]: SCORE.chocPerLayer
};

/**
 * 4.2：createObstacle(type, layers) —— 障碍物值对象 Obstacle = { type, layers }（v1.12 补形状）。
 * 层数按 3.4 与 OBSTACLE_CONFIG 的上限裁剪；下限为 1，因为 0 层等于没有障碍物。
 * 未登记的 type 返回 null —— 与 score.js 的保守风格一致：不抛错打断整局，由调用方决定怎么处理。
 */
export function createObstacle(type, layers = 1) {
  const limit = LIMITS[type];
  if (!limit) return null;
  const wanted = Number.isFinite(layers) ? Math.floor(layers) : 1;
  return { type, layers: Math.min(Math.max(wanted, 1), limit.maxLayers) };
}

/**
 * 4.2：damageObstacle(board, r, c, amount) —— 对某格障碍物造成 amount 层伤害（3.4）。
 * 原地修改 cell.obstacleLayers；层数归零时清空 obstacle/obstacleLayers（障碍物消失，
 * 占格障碍格从此变成可被填充的空格）。返回 { cleared, layersRemoved }。
 * 无障碍物、越界或 amount ≤ 0 时返回 { cleared: false, layersRemoved: 0 }（幂等，不报错）。
 *
 * v1.17（用户批准）：**藤蔓永不被清除**（永久锁格），因此这里对藤蔓一律返回零伤害 ——
 * 这是唯一权威的「藤蔓不可被清除」判定点，board.js 的受损候选即使把它算进来也无效。
 */
export function damageObstacle(board, r, c, amount = 1) {
  const none = { cleared: false, layersRemoved: 0 };
  const cell = board?.[r]?.[c];
  if (!cell || cell.obstacle === null || cell.obstacle === undefined) return none;
  if (cell.obstacle === OBSTACLE_TYPE.VINE) return none; // 3.4 v1.17：藤蔓是永久锁格
  const step = Number.isFinite(amount) ? Math.floor(amount) : 0;
  if (step <= 0) return none;

  const before = Number.isFinite(cell.obstacleLayers) ? cell.obstacleLayers : 0;
  const after = Math.max(before - step, 0);
  cell.obstacleLayers = after;
  const cleared = after === 0;
  if (cleared) cell.obstacle = null;
  return { cleared, layersRemoved: before - after };
}

/**
 * 4.2：getObstacleScore(type, layersRemoved) —— 3.5 的障碍物得分。
 * 冰块/雪块每层 1000 分，**巧克力每块 1000 分（v1.17）**，藤蔓不计分（它永不被清除）。
 * 层数分另算、不参与特效倍数（3.5 v1.12）：调用方把它加在 base × multiplier + bonus 之外。
 * 未登记类型与非法层数返回 0，不放大分数。
 */
export function getObstacleScore(type, layersRemoved) {
  const perLayer = SCORE_PER_LAYER[type] ?? 0;
  if (perLayer === 0) return 0;
  const layers = Number.isFinite(layersRemoved) ? Math.max(Math.floor(layersRemoved), 0) : 0;
  return layers * perLayer;
}

/**
 * 4.2：isObstacleCleared(board, r, c) —— 该格是否已经没有障碍物。
 * 越界视为已清除（true）：调用方拿它做「这一格还会不会再掉层」的判断，不应因越界中断。
 */
export function isObstacleCleared(board, r, c) {
  const cell = board?.[r]?.[c];
  if (!cell) return true;
  if (cell.obstacle === null || cell.obstacle === undefined) return true;
  return !(cell.obstacleLayers > 0);
}
