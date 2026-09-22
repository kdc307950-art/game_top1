// app.js — 应用编排：视图状态、动画调度、调用游戏逻辑。见 AGENTS.md 2.2 / 2.3 / 5.4 / 15 节。
// 本地存档的唯一读写点是 storage.js（v1.16 起）。
//
// 【Step 5 · ROADMAP】本文件按宪法 2.2/2.3 拆出四个 UI 模块，只保留编排职责：
//   - `render.js`（棋盘层绘制与几何）、`hud.js`（HUD 与结束面板）、
//     `input.js`（手势与视口守卫）、`timeline.js`（动画时间线调度与 rAF 回放）；
//   - 动画时长全部取自 `CONFIG.ANIMATION_CONFIG`（15 节），并让系统「减少动效」偏好一并生效（5.4）；
//   - 5.4：逻辑先全部算完（game.trySwap 同步结算），再按时间线播放快照 —— 动画不阻塞逻辑更新；
//   - 逻辑模块（config/game/board/match/score/level 等）本步未改动。

import { BOOSTER_KIND, CELL_TYPE, CONFIG, STORAGE_KEYS } from './config.js';
import { cloneBoard } from './board.js'; // v1.20：道具的回放首帧快照（与 trySwap 的 afterSwap 同语义）
import { createAudio, createHaptics } from './audio.js'; // Step 16（5.6）：音效与震动
import {
  createGame,
  getState as getGameState,
  tickTime as gameTickTime,
  trySwap as gameTrySwap,
  useBooster as gameUseBooster
} from './game.js';
import { bindInput, bindViewportGuards, prefersReducedMotion } from './input.js';
import { boardRect, cellAt, computeBoardSize, createRenderer, hitTest } from './render.js';
import { describeGoal, hudScoreAt } from './hud.js'; // v1.16：目标文案与回放分数插值属信息层
import { DEMO_LEVEL_IDS, LEVEL_COUNT, getLevelConfig, isTimeLevel } from './level.js';
import { createStorage } from './storage.js';
import { buildPhases, createTimeline, motionDurations } from './timeline.js';

const LOG_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
// v1.16：所有 localStorage 读写都经过 storage.js（唯一允许碰存档的模块），日志用本文件的 log
const storage = createStorage((level, message) => log(level, message));
const MIN_LOG_RANK = LOG_RANK.info;
const MAX_DPR = 3; // 后备缓冲上限（与 render.js 的绘制预算一致）
const CLOCK_INTERVAL_MS = 250; // 时间关倒计时的刷新间隔（3.6 第 8 条：时间只按真实时间流逝）

const renderer = createRenderer();
const timeline = createTimeline({
  onFrame: (phase, progress) => {
    view.hudScore = view.playback ? hudScoreAt(view.playback, phase.levelIndex) : view.game.level.currentScore; // 连消收益逐层显示
    // Step 16（5.6）：每层消除配一声「连击升调」的音（+ 一次轻震）；同一层不重复响
    if (phase.phase === 'clear' && phase.levelIndex !== view.lastClearLevel) {
      view.lastClearLevel = phase.levelIndex;
      feedback('clear', phase.levelIndex);
    }
    drawFrame(phase, progress);
  },
  onDone: finishTimeline
});

