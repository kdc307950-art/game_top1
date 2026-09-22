// config.js — 全局配置
// 唯一允许存放可调数值的文件。见 AGENTS.md 2.3 / 0.7 / 6 节与附录 B。
//
// 维护规则（AGENTS.md 附录 B 末段）：
//   新增或修改配置项时，必须同步更新 AGENTS.md 附录 B 与本文件。
//   数值键登记于附录 B，字符串常量登记于附录 B-2（见 DECISIONS.md D006 / D011）。

/** 元素类型（AGENTS.md 4.1 cell.type；6 节要求字符串常量集中于此） */
export const CELL_TYPE = Object.freeze({
  NORMAL: 'normal',
  STRIPED: 'striped',
  WRAPPED: 'wrapped',
  MAGIC: 'magic'
});

/** 障碍物类型（AGENTS.md 4.1 cell.obstacle） */
export const OBSTACLE_TYPE = Object.freeze({
  ICE: 'ice',
  SNOW: 'snow',
  VINE: 'vine',
  CHOC: 'choc'
});

/** 可掉落的收集物类型（AGENTS.md 4.1 cell.collectible / 3.6 水果关与金豆荚关，v1.18） */
export const COLLECTIBLE_TYPE = Object.freeze({
  FRUIT: 'fruit',
  POD: 'pod'
});

/** 道具类型（AGENTS.md 3.9 / 4.2，v1.20） */
export const BOOSTER_KIND = Object.freeze({
  REFRESH: 'refresh',
  ADD_STEPS: 'addSteps',
  HAMMER: 'hammer'
});

/** 条纹方向（AGENTS.md 4.1 cell.direction） */
export const DIRECTION = Object.freeze({
  H: 'h',
  V: 'v'
});

/** 匹配形状（AGENTS.md 4.2 match.detectMatchShape） */
export const MATCH_SHAPE = Object.freeze({
  LINE3: 'line3',
  LINE4: 'line4',
  LINE5: 'line5',
  L: 'L',
  T: 'T'
});

/** 关卡目标类型（AGENTS.md 4.4 GoalSpec） */
export const GOAL_TYPE = Object.freeze({
  SCORE: 'score',
  COLLECT: 'collect',
  CLEAR_ICE: 'clearIce',
  MIXED: 'mixed',
  FRUIT: 'fruit', // v1.18：水果关（收集 N 个水果）
  POD: 'pod'      // v1.18：金豆荚关（收集 N 个金豆荚）
});

/** localStorage 键名（读写只允许发生在 app.js，见 AGENTS.md 2.3 / ROADMAP Step 4） */
export const STORAGE_KEYS = Object.freeze({
  BEST_SCORE: 'xxl_best_score',
  LEVEL_STARS: 'xxl_level_stars', // 每关星级存档（Step 12.2 的选关界面用）
  MUTED: 'xxl_muted',
  BOOSTERS: 'xxl_boosters',
  PREFS: 'xxl_prefs' // Step 16（v1.22）：音效/震动偏好 `{ sound, haptic }`
});

