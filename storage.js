// storage.js — 本地存档读写（最高分、每关星级、道具数量）。见 AGENTS.md 2.2 / 2.3 / v1.16 / 3.9 / v1.21。
//
// 边界（2.3，v1.16 起）：**本模块是唯一允许读写 `localStorage` 的模块**（此前该职责在 app.js）。
// 拆出来的理由有两条：① Step 12 的选关与星级存档让 app.js 超过第 6 节的 300 行上限；
// ② 「IO + JSON 容错」本就是一个独立职责 —— 它需要处理无痕模式、配额、脏数据三种失败，
// 与其把 try/catch 散在编排代码里，不如收在一处并让调用方拿到稳定的回落值。
//
// v1.21（用户批准的 19.1）：存储**后端可注入**（`backend` 参数，默认 `localStorageBackend`），
// 业务代码只认 `createStorage()` 返回的接口；将来接 Tauri 的文件存储时换一个 backend 即可，不改业务代码。
// 同时星级存档带**格式版本**（`STORAGE_CONFIG.schemaVersion`）并能就地迁移旧格式，详见 `parseStarsRecord`。
//
// 本模块不认识棋盘、不碰 DOM/Canvas、不实现任何游戏规则；日志通过注入的 logger 输出，
// 因此它在 Node 里也能被测试（注入一个记录数组即可）。

import { BOOSTER_KIND, CONFIG, STORAGE_KEYS } from './config.js';

const BOOSTER_KINDS = Object.values(BOOSTER_KIND);
/** 当前存档格式版本（附录 B `STORAGE_CONFIG.schemaVersion`）；读到更低版本就地迁移，读到更高版本只读不写。 */
const SCHEMA_VERSION = CONFIG.STORAGE_CONFIG.schemaVersion;

/**
 * 默认存储后端：浏览器 `localStorage`。
 * 只暴露 get/set/remove 三个方法（最小接口）；任何异常都原样抛出，由 `createStorage` 统一兜底 ——
 * 于是「无痕模式 / 配额满 / 后端不存在」三种失败走同一条回落路径。
 */
export const localStorageBackend = {
  get(key) {
    return globalThis.window.localStorage.getItem(key);
  },
  set(key, value) {
    globalThis.window.localStorage.setItem(key, value);
  },
  remove(key) {
    globalThis.window.localStorage.removeItem(key);
  }
};

/**
 * 星级表解析 + 版本迁移（v1.21 引入，v1.26 扩到 v2）。
 *   v0（历史格式，无 version 字段）：`{ "1": 3, "2": 2 }` —— 顶层就是关卡表，值是**数字**
 *   v1：`{ version: 1, levels: { "1": 3 }, updatedAt }` —— 关卡表进 `levels`，值仍是数字
 *   v2（当前，v1.26 / Step 20.4）：`{ version: 2, levels: { "1": { stars: 3, rainbow: false } }, updatedAt }`
 *       —— 值是**对象**，为「彩星（rainbow）」预留字段；彩星**不计入总星数**（见 `getTotalRainbows`）
 * 迁移是**就地**且幂等的：v0/v1 读进来后逐关补 `rainbow: false` 并写回，老存档一分不丢。
 * 返回 `{ levels, records, migrated, writable }`：
 *   levels    —— 展平的星级表 `{ id: 数字 }`（对调用方与旧格式完全同形，hud/app/vine-map 不需要改）
 *   records   —— 完整的 v2 记录 `{ id: { stars, rainbow } }`（彩星与将来的解锁门槛从这里取）
 *   migrated  —— 读到的是旧格式，调用方应写回（老存档因此不会在下次改动时丢）
 *   writable  —— false 表示读到的是**未来版本**，只尽力读取、**绝不写回**（避免降级覆盖）
 */
export function parseStarsRecord(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
    return { levels: {}, records: {}, migrated: false, writable: true };
  }
  const version = Number.isFinite(raw.version) ? Math.trunc(raw.version) : 0;
  if (version > SCHEMA_VERSION) {
    const records = normalizeLevels(raw.levels);
    return { levels: flattenStars(records), records, migrated: false, writable: false };
  }
  // v0 的顶层键就是关卡 id；v1 起关卡表在 levels 字段里。两者都经过同一套规范化（只收数字键、非负整数）。
  const records = normalizeLevels(version >= 1 ? raw.levels : raw);
  return { levels: flattenStars(records), records, migrated: version < SCHEMA_VERSION, writable: true };
}

