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
  MIXED: 'mixed'
});

/** localStorage 键名（读写只允许发生在 app.js，见 AGENTS.md 2.3 / ROADMAP Step 4） */
export const STORAGE_KEYS = Object.freeze({
  BEST_SCORE: 'xxl_best_score',
  LEVEL_STARS: 'xxl_level_stars', // 每关星级存档（Step 12.2 的选关界面用）
  MUTED: 'xxl_muted',
  BOOSTERS: 'xxl_boosters'
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

  LEVEL_DEFAULTS: {
    steps: 30,
    starThresholds: [7000, 12000, 18000]
  }
};