// 视图状态（唯一可变副作用集中处）
const view = {
  canvas: null,
  ctx: null,
  game: null, // game.js 的 GameState
  best: 0, // 最高分（localStorage，属 UI 侧状态）
  newRecord: false,
  stars: 0, // 3.7：本局通关星级（结束面板用；失败时为 0）
  levelId: demoLevelRequested(), // 当前关卡 id（Step 12.2 的选关与「下一关」流转；`?demo=` 进演示关）
  screen: 'playing', // 'playing' | 'select'：选关界面与对局界面
  levelStars: {}, // 每关最佳星级（localStorage 存档，键为关卡 id）
  levelRects: [], // 选关界面的每格命中矩形（由 render.js 返回）
  nextRect: null, // 结束面板的「下一关」
  selectRect: null, // 结束面板的「选关」
  sizePx: 0,
  dpr: 1,
  layout: null, // render.js 的 boardRect(sizePx) 结果（prepare 时复用）
  selected: null, // 点击两次交换的后备方案中已选中的格子
  firstGroups: [], // 本次交换第 1 层识别出的匹配（仅用于高亮）
  endReason: 'steps', // 结束原因：'steps'（步数用尽）/ 'stuck'（死局重排超限，3.8 约束 4）
  playback: null, // 本轮回放的数据（逐层分数、是否待结束）；timeline.running 决定是否锁输入
  hudScore: null, // 播放期间按层累加的分数；null 表示直接读 GameState
  restartRect: null,
  systemReducedMotion: false,
  frameRequest: 0,
  // Step 14.2（v1.19）：时间关的倒计时。clockTimer 是 setInterval 句柄；timeDebt 是「已过去但还没结算」的秒数
  // （回放动画期间只记账不结算，保证逻辑串行，见 5.4「动画不阻塞逻辑」）。
  clockTimer: 0,
  clockLast: 0,
  timeDebt: 0,
  // Step 15（v1.20 / 3.9）：道具数量（storage.js 持久化）与「小木锤已就绪」的待选格状态
  boosters: null,
  hammerArmed: false,
  // Step 16（v1.22 / 5.6）：音效与震动偏好（storage.js 持久化）+ 两个反馈器 + 连击配音去重
  prefs: null,
  audio: null,
  haptics: null,
  lastClearLevel: -1
};

init();

/** 启动：读最高分 → 建局 → 布局首绘 → 绑定输入与视口守卫。 */
function init() {
  const canvas = document.getElementById('board');
  if (!canvas) {
    log('error', '未找到 #board 元素，渲染中止');
    return;
  }
  const ctx = canvas.getContext('2d');
  if (!ctx) {
    log('error', '无法获取 2D 上下文，渲染中止');
    return;
  }

  view.canvas = canvas;
  view.ctx = ctx;
  view.best = storage.readBestScore();
  view.levelStars = storage.readLevelStars(); // Step 12.2：载入每关星级（选关界面用）
  view.boosters = storage.readBoosters(); // Step 15（3.9）：载入道具数量
  view.prefs = storage.readPrefs(); // Step 16（5.6）：载入音效/震动偏好
  view.audio = createAudio({ logger: log, isEnabled: () => view.prefs.sound });
  view.haptics = createHaptics({ isEnabled: () => view.prefs.haptic });
  view.systemReducedMotion = prefersReducedMotion();
  startNewGame();
  applyLayout();
  bindBoosters(); // Step 15：道具条（画布外的 DOM 元素）
  bindPrefs(); // Step 16：音效/震动开关

  bindInput({
    target: canvas,
    // 结束面板本身需要接收点按以重开；交换入口会单独拒绝 gameOver 状态。
    isLocked: () => timeline.running,
    onSwipe,
    onTap
  });
  bindViewportGuards();

  window.addEventListener('resize', scheduleLayout, { passive: true });
  window.addEventListener('orientationchange', scheduleLayout, { passive: true });
  if (window.visualViewport) {
    window.visualViewport.addEventListener('resize', scheduleLayout, { passive: true });
  }

  const cfg = CONFIG.ANIMATION_CONFIG;
  log(
    'info',
    `动效设置：系统减少动效=${view.systemReducedMotion}，配置 reducedMotion=${cfg.reducedMotion}，` +
      `消除 ${cfg.clearDuration}ms / 下落 ${cfg.fallDuration}ms / 级联间隔 ${cfg.cascadeGap}ms`
  );
}

/**
 * Step 13/14：URL 的 `?demo=` 决定进哪个演示关（都不在 50 关表内）：
 *   `?demo=1` / `#demo`  → id 0（藤蔓与巧克力，v1.17）
 *   `?demo=fruit|time|pod` → id 51/52/53（水果关 / 时间关 / 金豆荚关，v1.19）
 * 没有演示参数时返回第 1 关。
 */