export const CONFIG = {
  BOARD_SIZE: 8,
  COLOR_COUNT: 6,

  // 颜色索引（0-5）到动物名的映射。AGENTS.md 第 14 节 collect 目标用动物名作键
  // （例如 targets: { frog: 10, hippo: 25 }），level.js 必须靠此表把名字解析为 color 索引。
  // 顺序即 color 索引，改顺序等于改关卡语义，属项目约定值。
  COLOR_NAMES: ['frog', 'hippo', 'ladybug', 'octopus', 'chick', 'fox'],

  SCORE_CONFIG: {
    basePerCell: 10,
    icePerLayer: 1000,
    snowPerLayer: 1000,
    chocPerLayer: 1000,   // v1.17（用户批准）：巧克力每块 1000 分，与冰块/雪块同档（附录 B）
    gemScore: 1500,
    cascadeStep: 30,
    cascadeIceStep: 1000,
    stepBonus: 30,
    specialMultipliers: {
      striped: 1.5,
      wrapped: 2.0,
      magic: 2.5,
      stripedStriped: 3.0,
      stripedWrapped: 3.5,
      wrappedWrapped: 4.0,
      magicMagic: 5.0
    }
  },

  ANIMATION_CONFIG: {
    swipeThreshold: 25,      // px；AGENTS.md 5.3 允许区间 20-30
    clearDuration: 250,      // ms；AGENTS.md 15 允许区间 200-300
    fallDuration: 200,       // ms；AGENTS.md 15 允许区间 150-250，按距离缩放
    cascadeGap: 120,         // ms；AGENTS.md 15 允许区间 100-150
    shuffleMaxTries: 50,     // AGENTS.md 3.8
    reducedMotion: false     // 对应 prefers-reduced-motion，见 REFERENCES.md §2.1 Step 5
  },

  // 障碍物层数上限（AGENTS.md 3.4 / 附录 A）
  OBSTACLE_CONFIG: {
    ice: { maxLayers: 3 },
    snow: { maxLayers: 5 },
    vine: { maxLayers: 1 },
    choc: { maxLayers: 1 }
  },

  // 可掉落的收集物（AGENTS.md 3.6 / 4.1，v1.18）。
  // 水果「整列直落」= 单次下落格数不小于列高；金豆荚是分阶段节奏，每次消除只下落 1 格。
  COLLECTIBLE_CONFIG: {
    fruitFallPerStep: 99,
    podFallPerStep: 1,
    exitRow: 7
  },

  // 时间关的时长派生（AGENTS.md 3.6 第 8 条，v1.19）。
  // v1.18 要求「初始秒数与下限必须走 config.js」；这里给的是**完整的派生公式系数**：
  //   秒数 = clamp(round(initialSeconds + 目标工作量 × secondsPerWorkload − 障碍摩擦 × secondsPerFriction), min, max)
  // 目标工作量与障碍摩擦的定义与 STEP_BUDGET 完全一致（同一套单位键），保证两种关卡的难度观感一致。
  TIME_CONFIG: {
    initialSeconds: 60,     // 基准秒数
    secondsPerWorkload: 12, // 每个「目标工作量单位」折算的秒数
    secondsPerFriction: 3,  // 每点障碍摩擦扣减的秒数
    minSeconds: 45,         // 秒数下限
    maxSeconds: 120         // 秒数上限
  },

  // 三星阈值（AGENTS.md 3.7 / 3.6，v1.19）：二星/三星 = 1★ 基准分 × 倍率，取整到 500。
  // podFactor 只作用于金豆荚关（v1.18：「与水果关的区别只在掉落节奏与三星阈值更高」）。
  STAR_CONFIG: {
    secondFactor: 1.7,
    thirdFactor: 2.5,
    podFactor: 1.2
  },

  // 步数由难度派生（Step 12.2，用户批准）：「难度分 → 步数」公式的系数（附录 B 逐键登记）。
  // 设计意图：目标越大给越多步（workload），障碍越多/越厚/色数越多给越少步（friction），
  // 结果夹在 [min, max] 内。关卡表因此不再手写步数。
  STEP_BUDGET: {
    base: 24,        // 基准步数
    workload: 1.6,   // 每个「目标工作量单位」折算的步数
    perCell: 0.25,   // 每个障碍格的扣减
    perLayer: 0.2,   // 每层障碍的扣减
    perColor: 2,     // 超过 5 色后每多一色的扣减
    min: 20,         // 步数下限
    max: 34,         // 步数上限
    scoreUnit: 2000, // 分数目标：每多少分算 1 个工作量单位
    collectUnit: 4,  // 收集目标：每多少只算 1 个工作量单位
    iceUnit: 4       // 消冰目标：每多少层算 1 个工作量单位
  },

  // 本局结束时的「引爆特殊方块」上限（Step 12.3）：引爆会生成新的特殊方块，
  // 理论上可以「引爆 → 生成 → 再引爆」循环，故给一个确定的轮数上限作为终止保证。
  ENDGAME_CONFIG: {
    maxDetonationRounds: 8
  },

  // 道具系统（AGENTS.md 3.9，v1.20）。**数量**是跨关卡的账号级状态，持久化在 STORAGE_KEYS.BOOSTERS；
  // 本表只登记「初始数量」与三件道具的效果参数，逻辑层不出现魔法数字。
  BOOSTER_CONFIG: {
    initialCount: 3,   // 每种道具的初始数量（用光后不可使用，本步不含获取途径）
    extraSteps: 5,     // 「加五步」在步数关增加的步数
    extraSeconds: 10,  // 「加五步」在时间关增加的秒数（时间关没有步数，见 3.6 第 8 条）
    hammerCells: 1     // 小木锤一次消除的格数（3.9）
  },

  // 本地存档的格式版本（AGENTS.md 2.3 / v1.21，`storage.js` 的读写都带它）。
  // 加这个键的理由（用户方案 §1.3）：用户清缓存 / 换后端 / 未来改星级规则时，靠版本号做迁移，
  // 而不是靠猜字段形状。读到**更高**版本时只读不写，绝不把新版数据降级覆盖。
  STORAGE_CONFIG: {
    schemaVersion: 1
  },

  // 音效（Step 16，AGENTS.md 5.6）：**Web Audio 合成**，不引入任何音频素材（延续 D009 的零素材策略）。
  // 每个事件是一段「可派生」的音：波形、起止频率、时长、增益、升调倍率全部登记在这里；
  // 连击层数 / 第几颗星只通过 `stepRatio^index` 改音高（同输入同输出，无运行时随机）。
  AUDIO_CONFIG: {
    masterGain: 0.16, // 总音量（0-1）；单个音效的增益再乘它
    events: {
      swapOk: { wave: 'triangle', from: 520, to: 780, duration: 0.09, gain: 1, stepRatio: 1 },
      swapBad: { wave: 'sine', from: 190, to: 120, duration: 0.14, gain: 0.9, stepRatio: 1 },
      clear: { wave: 'square', from: 420, to: 420, duration: 0.07, gain: 0.75, stepRatio: 1.122 }, // 连击升调（约一个半音）
      won: { wave: 'triangle', from: 523, to: 784, duration: 0.18, gain: 1, stepRatio: 1 },
      lose: { wave: 'sine', from: 330, to: 165, duration: 0.22, gain: 0.9, stepRatio: 1 },
      star: { wave: 'triangle', from: 660, to: 990, duration: 0.12, gain: 1, stepRatio: 1.26 } // 逐颗星升调
    }
  },

  // 震动反馈（Step 16，AGENTS.md 5.6）：`navigator.vibrate` 的毫秒模式。
  // 桌面浏览器没有该 API → 静默降级（不报错、不影响对局）；未登记的事件不震。
  HAPTIC_CONFIG: {
    events: {
      swapOk: [12],
      clear: [8],
      won: [30, 40, 30],
      lose: [60]
    }
  },

  LEVEL_DEFAULTS: {
    steps: 30,
    starThresholds: [7000, 12000, 18000]
  }
};
