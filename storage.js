// storage.js — 本地存档读写（最高分、每关星级）。见 AGENTS.md 2.2 / 2.3 / v1.16。
//
// 边界（2.3，v1.16 起）：**本模块是唯一允许读写 `localStorage` 的模块**（此前该职责在 app.js）。
// 拆出来的理由有两条：① Step 12 的选关与星级存档让 app.js 超过第 6 节的 300 行上限；
// ② 「IO + JSON 容错」本就是一个独立职责 —— 它需要处理无痕模式、配额、脏数据三种失败，
// 与其把 try/catch 散在编排代码里，不如收在一处并让调用方拿到稳定的回落值。
//
// 本模块不认识棋盘、不碰 DOM/Canvas、不实现任何游戏规则；日志通过注入的 logger 输出，
// 因此它在 Node 里也能被测试（注入一个记录数组即可）。

import { STORAGE_KEYS } from './config.js';

/**
 * 建一个存档读写器。`logger(level, message)` 由调用方注入（app.js 传自己的 log），
 * 缺省时静默 —— 这样测试可以完全不开控制台。
 */
export function createStorage(logger = () => {}) {
  const read = (key, fallback, parse) => {
    try {
      const raw = window.localStorage.getItem(key);
      if (raw === null) return fallback;
      return parse(raw);
    } catch (error) {
      logger('warn', `读取存档失败（localStorage 不可用）：${error.message}`);
      return fallback;
    }
  };

  const write = (key, value, label) => {
    try {
      window.localStorage.setItem(key, value);
      return true;
    } catch (error) {
      logger('warn', `写入${label}失败：${error.message}`);
      return false;
    }
  };

  return {
    /** 最高分；不可用或内容非法时回落 0（不让整局崩掉）。 */
    readBestScore() {
      const value = read(STORAGE_KEYS.BEST_SCORE, 0, (raw) => {
        const parsed = Number.parseInt(raw, 10);
        return Number.isFinite(parsed) ? parsed : 0;
      });
      return Number.isFinite(value) && value > 0 ? value : 0;
    },

    writeBestScore(score) {
      return write(STORAGE_KEYS.BEST_SCORE, String(score), '最高分');
    },

    /** 每关星级表 `{ 关卡id: 星数 }`；脏数据一律回落空表。 */
    readLevelStars() {
      return read(STORAGE_KEYS.LEVEL_STARS, {}, (raw) => {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
      });
    },

    writeLevelStars(stars) {
      return write(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(stars), '关卡星级');
    },

    /**
     * 记录一次通关的星级：每关只留最好成绩，并立刻落盘。
     * 返回 `{ best, updated }`，供调用方打日志（「更新/沿用旧纪录」）。
     */
    recordLevelStars(stars, levelId, earned) {
      const previous = Number(stars?.[levelId] ?? 0);
      const best = Math.max(Number.isFinite(previous) ? previous : 0, earned);
      stars[levelId] = best;
      this.writeLevelStars(stars);
      return { best, updated: earned > previous };
    }
  };
}