function demoLevelRequested() {
  if (typeof window === 'undefined') return 1;
  const match = /(^|[?&])demo=([^&]*)/.exec(window.location.search);
  const raw = match ? match[2] : window.location.hash === '#demo' ? '1' : '';
  if (!raw) return 1;
  if (raw === '1' || raw === 'obstacles') return DEMO_LEVEL_IDS.obstacles;
  if (raw === 'fruit' || raw === 'time' || raw === 'pod') return DEMO_LEVEL_IDS[raw];
  return 1;
}

/** 开新一局：重建 GameState 并复位视图侧状态。 */
function startNewGame() {
  timeline.stop(); // 防御性：正常路径下不会在回放中重开
  view.game = createGame(getLevelConfig(view.levelId));
  view.screen = 'playing';
  view.newRecord = false;
  view.stars = 0;
  view.selected = null;
  view.firstGroups = [];
  view.playback = null;
  view.hudScore = null;
  view.restartRect = null;
  view.hammerArmed = false; // 3.9：重开一局时退出「小木锤待选格」
  view.lastClearLevel = -1;

  const snapshot = getGameState(view.game);
  const timing = snapshot.timeLimit ? `倒计时 ${snapshot.timeLimit} 秒` : `步数 ${snapshot.remainingSteps}`;
  log('info', `新一局开始：第 ${snapshot.levelId} 关 ${snapshot.rows}×${snapshot.cols}，${timing}，最高分 ${view.best}`);
  startClock(); // 3.6 第 8 条：时间关由真实时间驱动倒计时；其它关卡不启动
  updateBoosterBar();
  if (view.sizePx > 0) drawFrame();
}

// 4.4 的 LevelConfig 由 level.js 提供（2.3：关卡配置属 level.js 的职责；
// Step 11 加障碍物后 app.js 越过第 6 节的 300 行，配置表因此回到 level.js）。

/** 应用尺寸（5.2：后备缓冲按 DPR 适配，棋盘保持正方形）。 */
function applyLayout() {
  const size = computeBoardSize();
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);
  const backing = Math.round(size * dpr);

  view.sizePx = size;
  view.dpr = dpr;
  view.layout = boardRect(size);
  view.canvas.style.width = `${size}px`;
  view.canvas.style.height = `${size}px`;
  // 先改后备缓冲尺寸（该赋值会重置变换并清空画布），再设变换、再重建离屏缓存与绘制
  if (view.canvas.width !== backing) view.canvas.width = backing;
  if (view.canvas.height !== backing) view.canvas.height = backing;
  view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.prepare(size, dpr, view.layout); // 静态图层 + 糖果精灵图集
  drawFrame();
}

/** 合并同一帧内的多次视口变化（旋转屏幕会连续触发 resize）。 */
function scheduleLayout() {
  if (view.frameRequest !== 0) return;
  view.frameRequest = window.requestAnimationFrame(() => {
    view.frameRequest = 0;
    applyLayout();
  });
}

// ---------------------------------------------------------------------------
// 时间关的倒计时（Step 14.2，v1.19；AGENTS.md 3.6 第 8 条）
//
// 规则侧只提供 `game.tickTime(state, seconds)`：**消除不扣时间**，时间只按真实经过的秒数流逝。
// 这里负责把「真实时间」量出来并串行地交给逻辑层：回放动画期间只记账（timeDebt），
// 动画结束后再一次性结算 —— 这样不会在动画中途改动棋盘（5.4）。
// ---------------------------------------------------------------------------

function startClock() {
  stopClock();
  if (!isTimeLevel(view.game.level)) return;
  view.clockLast = nowMs();
  view.timeDebt = 0;
  view.clockTimer = window.setInterval(tickClock, CLOCK_INTERVAL_MS);
}

function stopClock() {
  if (view.clockTimer) window.clearInterval(view.clockTimer);
  view.clockTimer = 0;
}

function tickClock() {
  if (!view.game || view.game.gameOver) {
    stopClock();
    return;
  }
  const now = nowMs();
  const elapsed = Math.max(0, (now - view.clockLast) / 1000);
  view.clockLast = now;
  view.timeDebt += elapsed;
  if (timeline.running) return; // 回放中：只记账，等 finishTimeline 再结算
  applyTimeDebt();
}