/**
 * 关卡表的规范化：只保留 `"<数字>"` 键，逐关归一成 v2 的记录 `{ stars, rainbow }`。
 * 值是数字（v0/v1）时补 `rainbow: false`；值是对象（v2）时只认 `stars` 与**严格布尔**的 `rainbow` ——
 * 脏数据因此既不会变成 NaN/负数，也不会把 `'false'` 这种真值当成彩星。
 */
function normalizeLevels(source) {
  const records = {};
  if (!source || typeof source !== 'object' || Array.isArray(source)) return records;
  for (const [key, value] of Object.entries(source)) {
    if (!/^\d+$/.test(key)) continue;
    records[key] = normalizeLevelEntry(value);
  }
  return records;
}

/** 单关记录归一化：数字（v0/v1）→ `{ stars, rainbow: false }`；对象（v2）→ 只取合法字段。 */
function normalizeLevelEntry(value) {
  if (value && typeof value === 'object' && !Array.isArray(value)) {
    return { stars: normalizeStars(value.stars), rainbow: value.rainbow === true };
  }
  return { stars: normalizeStars(value), rainbow: false };
}

/** v2 记录 → 展平的星级表（hud/app/vine-map 用的形状，与旧格式完全同形）。 */
function flattenStars(records) {
  const levels = {};
  for (const [key, entry] of Object.entries(records ?? {})) levels[key] = entry.stars;
  return levels;
}

function normalizeStars(value) {
  const stars = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, stars);
}

/**
 * 把存档包成当前版本的记录（写入路径的唯一出口，保证 version 与 updatedAt 一定存在）。
 * 入参可以是**展平的星级表**（`{ id: 数字 }`，app.js 与旧调用）或**完整的 v2 记录**
 * （`{ id: { stars, rainbow } }`）—— 两者都先归一成记录再落盘，彩星字段因此不会在写入时被抹掉。
 */
function serializeStars(source) {
  return {
    version: SCHEMA_VERSION,
    levels: normalizeLevels(source),
    updatedAt: new Date().toISOString()
  };
}

/**
 * 彩星数量（v1.26 / Step 20.4）：与 `getTotalStars` 一样是**派生量**，不进存档。
 * 口径：**彩星不计入总星数**（用户方案 §2.2 第三步）—— 选关地图的 `⭐ n/150` 只数星级，
 * 彩星是「三星之上的额外荣誉」，将来单独展示。入参是 v2 的记录表。
 */
export function getTotalRainbows(records) {
  let total = 0;
  for (const entry of Object.values(records ?? {})) {
    if (entry && typeof entry === 'object' && entry.rainbow === true) total += 1;
  }
  return total;
}

/**
 * 总星数（v1.21，用户方案 §1.3）：**派生量**，不进存档 —— 存了就会有两处真相源，
 * 与 4.2 对分数的口径一致（「分数不另存字段，统一读 level.currentScore」）。
 */
export function getTotalStars(stars) {
  let total = 0;
  for (const value of Object.values(stars ?? {})) {
    if (Number.isFinite(value)) total += Math.trunc(value);
  }
  return Math.max(0, total);
}

/** 3.9（v1.20）：每种道具的初始数量（`BOOSTER_CONFIG.initialCount`，缺省由 config.js 兜底）。 */
function defaultBoosters() {
  const counts = {};
  for (const kind of BOOSTER_KINDS) counts[kind] = CONFIG.BOOSTER_CONFIG.initialCount;
  return counts;
}

/** 5.6（v1.22）：音效与震动的默认偏好（用户没改过时为「都开」）。 */
function defaultPrefs() {
  return { sound: true, haptic: true };
}

