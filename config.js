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

/**
 * 粒子的爆发种类（AGENTS.md 2.2 / 2.3，v1.27 / Step 17）。
 * 由 render.js 侧的贴图选形状、由 particles.js 决定颗数与方向分布；**不参与任何游戏规则**。
 */
export const PARTICLE_KIND = Object.freeze({
  CLEAR: 'clear',       // 普通消除：小爆（全向、略带上抛）
  STRIPED: 'striped',   // 条纹糖果：沿爆破方向拉长
  WRAPPED: 'wrapped',   // 包装糖果：环形炸开
  MAGIC: 'magic',       // 魔力鸟：全色相大爆
  COMBO: 'combo'        // 组合（同批 ≥ 2 颗特殊糖果）：最大的一爆
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
    // v1.25（Step 20）：`stepBonus` 已**删除** —— 剩余步数的转化口径从「每步固定 30 分」
    // 改为「递增制奖励分 + 转成特殊糖果并连锁引爆」，数值登记在 SETTLEMENT_CONFIG。
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
    // ms；Step 20（v1.25）：结算阶段「转化定格」的**停留时长** —— 让玩家看清余步变成了哪些特效。
    // 注意：这一帧**不画任何叠加层**（横幅会盖住它本该展示的那批特效，也会让像素巡检误判），提示走日志。
    settleHold: 900,
    shuffleMaxTries: 50,     // AGENTS.md 3.8
    reducedMotion: false     // 对应 prefers-reduced-motion，见 REFERENCES.md §2.1 Step 5
  },

  // 粒子动画（Step 17，AGENTS.md 2.2 / 2.3 / 15，v1.27）。**纯观感**：不参与任何规则与计分。
  // 数值口径：
  //   · capacity = 池上限（颗）；maxPerFrame = 每帧贴图上限 —— 宪法 15 节「单帧绘制调用 ≤ 200」，
  //     棋盘/障碍/环/HUD 实测约占 90–140 次，留给粒子的份额就是这一项。
  //   · 每格颗数按事件种类递增（普通 3 → 组合 14）；单次事件再受 maxPerBurst 封顶。
  //   · 抖动只由「种子」派生（particles.js 的 mulberry32），**不使用运行时随机**：同输入同粒子。
  PARTICLE_CONFIG: {
    enabled: true,        // 总开关（关掉即完全不生成，用于降级/排查）
    capacity: 192,        // 池上限（颗）；超出时丢弃最旧的一颗
    maxPerFrame: 96,      // 每帧最多贴图颗数（15 节绘制调用预算里留给粒子的份额）
    maxPerBurst: 48,      // 单次事件最多生成颗数
    clearCount: 3,        // 普通消除：每格颗数
    stripedCount: 8,      // 条纹糖果：每格颗数（沿 direction 拉长）
    wrappedCount: 10,     // 包装糖果：每格颗数（环形）
    magicCount: 12,       // 魔力鸟：每格颗数（全色相）
    comboCount: 14,       // 组合（同批 ≥ 2 颗特殊糖果）：每格颗数
    lifeMs: 420,          // 基础存活时长（ms）
    lifeJitter: 0.35,     // 存活抖动比例（±）
    speed: 0.0042,        // 初速（格 / ms）—— 1 格约需 240ms，与 clearDuration 同量级
    speedJitter: 0.4,     // 初速抖动比例（±）
    gravity: 0.0000075,   // 重力加速度（格 / ms²）
    friction: 0.9985,     // 每毫秒的速度衰减（按 dt 取幂）
    size: 0.13,           // 基础直径（格）
    sizeJitter: 0.3,      // 尺寸抖动比例（±）
    specialSizeBoost: 1.15, // 特效类（条纹/包装/魔力鸟/组合）的尺寸放大倍率 —— 与「颗数递增」一起表达强度
    spread: 0.9,          // 方向锥角比例（1 = 整圆；普通消除取 0.9 略带上抛）
    seed: 20260925        // 确定性随机种子基数（与关卡 id / 级联层 / cell.id 混合）
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

  // 三星阈值（AGENTS.md 3.7 / 3.6，v1.19；v1.25 起带结算修正）。
  // 二星/三星 = 1★ 基准分 × 倍率 + 结算期望分 × settlementCoverage，取整到 500。
  // podFactor 只作用于金豆荚关（v1.18：「与水果关的区别只在掉落节奏与三星阈值更高」）。
  // settlementCoverage（Step 20）是**统一动态调整**的唯一比例旋钮：50 关共用同一公式，
  // 阈值随各关自己的步数预算与基准分派生，不再逐关手写。
  STAR_CONFIG: {
    secondFactor: 1.7,
    thirdFactor: 2.5,
    podFactor: 1.2,
    settlementCoverage: 0.6
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

  // 结算阶段（Step 20，用户批准的方案；AGENTS.md 3.6 第 7 条 / 3.5 的口径）。
  // 过关（或时间归零、步数用尽）时：**剩余步数 → 递增制奖励分 + 把普通动物转成随机特殊糖果
  // → 从棋盘底部到顶部依次连锁引爆 → 计入最终分数与星级**。
  //
  // 为什么奖励分是**比例**而不是绝对值（用户方案给的是 5000/6000/…/10000 的绝对值）：
  // 本项目的分数体量是「1★ = 5000–40000」，一步白送 5000–10000 会让 50 关的星级经济被结算阶段
  // 冲垮（第 1 关会一步白送 17 万分）。故保留**递增制的形状**、把量级登记为**该关 1★ 基准分的比例**，
  // 这样 50 关的「省步收益 / 星级基准」比值完全一致（这才是「统一」）。要改回绝对值只需改本表。
  SETTLEMENT_CONFIG: {
    seed: 20260922,           // 受控伪随机的固定种子（`mulberry32(seed + 关卡id)`），无运行时随机
    // 第 1–6 步的递增比例（递增制形状同用户方案：前 6 步逐级升、第 7 步起取末值）。
    // 量纲标定：**满余步（步数预算 − 1）的奖励分合计 ≤ 1.0 × 1★ 基准分** —— 这个上限很关键，
    // 否则结算阶段会单方面把每一关都推成三星（2★/3★ 的倍率只有 1.7 / 2.5）。
    // 步数预算在 20–34 之间浮动，故末值取 0.030：最坏情况（34 步）合计 ≈ 0.93× 基准分。
    stepScoreRatios: [0.012, 0.016, 0.020, 0.024, 0.027, 0.030],
    // 每颗转化出的特殊糖果的类型权重（百分比，和为 100）：横/竖直线特效、爆炸、魔力鸟
    specialWeights: { stripedH: 50, stripedV: 30, wrapped: 15, magic: 5 },
    // 星级阈值修正用的「典型余步比例」（设计期代理，替代运行时历史中位数）。
    // **实测标定**（`_build/measure-step20.mjs`，50 关 × 2 种玩家模型 × 3 种子）：
    // 通关局的余步中位数 5–6 步，约为步数预算的 19–22%，故取 0.20。
    typicalRemainingRatio: 0.20,
    maxChainDetonations: 64,  // 连锁引爆的步数上限（每步引爆一颗特殊糖果；= 棋盘格数，终止保证）
    // **动画预算**（v1.25）：结算批次的**逻辑与计分完全不变**，但逐层播放最多这么多层，之后直接跳到最终盘面。
    // 为什么必须有它：一次 29 余步的通关实测会产生 **259 个动画阶段 ≈ 48.6 秒**（见 PROGRESS 的 Step 20 记录）——
    // 那种演出既没人愿意看，也会让浏览器巡检的等待预算全部超时。8 层 ≈ 8 × (250 + ~200 + 120) ≈ 4.6 秒，
    // 加上「转化定格」与玩家自己那一手，总时长仍在 6 秒量级。
    maxAnimationLevels: 8
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
  // v1 → v2（v1.26 / Step 20.4）：`levels` 的值由数字改为 `{ stars, rainbow }`，为彩星预留字段；
  // 迁移是**就地**的（v0/v1 读进来逐关补 `rainbow: false` 并写回），老存档一分不丢。
  STORAGE_CONFIG: {
    schemaVersion: 2
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

  // 藤蔓地图的几何与确定性参数（Step 19.2 v2，AGENTS.md 2.3 / 5.1；口径见 DECISIONS D040）。
  // 地图是**画布外**的 SVG 层：它不参与 `computeBoardSize`，也不改变既有像素取证。
  // **坐标一律归一化（0–1）**：路径锚点与节点坐标都存 0–1，渲染时乘 viewBox 宽高（再由 SVG 缩放到容器）。
  // 路径 = 单条平滑贝塞尔曲线（锚点 + 固定种子 PRNG），**节点坐标不参与路径计算**（用户方案带来的取舍）。
  VINE_MAP_CONFIG: {
    seed: 20260922, // 固定种子（用户方案里的 VINE_SEED）：抖动只由 mulberry32(seed + page) 决定
    pageSize: 10,   // 每页关卡数（5 页 × 10 关 = 50 关）
    width: 360,     // 地图 viewBox 宽（归一化 x 的换算基准）
    height: 640,    // 地图 viewBox 高（归一化 y 的换算基准）
    // 路径锚点（归一化 0–1；出口 y 故意略超 1，与下一页入口 y（< 1）衔接成「延伸出屏」的接口）
    anchors: [
      { x: 0.85, y: 0.05 },
      { x: 0.15, y: 0.25 },
      { x: 0.8, y: 0.45 },
      { x: 0.2, y: 0.65 },
      { x: 0.75, y: 0.85 },
      { x: 0.3, y: 1.05 }
    ],
    nodeColumns: [0.2, 0.48, 0.76], // 节点 X 列（归一化，≥3 列用于打破「两列对齐」）
    nodeRows: 5,       // 每页节点行数（每行 2 个 → 每页 10 关）
    nodeMarginY: 0.08, // 节点区的上下边距（归一化；首行 y = 0.08、末行 y = 0.92）
    nodeStaggerY: 0.015, // Y 的错落幅度（归一化）：行内两个节点一高一低，形成节奏
    pathJitter: 26,    // 控制点抖动量（px；控制点 = 弦中点分解 + 该量级的种子抖动）
    nodeRadius: 16,    // 节点半径（px）
    starSize: 11,      // 星星基准尺寸（px；= 19.2 第一版 `★` 字形的 11px）
    starScale: 1.4,    // 星星放大倍率（用户方案：比原来大 40%）
    starGap: 4,        // 星星间距（px）
    leafSpacing: 70,   // 叶子沿路径的采样间距（px，用户方案 60–80）
    leafSize: 7,       // 叶片长度（px）
    pulseMs: 2000,     // 呼吸光效周期（ms，用户方案 2s 循环）
    leafSwayMs: 3600,  // 叶片摇曳周期（ms；prefers-reduced-motion 时关闭）
    pageSlideMs: 320   // 翻页位移时长（ms；transform: translateX + transition）
  },

  LEVEL_DEFAULTS: {
    steps: 30,
    starThresholds: [7000, 12000, 18000]
  }
};