/** 把记账的真实秒数交给逻辑层；归零时逻辑层会先引爆盘面，这里负责把它播完再进结束面板。 */
function applyTimeDebt() {
  const debt = view.timeDebt;
  if (debt <= 0) return;
  view.timeDebt = 0;

  const result = gameTickTime(view.game, debt);
  if (!result.resolve) {
    view.hudScore = null;
    drawFrame();
    return;
  }

  stopClock();
  view.endReason = result.won ? 'won' : 'time';
  log(
    'info',
    `倒计时归零（3.6 v1.18）：先引爆盘面上的特殊方块并结算，本局 ${view.game.level.currentScore} 分` +
      (result.won ? '（引爆达成目标，算通关）' : '（目标未达成，失败）')
  );
  startTimeline(
    { resolve: result.resolve, gameOver: true },
    view.game.level.currentScore - result.resolve.scoreDelta
  );
}

function nowMs() {
  return typeof performance !== 'undefined' && typeof performance.now === 'function' ? performance.now() : Date.now();
}

// ---------------------------------------------------------------------------
// 交互（手势由 input.js 识别，这里只做「手势 → 棋盘格 → 游戏动作」）
// ---------------------------------------------------------------------------

function onSwipe({ x0, y0, step }) {
  view.audio?.unlock(); // 5.6：浏览器要求音频上下文在用户手势里创建/恢复
  const from = cellAt(view.canvas, x0, y0, view.sizePx);
  if (!from) return;
  attemptSwap(from, { r: from.r + step.r, c: from.c + step.c });
}

function onTap({ x1, y1 }) {
  view.audio?.unlock();
  if (view.game.gameOver) {
    if (view.screen === 'select') {
    const tile = view.levelRects.find((rect) => hitTest(view.canvas, x1, y1, rect));
    if (tile) {
      view.levelId = Math.min(Math.max(Math.round(tile.id), 1), LEVEL_COUNT);
      startNewGame();
    }
    return;
  }
  if (hitTest(view.canvas, x1, y1, view.nextRect)) {
    view.levelId = Math.min(view.levelId + 1, LEVEL_COUNT); // 通关后的「下一关」
    startNewGame();
    return;
  }
  if (hitTest(view.canvas, x1, y1, view.selectRect)) {
    view.screen = 'select'; // Step 12.2：只切视图状态，不重置当前对局
    drawFrame();
    return;
  }
  if (hitTest(view.canvas, x1, y1, view.restartRect)) startNewGame();
    else log('info', '本局已结束：点按「再来一局」开始新一局');
    return;
  }
  const cell = cellAt(view.canvas, x1, y1, view.sizePx);
  // 3.9（v1.20）：小木锤是两步式交互 —— 已就绪时这一下点在格子上而不是做选中/交换
  if (cell && view.hammerArmed) {
    tryHammer(cell);
    return;
  }
  if (cell) handleTap(cell);
}

/** 3.9：小木锤落点 —— 只接受含动物的格子；非法目标由逻辑层判 `badTarget`，数量不扣。 */
function tryHammer(cell) {
  const result = applyBooster(BOOSTER_KIND.HAMMER, { r: cell.r, c: cell.c });
  if (result && !result.used) {
    log('info', `小木锤：(${cell.r},${cell.c}) 不是可消除的动物格（空格/纯障碍/收集物），道具未消耗`);
  }
  armHammer(false);
}

/** 后备交互（5.3）：第一次点击选中，第二次点相邻格交换；点同格取消，点远处改选。 */
function handleTap(cell) {
  if (!isSelectable(cell)) {
    view.selected = null;
    drawFrame();
    return;
  }
  const selected = view.selected;
  if (!selected) {
    view.selected = cell;
    drawFrame();
    return;
  }
  if (selected.r === cell.r && selected.c === cell.c) {
    view.selected = null;
    drawFrame();
    return;
  }
  if (Math.abs(selected.r - cell.r) + Math.abs(selected.c - cell.c) === 1) {
    attemptSwap(selected, cell);
    return;
  }
  view.selected = cell;
  drawFrame();
}

function isSelectable(cell) {
  const item = view.game.board[cell.r]?.[cell.c];
  return Boolean(item) && item.color !== null && item.color !== undefined;
}

