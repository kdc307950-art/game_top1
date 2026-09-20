// shuffle.js — 死局检测、重排、可移动性判定。见 AGENTS.md 2.2 / 2.3 / 3.8 / 4.2。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
// 本文件在 Step 6.1 的纯重构中从 board.js 拆出（原样搬移，逻辑零改动）：它与 board.js 的
// 「数据结构/交换/下落/填充」职责不同 —— 这里只回答两个问题：「还有得走吗」「没得走时怎么重排」。
//
// 依赖方向：本文件只依赖 config.js 与 match.js；**不**依赖 board.js（因此 board.js 可以
// 反向 import 本文件的 hasPossibleMove 供 createBoard 校验可玩性，而不形成模块环）。
// 为此 hasPossibleMove 内联了「交换 → 检测 → 换回」的三行置换，而不是调用 board.swapCells。

import { CONFIG, OBSTACLE_TYPE } from './config.js';
import { findMatches } from './match.js';

/**
 * 4.2：isCellMovable(board, r, c) —— 该格能否被交换。
 * 空格 / 纯障碍（color 为 null）不能交换；3.4 规定藤蔓中的动物不能移动。
 * 冰块不在此列：3.4 明确冰块内的动物「可以移动并消除」。
 */
export function isCellMovable(board, r, c) {
  if (!isInside(board, r, c)) return false;
  const cell = board[r][c];
  if (cell.color === null || cell.color === undefined) return false;
  return cell.obstacle !== OBSTACLE_TYPE.VINE;
}

/**
 * 4.2：hasPossibleMove(board) —— 是否存在「交换后能形成至少一组三消」的相邻对（3.8）。
 * 判定要求匹配组包含被交换的两个格子之一：棋盘已存在遗留匹配时不能把任意交换都算作可行。
 * 只检查「右」与「下」两个方向即可覆盖所有相邻对。
 */
export function hasPossibleMove(board) {
  if (!board || board.length === 0) return false;
  const rows = board.length;
  const cols = board[0].length;
  const offsets = [
    [0, 1],
    [1, 0]
  ];

  for (let r = 0; r < rows; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      if (!isCellMovable(board, r, c)) continue;
      for (const [dr, dc] of offsets) {
        const nr = r + dr;
        const nc = c + dc;
        if (!isInside(board, nr, nc) || !isCellMovable(board, nr, nc)) continue;

        // 原地交换 → 检测 → 立即换回（匹配检测不会抛错，置换必然成对发生）
        const tmp = board[r][c];
        board[r][c] = board[nr][nc];
        board[nr][nc] = tmp;
        const createsMatch = findMatches(board).some((group) =>
          group.cells.some((pos) => (pos.r === r && pos.c === c) || (pos.r === nr && pos.c === nc))
        );
        const back = board[r][c];
        board[r][c] = board[nr][nc];
        board[nr][nc] = back;

        if (createsMatch) return true;
      }
    }
  }
  return false;
}

/**
 * 4.2 / 3.8：shuffleBoard(board, options?) —— 重排普通动物格，满足 3.8 的四条约束：
 *   1) 重排后不存在初始三连；2) 重排后存在至少一个有效交换；
 *   3) **不改变障碍物布局**；4) 尝试次数不超过 maxTries（缺省取附录 B 的 shuffleMaxTries），
 *      超限返回 false，由调用方进入结束流程（视为关卡异常）。
 *
 * 只重排「普通动物格」（`color !== null && obstacle === null`）：冰块/藤蔓里的动物与障碍物绑定，
 * 单独搬动动物会破坏「障碍物—动物」的对应关系，故一并排除（Step 11/13 再细化）。
 * 重排的是**格子对象本身**（`cell.id` 随之移动），因此 UI 可以按 id 匹配出每格的起止位置做动画。
 * options.rng 可注入随机源；options.stats 为可选诊断出参，会被写入实际尝试次数。
 */
export function shuffleBoard(board, options = {}) {
  const rng = typeof options.rng === 'function' ? options.rng : Math.random;
  const maxTries =
    Number.isInteger(options.maxTries) && options.maxTries > 0
      ? options.maxTries
      : Math.max(1, CONFIG.ANIMATION_CONFIG.shuffleMaxTries);

  const positions = [];
  const pool = [];
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r].length; c += 1) {
      const cell = board[r][c];
      if (cell.color === null || cell.color === undefined) continue;
      if (cell.obstacle !== null) continue; // 约束 3：不动障碍物格
      positions.push({ r, c });
      pool.push(cell);
    }
  }
  if (pool.length < 2) return finish(options, 0, false); // 少于两格可换，重排不可能改变局面

  const original = [...pool]; // 失败时用它还原，避免棋盘停在「打过乱且含三连」的中间态
  for (let tries = 1; tries <= maxTries; tries += 1) {
    shuffleArray(pool, rng);
    positions.forEach((pos, index) => {
      board[pos.r][pos.c] = pool[index];
    });
    if (findMatches(board).length === 0 && hasPossibleMove(board)) return finish(options, tries, true);
  }
  positions.forEach((pos, index) => {
    board[pos.r][pos.c] = original[index];
  });
  return finish(options, maxTries, false);
}

/** Fisher–Yates；rng 取值越界时按 0 处理，保证索引始终合法。 */
function shuffleArray(array, rng) {
  for (let i = array.length - 1; i > 0; i -= 1) {
    const value = Number(rng());
    const raw = Math.floor((Number.isFinite(value) ? value : 0) * (i + 1));
    const j = Math.min(i, Math.max(0, raw));
    const tmp = array[i];
    array[i] = array[j];
    array[j] = tmp;
  }
}

function finish(options, tries, ok) {
  if (options.stats) options.stats.tries = tries;
  return ok;
}

function isInside(board, r, c) {
  return Boolean(board) && r >= 0 && c >= 0 && r < board.length && c < board[r].length;
}