/** 偏好只接受布尔值：脏数据（字符串/数字/null）一律回落默认值，避免出现 `'false'` 这种真值。 */
function normalizePrefs(stored) {
  const prefs = defaultPrefs();
  if (!stored || typeof stored !== 'object' || Array.isArray(stored)) return prefs;
  for (const key of Object.keys(prefs)) {
    if (typeof stored[key] === 'boolean') prefs[key] = stored[key];
  }
  return prefs;
}

/** 数量只接受非负整数：脏数据（负数、小数、字符串）一律夹到合法范围，避免出现「-1 个道具」。 */
function normalizeCount(value) {
  const count = Number.isFinite(value) ? Math.trunc(value) : 0;
  return Math.max(0, count);
}

/**
 * 建一个存档读写器。`logger(level, message)` 由调用方注入（app.js 传自己的 log），
 * 缺省时静默 —— 这样测试可以完全不开控制台。
 * `backend` 缺省为 `localStorageBackend`；传别的实现（文件、IndexedDB、内存）即可迁移存储介质（v1.21）。
 */
export function createStorage(logger = () => {}, backend = localStorageBackend) {
  const read = (key, fallback, parse) => {
    try {
      const raw = backend.get(key);
      if (raw === null || raw === undefined) return fallback;
      return parse(raw);
    } catch (error) {
      logger('warn', `读取存档失败（存储后端不可用或内容非法）：${error.message}`);
      return fallback;
    }
  };

  const write = (key, value, label) => {
    try {
      backend.set(key, value);
      return true;
    } catch (error) {
      logger('warn', `写入${label}失败：${error.message}`);
      return false;
    }
  };

  /**
   * 读一次星级存档并解析（含迁移判定与**就地写回**）—— 三个读取入口共用，避免重复解析。
   * 迁移只发生在「是可写的老版本」时：读到未来版本绝不写回（v1.21 的降级保护）。
   */
  const readRecords = () => {
    const raw = read(STORAGE_KEYS.LEVEL_STARS, null, (text) => JSON.parse(text));
    const parsed = parseStarsRecord(raw);
    if (parsed.migrated && parsed.writable) {
      write(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(serializeStars(parsed.records)), '关卡星级');
      logger('info', `星级存档已就地迁移到 v${SCHEMA_VERSION}（${Object.keys(parsed.records).length} 关，含彩星字段）`);
    }
    return parsed;
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

    /**
     * 每关星级表 `{ 关卡id: 星数 }`（对调用方**与旧格式同形**，hud/app/vine-map 无需改动）。
     * 脏数据一律回落空表；读到旧格式（v0/v1）时**就地迁移**并写回 —— 老存档不会在下次改动时丢（v1.21 / v1.26）。
     * 读到比当前更高的版本时只尽力读取、不写回（避免把新版数据降级覆盖）。
     */
    readLevelStars() {
      return readRecords().levels;
    },

    /**
     * 完整的 v2 记录表 `{ 关卡id: { stars, rainbow } }`（v1.26 / Step 20.4）。
     * **彩星字段的预留出口**：本步只把字段与迁移做出来，真正决定「什么条件给彩星」的规则
     * 需要单独的数值调优（用户方案 §2.2 第三步），因此当前 UI 还不消费它 ——
     * 但迁移、写回、脏数据规范化都已生效，将来接规则时不必再改存档格式。
     */
    readLevelRecords() {
      return readRecords().records;
    },

    /** 写入带版本与时间戳的存档记录（v1.21）；入参可以是展平的星级表，也可以是完整的 v2 记录。 */
    writeLevelStars(stars) {
      return write(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(serializeStars(stars)), '关卡星级');
    },

    /** 写入完整的 v2 记录表（v1.26）—— 与 `writeLevelStars` 是同一个出口，只是入参形状更明确。 */
    writeLevelRecords(records) {
      return write(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(serializeStars(records)), '关卡星级');
    },

    /** 总星数（派生量，不入存档）—— 选关界面与未来的解锁门槛都从这里取，见 `getTotalStars`。 */
    readTotalStars() {
      return getTotalStars(this.readLevelStars());
    },

    /** 彩星数量（派生量，不入存档；**不计入总星数**，见 `getTotalRainbows`）。 */
    readTotalRainbows() {
      return getTotalRainbows(this.readLevelRecords());
    },

    /**
     * 记录一次通关的星级：每关只留最好成绩，并立刻落盘。
     * 返回 `{ best, updated }`，供调用方打日志（「更新/沿用旧纪录」）—— 形状与 v1.21 一致，调用方无需改。
     *
     * v1.26（Step 20.4）：写入走 **v2 记录**，因此**彩星标志不会被抹掉** ——
     * `options.rainbow` 缺省时沿用该关既有的标志（将来接了彩星规则，只要在这里传 true）。
     * 同时把 `stars[levelId]` 同步回调用方持有的展平表，避免两处读数不一致。
     */
    recordLevelStars(stars, levelId, earned, options = {}) {
      const key = String(levelId);
      const records = readRecords().records;
      // 调用方持有的展平表可能含存档里还没有的关卡：只补缺，**存档里已有的以存档为准**（防止降级覆盖）
      if (stars && typeof stars === 'object') {
        for (const [id, value] of Object.entries(stars)) {
          if (!/^\d+$/.test(id) || id in records) continue;
          records[id] = { stars: normalizeStars(value), rainbow: false };
        }
      }
      const previous = records[key] ?? { stars: 0, rainbow: false };
      const best = Math.max(previous.stars, normalizeStars(earned));
      records[key] = { stars: best, rainbow: options.rainbow ?? previous.rainbow };
      write(STORAGE_KEYS.LEVEL_STARS, JSON.stringify(serializeStars(records)), '关卡星级');
      if (stars && typeof stars === 'object') stars[levelId] = best;
      return { best, updated: normalizeStars(earned) > previous.stars };
    },

    /**
     * 道具数量表 `{ refresh, addSteps, hammer }`（3.9 v1.20）。
     * 缺失的键补初始值、多余/非法的键丢弃 → 无论存档里是什么，返回的对象总是「可用的数量表」。
     */
    readBoosters() {
      const stored = read(STORAGE_KEYS.BOOSTERS, null, (raw) => {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      });
      const counts = defaultBoosters();
      if (stored) {
        for (const kind of BOOSTER_KINDS) {
          if (kind in stored) counts[kind] = normalizeCount(stored[kind]);
        }
      }
      return counts;
    },

    writeBoosters(counts) {
      return write(STORAGE_KEYS.BOOSTERS, JSON.stringify(counts), '道具数量');
    },

    /**
     * 消耗一个道具并立刻落盘。数量已为 0 时**不消耗**（返回 `used: false`），
     * 调用方据此决定是否回退 UI —— 逻辑层的 `game.useBooster` 不认识数量（见 3.9 与 2.3）。
     */
    spendBooster(counts, kind) {
      if (!BOOSTER_KINDS.includes(kind)) return { used: false, left: 0 };
      const left = normalizeCount(counts?.[kind]);
      if (left <= 0) return { used: false, left: 0 };
      counts[kind] = left - 1;
      this.writeBoosters(counts);
      return { used: true, left: counts[kind] };
    },

    /**
     * 音效 / 震动偏好 `{ sound, haptic }`（5.6 v1.22）。
     * 缺失的键补默认值（都开）、非布尔的脏值回落默认值 —— 返回的对象一定可直接用于开关判断。
     */
    readPrefs() {
      const stored = read(STORAGE_KEYS.PREFS, null, (raw) => {
        const parsed = JSON.parse(raw);
        return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
      });
      return normalizePrefs(stored);
    },

    writePrefs(prefs) {
      return write(STORAGE_KEYS.PREFS, JSON.stringify(normalizePrefs(prefs)), '音效/震动偏好');
    },

    /**
     * 翻转一个偏好并立刻落盘（供 UI 的开关按钮用）。返回翻转后的布尔值。
     * 未知的偏好键一律返回 null 且不写盘（避免脏键被写进存档）。
     */
    togglePref(prefs, key) {
      const current = normalizePrefs(prefs);
      if (!(key in current)) return null;
      current[key] = !current[key];
      this.writePrefs(current);
      if (prefs && typeof prefs === 'object') prefs[key] = current[key];
      return current[key];
    }
  };
}