/**
 * 交换编排：交给 game.trySwap（4.3.1/4.3.2/4.3.3 都在逻辑层），本函数负责日志与时间线。
 * 5.4：逻辑在 trySwap 内同步算完，之后只播放快照 —— 动画不会阻塞逻辑更新。
 */
function attemptSwap(a, b) {
  const board = view.game.board;
  if (timeline.running || view.game.gameOver) return;
  if (!isInsideBoard(board, b.r, b.c)) {
    log('info', `滑动超出棋盘边界，忽略：(${a.r},${a.c}) → (${b.r},${b.c})`);
    return;
  }

  const scoreBefore = view.game.level.currentScore;
  const result = gameTrySwap(view.game, a, b);
  view.selected = null;

  if (!result.valid) {
    view.firstGroups = [];
    feedback('swapBad');
    log('info', `交换无效，已回退：(${a.r},${a.c}) ↔ (${b.r},${b.c})（不消耗${progressLabel()}，剩余 ${progressValue(result)})`);
    drawFrame();
    return;
  }
  feedback('swapOk'); // 5.6：有效交换的即时反馈

  const firstLevelGroups = result.resolve.levels[0]?.groups ?? [];
  view.firstGroups = firstLevelGroups.flatMap((group) => group.cells);
  if (result.resolve.capped) {
    log('warn', `级联达到层数上限（${result.cascades} 层）后强制结束，请检查随机源或色数设置`);
  }
  // Step 7/8 的日志摘要：本步触发了多少颗特殊元素（4.3.8），配合上面的形状列表即可核对 3.2 的生成
  const specialsTriggered = result.resolve.cleared.filter((cell) => cell.type !== CELL_TYPE.NORMAL).length;
  const shapes = firstLevelGroups.map((group) => group.shape).join(', ');
  const total = result.scoreDelta + scoreBefore;
  log(
    'info',
    `交换有效：(${a.r},${a.c}) ↔ (${b.r},${b.c})，识别到 ${firstLevelGroups.length} 组匹配[${shapes}]，` +
      `级联 ${result.cascades} 层，共消除 ${result.resolve.cleared.length} 格，新生成 ${result.resolve.spawned.length} 格，` +
      `触发特效 ${specialsTriggered}，本步 +${result.scoreDelta} 分（本局 ${total}），剩余${progressLabel()} ${progressValue(result)}` +
      (result.resolve.collected.length > 0 ? `，收集 ${result.resolve.collected.length} 个` : '')
  );

  // 3.8：死局与重排的结果（成功：提示 + 重排动画；失败：结束流程，不消耗步数）
  const deadlock = result.resolve.deadlock;
  view.endReason = view.game.level.completed ? 'won' : 'steps';
  if (view.game.level.completed) {
    // 3.6 / 3.7：通关优先于「步数用尽」——最后一步达成目标也算通关（此时剩余步数已被转化）
    view.endReason = 'won';
    log(
      'info',
      `关卡完成（3.6）：${describeGoal(view.game.level.goal)}，剩余 ${result.stepsLeft} 步按 3.5 转化为分数，` +
        `本局 ${view.game.level.currentScore} 分`
    );
  } else if (deadlock) {
    if (deadlock.shuffled) {
      log('info', `检测到无可消除组合，已重排棋盘（第 ${deadlock.tries} 次尝试成功，不消耗步数）`);
    } else {
      view.endReason = 'stuck';
      log('warn', `死局重排尝试 ${deadlock.tries} 次仍无可行组合，判定为关卡异常，进入游戏结束流程（3.8 约束 4）`);
    }
  }

  startTimeline(result, scoreBefore);
}

// ---------------------------------------------------------------------------
// 动画时间线（时长全部来自 ANIMATION_CONFIG，见 15 节）
// ---------------------------------------------------------------------------

/**
 * 起播一次结算回放：阶段列表与时长由 timeline.js 负责（时长取自 ANIMATION_CONFIG，见 15 节），
 * 本文件只提供数据（SwapResult 的快照与逐层明细）与每帧的场景组装。
 * 入参是 game.trySwap 的 SwapResult：层级数据在 `result.resolve.levels`，
 * 首帧快照在 `result.afterSwap`，是否进入结束面板在 `result.gameOver`。
 */
