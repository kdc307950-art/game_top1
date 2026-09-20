// score.js — 计分系统、连消倍数。见 AGENTS.md 2.3 / 4.2 / 3.5。
//
// 纯逻辑模块：不碰 DOM / Canvas / localStorage（宪法 9 节）。
// 所有数值来自 config.js 的 CONFIG.SCORE_CONFIG（附录 B），本文件不出现魔法数字。
//
// 【Step 4】四个契约函数全部实现。本步的游戏流程只产生普通消除
//   （calcSpecialMultiplier 返回 1），特殊元素计分的**接入**属 Step 7-10 ——
//   届时只需把 cell.type 与组合类型传进来，公式与倍数表都不用改。

import { CONFIG } from './config.js';

const SCORE = CONFIG.SCORE_CONFIG;

/**
 * 4.2：calcBaseScore(matchedCells) —— 基础分 = 被消除动物数 × basePerCell（3.5「每个动物 10 分」）。
 * 只统计动物本身：冰块/雪块的层数分与宝石分由 obstacles 的 getObstacleScore 另算（3.5，Step 11）。
 */
export function calcBaseScore(matchedCells) {
  if (!Array.isArray(matchedCells)) return 0;
  return matchedCells.length * SCORE.basePerCell;
}

/**
 * 4.2：calcSpecialMultiplier(type, comboType) —— 特效倍数（3.5 倍数表）。
 * 普通元素与未登记取值一律返回 1：保守，既不放大分数，也不用抛错打断整局。
 * 3.3 规定组合效果优先，故 comboType 命中倍数表时直接返回组合倍数。
 */
export function calcSpecialMultiplier(type, comboType = null) {
  const table = SCORE.specialMultipliers;
  if (comboType !== null && comboType !== undefined && comboType in table) return table[comboType];
  if (type !== null && type !== undefined && type in table) return table[type];
  return 1;
}

/**
 * 4.2：calcCascadeBonus(cascadeLevel, baseScore) —— 连消加分（3.5「依次为 30、60、90、120 递增」）。
 * 第 1 层是交换本身造成的消除，不算「连消」，从第 2 层起计入（见 D016）。
 * baseScore 是 4.2 契约的一部分：3.5 规定的是固定递增值，当前实现不依赖它；
 * 保留该参数，以便将来按消除规模调整加分比例时不必改签名与调用点。
 */
export function calcCascadeBonus(cascadeLevel, baseScore) {
  const level = Number.isFinite(cascadeLevel) ? Math.floor(cascadeLevel) : 0;
  if (level < 2) return 0;
  return (level - 1) * SCORE.cascadeStep;
}

/**
 * 4.2：calcFinalScore(baseScore, multiplier, cascadeBonus) —— 单层结算分。
 * 不做取整：3.5 的倍数都是 0.5 的整数倍、basePerCell = 10，结果必然是整数，
 * 保留精确值可以让公式与附录 A 的速查表逐项对得上。
 */
export function calcFinalScore(baseScore, multiplier, cascadeBonus) {
  const base = Number.isFinite(baseScore) ? baseScore : 0;
  const mul = Number.isFinite(multiplier) ? multiplier : 1;
  const bonus = Number.isFinite(cascadeBonus) ? cascadeBonus : 0;
  return base * mul + bonus;
}