function startTimeline(result, scoreBefore) {
  const levelTotal = result.resolve.levelScores.reduce((sum, item) => sum + item.gained, 0);
  view.lastClearLevel = -1; // 5.6：新一轮回放重新给每层配音
  // tailBonus = 3.5 的剩余步数转化（关卡级一次性结算，不在逐层明细里）；不记下来 HUD 会先少一段再跳回去
  view.playback = {
    scoreBefore,
    levelScores: result.resolve.levelScores,
    pendingGameOver: result.gameOver,
    tailBonus: result.scoreDelta - levelTotal
  };
  const motion = motionDurations(view.systemReducedMotion);
  timeline.play(buildPhases(result.resolve, result.afterSwap, motion));
}

function finishTimeline() {
  const pendingGameOver = Boolean(view.playback?.pendingGameOver);
  view.playback = null;
  view.hudScore = null;
  view.firstGroups = [];
  drawFrame();
  if (pendingGameOver) finishGame();
}
// ---------------------------------------------------------------------------
// 道具条（Step 15，v1.20；AGENTS.md 3.9）
//
// 结构与样式在 index.html / styles.css（画布外的 DOM 元素），这里只做编排：
//   数量在 storage.js（唯一碰 localStorage 的模块）→ 逻辑层 `game.useBooster` → **生效才扣数量**。
// 道具本身不消耗步数、也不扣时间；小木锤是两步式（先点按钮，再点格子）。
// ---------------------------------------------------------------------------

function bindBoosters() {
  const bar = document.getElementById('boosters');
  if (!bar) {
    log('warn', '未找到 #boosters 道具条，道具不可用（不影响对局）');
    return;
  }
  for (const button of bar.querySelectorAll('.booster')) {
    button.addEventListener('click', () => handleBoosterClick(button.dataset.kind));
  }
  updateBoosterBar();
}

function handleBoosterClick(kind) {
  if (view.screen !== 'playing') return; // 选关界面不响应道具
  if (kind === BOOSTER_KIND.HAMMER) {
    armHammer(!view.hammerArmed);
    log('info', view.hammerArmed ? '小木锤已就绪：点一个格子即可消除它' : '小木锤已取消');
    return;
  }
  armHammer(false);
  applyBooster(kind);
}

function armHammer(armed) {
  view.hammerArmed = armed;
  updateBoosterBar();
  drawFrame();
}

/** 数量检查 → 逻辑层 → 生效才扣数量；任何一步不成立都**不扣数量**（3.9）。 */
function applyBooster(kind, target = null) {
  if (view.game.gameOver || timeline.running) {
    log('info', '道具未使用：本局已结束或动画播放中');
    return null;
  }
  if ((view.boosters?.[kind] ?? 0) <= 0) {
    log('info', `道具未使用：${boosterLabel(kind)} 数量为 0（用光后本步不提供获取途径）`);
    return null;
  }

  const scoreBefore = view.game.level.currentScore;
  // 回放的首帧要用「动作之前」的棋盘（与 trySwap 的 afterSwap 同一语义）：木锤要先看见被敲的那一格
  const beforeBoard = cloneBoard(view.game.board);
  const result = gameUseBooster(view.game, kind, target);
  if (!result.used) {
    log('info', `道具未生效（${result.reason}），不消耗数量：${boosterLabel(kind)}`);
    return result;
  }

  const spend = storage.spendBooster(view.boosters, kind); // v1.16：落盘只在 storage.js
  updateBoosterBar();
  log('info', `使用道具：${boosterLabel(kind)}，剩余 ${spend.left} 个，剩余${progressLabel()} ${progressValue(result)}`);

  if (result.resolve) {
    view.endReason = view.game.level.completed ? 'won' : view.endReason;
    // 木锤的结算同样要按 5.4 播完快照：afterSwap 传「敲之前」的棋盘快照
    startTimeline({ resolve: result.resolve, gameOver: result.gameOver, afterSwap: beforeBoard }, scoreBefore);
  } else {
    drawFrame(); // 加五步 / 刷新只有 HUD 与棋盘排列变化，没有分层回放
  }
  return result;
}

/** 道具条的数量与可用状态；只在状态变化时调用（不是每帧绘制）。 */
function updateBoosterBar() {
  const bar = document.getElementById('boosters');
  if (!bar) return;
  for (const button of bar.querySelectorAll('.booster')) {
    const kind = button.dataset.kind;
    const left = view.boosters?.[kind] ?? 0;
    const badge = button.querySelector('.booster-count');
    if (badge) badge.textContent = String(left);
    button.disabled = left <= 0 || Boolean(view.game && view.game.gameOver);
    button.setAttribute('aria-pressed', kind === BOOSTER_KIND.HAMMER && view.hammerArmed ? 'true' : 'false');
  }
}

function boosterLabel(kind) {
  if (kind === BOOSTER_KIND.REFRESH) return '刷新';
  if (kind === BOOSTER_KIND.ADD_STEPS) return '加五步';
  return '小木锤';
}

// ---------------------------------------------------------------------------
// 音效与震动（Step 16，v1.22；AGENTS.md 5.6）
//
// 规则侧只定义「什么事件该有反馈」，声音怎么合成在 `audio.js`（唯一创建 AudioContext 的模块），
// 开关与偏好落在 `storage.js`。这里只做三件事：绑开关、在事件点调 `feedback()`、首次手势解锁音频。
// ---------------------------------------------------------------------------

function bindPrefs() {
  const bar = document.getElementById('settings');
  if (!bar) return; // 没有开关也能玩（默认都开），不是致命错误
  for (const button of bar.querySelectorAll('.pref')) {
    button.addEventListener('click', () => {
      const key = button.dataset.pref;
      const next = storage.togglePref(view.prefs, key); // 落盘在 storage.js
      if (next === null) return;
      updatePrefBar();
      if (next) feedback(key === 'sound' ? 'swapOk' : 'swapOk', 0); // 打开时给一次即时反馈（关掉时不必响）
      log('info', `${key === 'sound' ? '音效' : '震动'}已${next ? '开启' : '关闭'}（偏好写入 ${STORAGE_KEYS.PREFS}）`);
    });
  }
  updatePrefBar();
}

function updatePrefBar() {
  const bar = document.getElementById('settings');
  if (!bar) return;
  for (const button of bar.querySelectorAll('.pref')) {
    const on = view.prefs?.[button.dataset.pref] !== false;
    button.setAttribute('aria-pressed', on ? 'true' : 'false');
  }
}

/** 5.6：一个事件点同时触发音效与震动；两者各自看偏好、各自可静默降级。 */
function feedback(event, index = 0) {
  view.audio?.play(event, index);
  view.haptics?.vibrate(event);
}

// ---------------------------------------------------------------------------
// 绘制：把状态整理成 render.js 需要的「场景描述」
// ---------------------------------------------------------------------------

function drawFrame(entry = null, progress = 1) {
  if (view.sizePx === 0) return;
  const scene = {
    sizePx: view.sizePx,
    board: entry ? entry.board : view.game.board,
    matched: entry && entry.phase === 'clear' && entry.levelIndex === 0 ? view.firstGroups : [],
    selected: entry ? null : view.selected,
    clearing: entry && entry.phase === 'clear' ? { keys: entry.keys, progress } : null,
    falling: entry && (entry.phase === 'fall' || entry.phase === 'shuffle') ? { moves: entry.moves, progress } : null,
    hidden: entry && entry.phase === 'fall' ? entry.hidden : null,
    banner: entry && entry.phase === 'shuffle' ? entry.banner : null, // 5.5：重排前给出明确提示
    // Step 12.2：选关界面（只画 HUD + 关卡网格，棋盘层跳过）
    select: view.screen === 'select' ? { count: LEVEL_COUNT, stars: view.levelStars } : null,
    hud: {
      score: view.hudScore ?? view.game.level.currentScore,
      steps: view.game.level.remainingSteps,
      best: view.best,
      // v1.14（5.5）：目标格要显示「当前值/目标值」。drawFrame 每帧都会跑，故直接读关卡状态，
      // 不调用 getState（那会每帧深拷贝并冻结整个棋盘）
      goal: view.game.level.goal,
      collected: view.game.level.collected,
      clearedIce: view.game.level.clearedIce,
      // v1.19（5.5）：时间关的第二格改为显示剩余时间；非时间关 timeLimit 为 null
      timeLimit: isTimeLevel(view.game.level) ? view.game.level.timeLimit : null,
      remainingTime: view.game.level.remainingTime ?? 0,
      collectedFruit: view.game.level.collectedFruit ?? 0,
      collectedPod: view.game.level.collectedPod ?? 0
    },
    overlay:
      view.game.gameOver && !timeline.running
        ? {
            score: view.game.level.currentScore,
            best: view.best,
            newRecord: view.newRecord,
            reason: view.endReason,
            stars: view.stars,
            hasNext: view.levelId < LEVEL_COUNT // 通关且不是最后一关 → 显示「下一关」
          }
        : null
  };
  const hit = renderer.draw(view.ctx, scene);
  ({ restartRect: view.restartRect, nextRect: view.nextRect, selectRect: view.selectRect, levelRects: view.levelRects } = hit);
}

// ---------------------------------------------------------------------------
// 结算与存档
// ---------------------------------------------------------------------------

/** 本局结束：刷新并持久化最高分（5.5 的页面内面板由 render.js 绘制，禁止 alert）。 */
function finishGame() {
  stopClock(); // v1.19：本局结束，倒计时停止（3.6 第 8 条）
  view.hammerArmed = false; // 3.9：本局结束后不再接受木锤落点
  const snapshot = getGameState(view.game);
  const isRecord = snapshot.currentScore > view.best;
  const reasonText = {
    won: `关卡完成（${snapshot.stars} 星）`,
    stuck: '无可消除组合（重排失败）',
    time: '时间到（倒计时归零且目标未达成）',
    steps: '步数用尽'
  };
  const endReasonText = reasonText[view.endReason] ?? reasonText.steps;
  if (isRecord) {
    view.best = snapshot.currentScore;
    storage.writeBestScore(view.best);
  }
  view.newRecord = isRecord;
  view.stars = snapshot.stars; // 3.7：结束面板据此画星星（未通关时为 0）
  // 5.6：本局结束的反馈 —— 通关 = 上行三音 + 逐颗星升调；失败 = 低沉单音。星级音错开一点，避免叠成一坨
  feedback(view.endReason === 'won' ? 'won' : 'lose');
  if (view.endReason === 'won') {
    for (let i = 0; i < view.stars; i += 1) {
      window.setTimeout(() => feedback('star', i), 260 + i * 160);
    }
  }
  if (snapshot.won) {
    // Step 12.2：每关只记录最佳星级（重玩更好才覆盖），并立刻落盘（v1.16：落盘在 storage.js）
    const starRecord = storage.recordLevelStars(view.levelStars, view.levelId, snapshot.stars);
    log('info', `第 ${view.levelId} 关星级记录为 ${starRecord.best} 星（${starRecord.updated ? '更新' : '沿用旧纪录'}，已写入 localStorage）`);
  }
  log(
    'info',
    `${view.endReason === 'won' ? '关卡结果' : '游戏结束'}：${endReasonText}。本局得分 ${snapshot.currentScore}，` +
      `最高分 ${view.best}` +
      (isRecord ? '（新纪录，已写入 localStorage）' : '')
  );
  updateBoosterBar();
  drawFrame();
}


function isInsideBoard(board, r, c) {
  return Boolean(board) && r >= 0 && c >= 0 && r < board.length && c < board[r].length;
}

/** v1.19（3.6 第 8 条）：时间关的「剩余」是秒，其它关卡是步数 —— 日志文案统一从这里取。 */
function progressLabel() {
  return isTimeLevel(view.game.level) ? '时间' : '步数';
}

function progressValue(result) {
  return isTimeLevel(view.game.level) ? `${Math.ceil(view.game.level.remainingTime)}s` : result.stepsLeft;
}

/** 正式日志入口（AGENTS.md 6 节：不使用调试用 console.log）。 */
function log(level, message) {
  if (!(level in LOG_RANK) || LOG_RANK[level] < MIN_LOG_RANK) return;
  const line = `[xxl] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
