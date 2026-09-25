// app.js — 应用编排：视图状态、动画调度、调用游戏逻辑。见 AGENTS.md 2.2 / 2.3 / 5.4 / 15 节。
// 本地存档的唯一读写点是 storage.js（v1.16 起）。
//
// 【Step 5 · ROADMAP】本文件按宪法 2.2/2.3 拆出四个 UI 模块，只保留编排职责：
//   - `render.js`（棋盘层绘制与几何）、`hud.js`（HUD 与结束面板）、
//     `input.js`（手势与视口守卫）、`timeline.js`（动画时间线调度与 rAF 回放）；
//   - 动画时长全部取自 `CONFIG.ANIMATION_CONFIG`（15 节），并让系统「减少动效」偏好一并生效（5.4）；
//   - 5.4：逻辑先全部算完（game.trySwap 同步结算），再按时间线播放快照 —— 动画不阻塞逻辑更新；
//   - 逻辑模块（config/game/board/match/score/level 等）本步未改动。

import { BOOSTER_KIND, CELL_TYPE, CONFIG, PARTICLE_KIND, STORAGE_KEYS } from './config.js';
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
// Step 17（v1.27）：粒子系统的纯逻辑（池/生命周期/确定性生成）；本文件只负责在时间线上生成与推进
import { activeParticles, clearParticles, createParticleSystem, spawnBurst, update as updateParticles } from './particles.js';
import { boardRect, cellAt, computeCanvasSize, createRenderer, hitTest } from './render.js';
import { advanceFloats, comboText, describeGoal, hudScoreAt, spawnFloat } from './hud.js'; // v1.16 信息层文案与回放插值；21.1 飘字池与连击文案
import { DEMO_LEVEL_IDS, HIDDEN_LEVEL_IDS, LEVEL_COUNT, LEVEL_MAP_POS, getLevelConfig, isLevelUnlocked, isTianbianOpen, isTimeLevel, unlockStarsFor } from './level.js';
import { centerMapOn, MAP_NAV_STEP_RATIO, mapSnapshot, panMap, relayoutMap, renderMap } from './vine-map.js'; // Step 19.5：藤蔓关卡地图（画布外的 SVG 层 + 视口内纵向平移）
import { createStorage, getTotalStars } from './storage.js';
import { buildPhases, createTimeline, motionDurations } from './timeline.js';

const LOG_RANK = { debug: 0, info: 1, warn: 2, error: 3 };
// v1.16：所有 localStorage 读写都经过 storage.js（唯一允许碰存档的模块），日志用本文件的 log
const storage = createStorage((level, message) => log(level, message));
const MIN_LOG_RANK = LOG_RANK.info;
const MAX_DPR = 3; // 后备缓冲上限（与 render.js 的绘制预算一致）
// 19.3：地图上的最大关卡 id（主线 50 + 天边隐藏关 51–53）—— 选关与「下一关」都用它做上界
const MAX_MAP_LEVEL_ID = Math.max(LEVEL_COUNT, ...HIDDEN_LEVEL_IDS);
const CLOCK_INTERVAL_MS = 250; // 时间关倒计时的刷新间隔（3.6 第 8 条：时间只按真实时间流逝）

const renderer = createRenderer();
const timeline = createTimeline({
  onFrame: (phase, progress) => {
    stepParticles(phase); // Step 17：先推进/生成粒子，再画这一帧（保证与相位同帧）
    view.hudScore = view.playback ? hudScoreAt(view.playback, phase.levelIndex) : view.game.level.currentScore; // 连消收益逐层显示
    // Step 16（5.6）：每层消除配一声「连击升调」的音（+ 一次轻震）；同一层不重复响
    if (phase.phase === 'clear' && phase.levelIndex !== view.lastClearLevel) {
      view.lastClearLevel = phase.levelIndex;
      feedback('clear', phase.levelIndex);
      // Step 21.1（D048）：本层得分飘字 + 连击文案。reduced-motion 下**不生成**飘字
      // （与粒子的口径一致：不是生成了再隐身）；连击文案走既有的 drawBanner 通道。
      const gained = view.playback?.levelScores?.[phase.levelIndex]?.gained ?? 0;
      if (gained > 0 && !view.systemReducedMotion && !view.settling) {
        view.floats = spawnFloat(view.floats, `+${gained}`, nowMs());
        startFloatTicker();
      }
      view.comboBanner = view.settling ? null : comboText(phase.levelIndex);
    } else if (phase.phase !== 'clear') {
      view.comboBanner = null;
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
  screen: 'playing', // 'playing' | 'select'：对局界面与藤蔓地图（19.2 起地图是画布外的 DOM 层）
  levelStars: {}, // 每关最佳星级（localStorage 存档，键为关卡 id）
  mapDrag: null, // 19.5：地图拖拽的临时状态（{ startY, startOffset, lastY, lastT, velocity, moved }）
  mapInertia: 0, // 19.5：松手后惯性滑动的 rAF id（0 = 没有在滑）
  mapDragged: false, // 19.5：这一轮手势是「拖拽」而不是「点按」—— 用来抑制随后那次 click
  nextRect: null, // 结束面板的「下一关」
  selectRect: null, // 结束面板的「选关」
  canvasSize: null, // Step 23：{w,h}（满屏竖版画布）
  dpr: 1,
  layout: null, // render.js 的 boardRect(canvasSize) 结果（prepare 时复用）
  selected: null, // 点击两次交换的后备方案中已选中的格子
  firstGroups: [], // 本次交换第 1 层识别出的匹配（仅用于高亮）
  endReason: 'steps', // 结束原因：'steps'（步数用尽）/ 'stuck'（死局重排超限，3.8 约束 4）
  playback: null, // 本轮回放的数据（逐层分数、是否待结束）；timeline.running 决定是否锁输入
  hudScore: null, // 播放期间按层累加的分数；null 表示直接读 GameState
  floats: [], // 21.1（D048）：分数飘字池（hud.js 的纯函数维护；有界、按时间回收）
  floatRaf: 0, // 飘字自己的 rAF（时间线在跑时不重复绘制）
  comboBanner: null, // 21.1：连击文案（第 3 层起），只在该 clear 相位显示
  settling: false, // 21.1：结算演出进行中（此时不生成飘字/连击，保证结算定格帧画面干净）
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
  lastClearLevel: -1,
  // Step 17（v1.27）：粒子系统 + 相位跟踪（生成只在相位切换时发生）+ 上一帧时间（算 dt）
  particles: null,
  particlePhase: null,
  particleAt: 0,
  // Step 19.3（v1.28）：地图的解锁快照（每次 drawMap 重算，只读；不进存档）+ 提示条定时器
  mapLocked: null,
  mapRequired: null,
  toastTimer: 0
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
  // Step 17（v1.27）：系统「减少动效」或配置开关为真时 enabled = false —— 粒子**不生成**（不是变透明）
  view.particles = createParticleSystem({
    reducedMotion: view.systemReducedMotion || CONFIG.ANIMATION_CONFIG.reducedMotion
  });
  startNewGame();
  applyLayout();
  bindBoosters(); // Step 15：道具条（画布外的 DOM 元素）
  bindPrefs(); // Step 16：音效/震动开关
  bindSettingsToggle(); // Step 21.2（D048）：设置齿轮的浮层开合
  bindMap(); // Step 19.2：藤蔓地图的事件委托（点节点进关 / 点分页翻页）
  if (mapRequested()) showMap(); // `?map=1` 直达地图（与 `?demo=` 同一模式，供真机与取证使用）

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

/** Step 19.2：URL 带 `?map=1` 时开局即进入藤蔓地图（选关）。 */
function mapRequested() {
  if (typeof window === 'undefined') return false;
  return /(^|[?&])map=1(&|$)/.test(window.location.search) || window.location.hash === '#map';
}

/** 开新一局：重建 GameState 并复位视图侧状态。 */
function startNewGame() {
  timeline.stop(); // 防御性：正常路径下不会在回放中重开
  hideMap(); // 19.2：从地图进关时先收起地图
  view.game = createGame(getLevelConfig(view.levelId));
  view.screen = 'playing';
  view.newRecord = false;
  view.stars = 0;
  view.selected = null;
  view.firstGroups = [];
  view.playback = null;
  view.hudScore = null;
  // 21.1（D048）：重开一局清空飘字与连击文案（并停掉飘字自己的 rAF）
  if (view.floatRaf) window.cancelAnimationFrame(view.floatRaf);
  view.floatRaf = 0;
  view.floats = [];
  view.comboBanner = null;
  view.settling = false;
  view.restartRect = null;
  view.hammerArmed = false; // 3.9：重开一局时退出「小木锤待选格」
  view.lastClearLevel = -1;

  const snapshot = getGameState(view.game);
  const timing = snapshot.timeLimit ? `倒计时 ${snapshot.timeLimit} 秒` : `步数 ${snapshot.remainingSteps}`;
  log('info', `新一局开始：第 ${snapshot.levelId} 关 ${snapshot.rows}×${snapshot.cols}，${timing}，最高分 ${view.best}`);
  startClock(); // 3.6 第 8 条：时间关由真实时间驱动倒计时；其它关卡不启动
  updateBoosterBar();
  if (view.canvasSize) drawFrame();
}

// 4.4 的 LevelConfig 由 level.js 提供（2.3：关卡配置属 level.js 的职责；
// Step 11 加障碍物后 app.js 越过第 6 节的 300 行，配置表因此回到 level.js）。

/** 应用尺寸（5.2：后备缓冲按 DPR 适配，棋盘保持正方形；Step 23：画布是**满屏竖版**）。 */
function applyLayout() {
  const canvas = computeCanvasSize(); // { w, h }
  const dpr = Math.min(window.devicePixelRatio || 1, MAX_DPR);

  view.canvasSize = canvas;
  view.dpr = dpr;
  view.layout = boardRect(canvas);
  view.canvas.style.width = `${canvas.w}px`;
  view.canvas.style.height = `${canvas.h}px`;
  // 先改后备缓冲尺寸（该赋值会重置变换并清空画布），再设变换、再重建离屏缓存与绘制
  const backingW = Math.round(canvas.w * dpr);
  const backingH = Math.round(canvas.h * dpr);
  if (view.canvas.width !== backingW) view.canvas.width = backingW;
  if (view.canvas.height !== backingH) view.canvas.height = backingH;
  view.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  renderer.prepare(canvas, dpr, view.layout); // 静态图层 + 糖果精灵图集
  // 19.5：地图打开时视口尺寸变了要重算世界几何（并让当前关重新居中），否则转屏后世界会停在错误的偏移上
  if (view.screen === 'select') relayoutMap(document.getElementById('map'), { centerOn: view.levelId });
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
  const from = cellAt(view.canvas, x0, y0, view.canvasSize);
  if (!from) return;
  attemptSwap(from, { r: from.r + step.r, c: from.c + step.c });
}

function onTap({ x1, y1 }) {
  view.audio?.unlock();
  // 19.2：地图打开时画布是隐藏的，事件走 DOM；这里若仍处于 select 就直接返回（不误判隐藏画布上的点按）
  if (view.screen === 'select') return;
  if (view.game.gameOver) {
    if (hitTest(view.canvas, x1, y1, view.nextRect)) {
      view.levelId = Math.min(view.levelId + 1, MAX_MAP_LEVEL_ID); // 通关后的「下一关」（含天边隐藏关）
      startNewGame();
      return;
    }
    if (hitTest(view.canvas, x1, y1, view.selectRect)) {
      showMap(); // 19.2：结束面板的「选关」打开藤蔓地图（不再切 canvas 界面）
      return;
    }
    if (hitTest(view.canvas, x1, y1, view.restartRect)) startNewGame();
    else log('info', '本局已结束：点按「再来一局」开始新一局');
    return;
  }
  const cell = cellAt(view.canvas, x1, y1, view.canvasSize);
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

  // Step 20（v1.25，3.6 第 7 条）：本局结束时的**结算阶段**。它排在这一手之后、星级结算之前，
  // 因此日志顺序与时间线的阶段顺序一致（转化定格 → 连锁引爆 → 结束面板）。
  if (result.resolve.settlement) {
    // Step 21.1（D048）：**结算演出期间不叠加任何果汁层**（飘字与连击横幅都不生成）——
    // 结算的「转化定格」帧要靠**画面静止**来取证（config.js 的 settleHold 注释、Step 20 的像素巡检
    // 都依赖这一点），飘字/横幅会盖住它本该展示的那批特殊糖果。正常消除不受影响。
    view.settling = true;
    log('info', `结算阶段（3.6 第 7 条 / Step 20）：${settlementText(result.resolve.settlement)}`);
  }

  // 3.8：死局与重排的结果（成功：提示 + 重排动画；失败：结束流程，不消耗步数）
  const deadlock = result.resolve.deadlock;
  view.endReason = view.game.level.completed ? 'won' : 'steps';
  if (view.game.level.completed) {
    // 3.6 / 3.7：通关优先于「步数用尽」——最后一步达成目标也算通关（此时剩余步数已进入结算阶段）
    view.endReason = 'won';
    log('info', `关卡完成（3.6）：${describeGoal(view.game.level.goal)}，本局 ${view.game.level.currentScore} 分`);
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
  // Step 20（v1.25）：把结算阶段元信息一起交给时间线 —— 它会在引爆之前插入一帧「转化定格」
  timeline.play(buildPhases(result.resolve, result.afterSwap, motion, result.resolve.settlement));
}

function finishTimeline() {
  const pendingGameOver = Boolean(view.playback?.pendingGameOver);
  view.playback = null;
  view.hudScore = null;
  view.firstGroups = [];
  // 21.1（D048）：回放结束后清掉连击文案 —— 否则最后一层恰好是 clear 时，
  // 那枚横幅会**一直留在画面上**（本轮探针抓到的真缺陷：1.5s 后仍扫到 1096 个横幅像素）。
  view.comboBanner = null;
  view.settling = false;
  resetParticles(); // Step 17：回放结束后清空粒子，避免它们停在新画面上
  drawFrame();
  if (pendingGameOver) finishGame();
}

// ---------------------------------------------------------------------------
// 粒子动画（Step 17，v1.27；AGENTS.md 2.3 / 15）
//
// 本文件只做**编排**：把 `particles.js` 的纯逻辑挂到时间线的每帧回调上 ——
//   · 生成只在**相位切换**时发生一次（同一个相位对象会连续回调多帧）；
//   · 推进用真实时间差 `dt`（`update` 内部把 dt 夹在 [0,100]ms，暂停回来不会瞬移）；
//   · 种类由该格**被消除前**的 `cell.type` 决定（消除相位的 board 是消除前快照），
//     因此不需要给逻辑层加任何「谁被引爆了」的新字段；
//   · 种子键 = 关卡 id + 级联层（`phase.levelIndex`）+ `cell.id` + 种类 ⇒ 同局面同粒子。
// ---------------------------------------------------------------------------

/** 每帧：先推进粒子，再在相位切换时生成这一批。 */
/**
 * 分数飘字自己走完生命周期（21.1 / D048）：每帧回收一次并重画。
 * 时间线在跑时不重复绘制（它本来就在逐帧画）；飘完即自动停下 —— 空闲时不占 rAF。
 */
function startFloatTicker() {
  if (view.floatRaf || typeof window.requestAnimationFrame !== 'function') return;
  const step = () => {
    view.floatRaf = 0;
    view.floats = advanceFloats(view.floats, nowMs());
    if (!timeline.running) drawFrame();
    if (view.floats.length > 0) view.floatRaf = window.requestAnimationFrame(step);
  };
  view.floatRaf = window.requestAnimationFrame(step);
}

function stepParticles(phase) {
  const system = view.particles;
  if (!system) return;
  const now = nowMs();
  const dt = view.particleAt > 0 ? now - view.particleAt : 0;
  view.particleAt = now;
  updateParticles(system, dt);
  if (phase !== view.particlePhase) {
    view.particlePhase = phase;
    spawnPhaseParticles(phase);
  }
}

/** 消除相位 → 粒子：逐格按种类生成；同一批清掉 ≥ 2 颗特殊糖果时，在质心再补一炸「组合」。 */
function spawnPhaseParticles(phase) {
  const system = view.particles;
  if (!system || !phase || phase.phase !== 'clear' || !phase.keys) return;
  const specials = [];
  for (const key of phase.keys) {
    const [r, c] = String(key).split(',').map(Number);
    const cell = phase.board?.[r]?.[c];
    if (!cell) continue;
    const kind =
      cell.type === CELL_TYPE.MAGIC ? PARTICLE_KIND.MAGIC
        : cell.type === CELL_TYPE.STRIPED ? PARTICLE_KIND.STRIPED
          : cell.type === CELL_TYPE.WRAPPED ? PARTICLE_KIND.WRAPPED
            : PARTICLE_KIND.CLEAR;
    if (kind !== PARTICLE_KIND.CLEAR) specials.push({ r, c });
    spawnBurst(system, {
      r,
      c,
      kind,
      color: Number.isInteger(cell.color) ? cell.color : 0,
      direction: cell.direction ?? null,
      levelId: view.levelId,
      stage: phase.levelIndex ?? 0,
      cellId: cell.id
    });
  }
  // 组合（3.3）：同批 ≥ 2 颗特殊糖果 → 质点处一记「最大的一爆」
  if (specials.length >= 2) {
    const r = Math.round(specials.reduce((sum, pos) => sum + pos.r, 0) / specials.length);
    const c = Math.round(specials.reduce((sum, pos) => sum + pos.c, 0) / specials.length);
    spawnBurst(system, {
      r,
      c,
      kind: PARTICLE_KIND.COMBO,
      color: 0,
      levelId: view.levelId,
      stage: phase.levelIndex ?? 0,
      cellId: 1000 + specials.length * 64 + r * 8 + c // 组合的种子键：颗数 + 质心
    });
  }
}

/** 清空粒子与相位跟踪（回放结束/换局时调用）。 */
function resetParticles() {
  if (view.particles) clearParticles(view.particles);
  view.particlePhase = null;
  view.particleAt = 0;
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
// 藤蔓关卡地图（Step 19.2 建层 / **Step 19.5 换成世界纵向平移**；AGENTS.md 2.3 / 5.1，口径见 D047）
//
// 地图是**画布外的绝对定位 SVG 层**（结构在 index.html、样式在 vine-map.css、绘制与平移在 vine-map.js）：
//   · 不参与画布几何（`computeCanvasSize`），因此既有像素取证不受影响；
//   · **页面本身不滚动**（5.1）：视口固定 + `overflow: hidden`，平移的是世界自己的 `transform: translateY`；
//   · 手势与游戏内手势**天然隔离**：input.js 的 `bindInput` 绑在 canvas 上，而地图打开时 canvas 是隐藏的；
//     document 级的 `bindViewportGuards` 只 `preventDefault`（挡默认行为），不阻断投递，因此地图元素上的
//     监听照常收到 `touchmove` —— **不需要改 input.js**（19.5 开工前的侦察结论，见 PROGRESS 的 19.5 执行卡）。
// 事件用委托绑一次（节点每次渲染都会重建），因此不需要在 vine-map.js 里认识 app。
// ---------------------------------------------------------------------------

/** 地图事件的一次性绑定：点按节点 / 导航按钮 / 回中 / 拖拽 + 惯性 / 键盘。 */
function bindMap() {
  const host = document.getElementById('map');
  if (!host) {
    log('warn', '未找到 #map 容器，选关入口不可用（不影响对局）');
    return;
  }
  host.addEventListener('click', (event) => {
    const nav = event.target.closest?.('[data-nav]');
    if (nav) {
      handleMapNav(nav.dataset.nav);
      return;
    }
    // 19.5：刚刚拖过世界 → 这一下 click 不算「点节点」（否则松手时误进关卡）
    if (view.mapDragged) {
      view.mapDragged = false;
      return;
    }
    const node = event.target.closest?.('[data-level]');
    if (node) pickLevel(Number(node.dataset.level));
  });
  // 键盘可达：Enter/Space 落在节点上等同于点击；↑/↓ 平移世界；Home 回到当前关
  host.addEventListener('keydown', (event) => {
    if (!host.hidden && (event.key === 'ArrowUp' || event.key === 'ArrowDown')) {
      event.preventDefault();
      navigateMap(event.key === 'ArrowUp' ? 1 : -1);
      return;
    }
    if (!host.hidden && event.key === 'Home') {
      event.preventDefault();
      recenterMap();
      return;
    }
    if (event.key !== 'Enter' && event.key !== ' ') return;
    const node = event.target.closest?.('[data-level]');
    if (!node) return;
    event.preventDefault();
    pickLevel(Number(node.dataset.level));
  });
  // 拖拽：触摸与鼠标各一套（5.3 的主交互是触摸；桌面用鼠标同一套逻辑）
  host.addEventListener('touchstart', (event) => beginMapDrag(eventPoint(event)), { passive: true });
  host.addEventListener('touchmove', (event) => moveMapDrag(eventPoint(event)), { passive: true });
  host.addEventListener('touchend', endMapDrag, { passive: true });
  host.addEventListener('touchcancel', endMapDrag, { passive: true });
  host.addEventListener('mousedown', (event) => beginMapDrag({ y: event.clientY, target: event.target }));
  host.addEventListener('mousemove', (event) => moveMapDrag({ y: event.clientY }));
  host.addEventListener('mouseup', endMapDrag);
  host.addEventListener('mouseleave', endMapDrag);
}

/** 触摸/鼠标事件 → 统一的 `{ y }` 取值（只关心纵向）。 */
function eventPoint(event) {
  const touch = event?.touches?.[0] ?? event?.changedTouches?.[0];
  if (touch) return { y: touch.clientY, target: event.target };
  if (Number.isFinite(event?.clientY)) return { y: event.clientY, target: event.target };
  return null;
}

/** 导航按钮：▲/▼ 各移动一个 `navStepRatio` 视口高；「回到当前关」把当前关重新居中。 */
function handleMapNav(kind) {
  if (kind === 'current') {
    recenterMap();
    return;
  }
  navigateMap(kind === 'up' ? 1 : -1);
}

/** 把世界平移一个视口比例（+1 = 看向世界更上方）。动画时长走 CSS（`--vine-scroll-ms`）。 */
function navigateMap(step) {
  const host = document.getElementById('map');
  const before = mapSnapshot(host);
  if (!before) return;
  stopMapInertia();
  const delta = MAP_NAV_STEP_RATIO * before.viewportHeight * (step > 0 ? 1 : -1);
  panMap(host, delta, { animate: true });
  log('info', `地图平移：向${step > 0 ? '上' : '下'} ${Math.round(Math.abs(delta))}px（第 ${before.focused} 关 → 偏移 ${before.offset.toFixed(0)}→${(before.offset + delta).toFixed(0)}）`);
}

/** 「回到当前关」：把当前关卡重新放到视口正中（用户口径里的防迷路机制）。 */
function recenterMap() {
  const host = document.getElementById('map');
  if (!host) return;
  const before = mapSnapshot(host);
  if (!before) return;
  stopMapInertia();
  centerMapOn(host, view.levelId, { animate: true });
  const after = mapSnapshot(host);
  log('info', `地图回中：第 ${view.levelId} 关居中（偏移 ${before.offset.toFixed(0)}→${after ? after.offset.toFixed(0) : '?'}）`);
}

/** 开始一次拖拽（只在视口区域内；越过 `dragThreshold` 才真正开始平移）。 */
function beginMapDrag(point) {
  const host = document.getElementById('map');
  if (!host || host.hidden || !point) return;
  if (!point.target?.closest?.('.vine-viewport')) return;
  const snapshot = mapSnapshot(host);
  if (!snapshot) return;
  stopMapInertia();
  view.mapDrag = {
    startY: point.y,
    startOffset: snapshot.offset,
    lastY: point.y,
    lastT: nowMs(),
    velocity: 0,
    moved: false
  };
}

/** 拖拽中：世界跟手（`offset = 起始偏移 + 手指位移`），并记录瞬时速度供惯性使用。 */
function moveMapDrag(point) {
  const drag = view.mapDrag;
  const host = document.getElementById('map');
  if (!drag || !host || !point) return;
  const delta = point.y - drag.startY;
  if (!drag.moved) {
    if (Math.abs(delta) < CONFIG.VINE_MAP_CONFIG.dragThreshold) return;
    drag.moved = true;
    host.dataset.dragging = 'true';
  }
  const now = nowMs();
  const dt = Math.max(1, now - drag.lastT);
  drag.velocity = (point.y - drag.lastY) / dt; // px/ms（向下拖为正 = 看向世界更下方）
  drag.lastY = point.y;
  drag.lastT = now;
  panMap(host, drag.startOffset + delta - (mapSnapshot(host)?.offset ?? 0), { animate: false });
}

/** 松手：把这一轮标记为「拖拽」（抑制随后的 click），并按速度起一段惯性滑动。 */
function endMapDrag() {
  const host = document.getElementById('map');
  const drag = view.mapDrag;
  view.mapDrag = null;
  if (host) host.dataset.dragging = 'false';
  if (!drag || !drag.moved || !host) return;
  view.mapDragged = true;
  // 5.4：系统「减少动效」时不做惯性（少动效优先于手感）
  if (view.systemReducedMotion || Math.abs(drag.velocity) < 0.05) return;
  startMapInertia(host, drag.velocity);
}

/** 惯性滑动：按 `scrollInertia` 逐帧衰减，触到边界或速度足够小就停。 */
function startMapInertia(host, velocity) {
  const decay = CONFIG.VINE_MAP_CONFIG.scrollInertia;
  let speed = velocity;
  let last = nowMs();
  const step = () => {
    view.mapInertia = 0;
    const snapshot = mapSnapshot(host);
    if (!snapshot) return;
    const now = nowMs();
    const dt = Math.min(64, Math.max(1, now - last));
    last = now;
    const next = panMap(host, speed * dt, { animate: false });
    if (next === null || next === snapshot.offset) return; // 已到首/末关，停下
    speed *= Math.pow(decay, dt / 16.67);
    if (Math.abs(speed) < 0.02) return;
    view.mapInertia = window.requestAnimationFrame(step);
  };
  view.mapInertia = window.requestAnimationFrame(step);
}

/** 停止惯性滑动（切页/回中/收起地图时都要停，避免和新的动画打架）。 */
function stopMapInertia() {
  if (view.mapInertia) window.cancelAnimationFrame(view.mapInertia);
  view.mapInertia = 0;
  view.mapDrag = null;
  const host = document.getElementById('map');
  if (host) host.dataset.dragging = 'false';
}

/** 打开地图（`view.screen = 'select'`）：隐藏画布、按当前关**自动居中**渲染世界。 */
function showMap() {
  const host = document.getElementById('map');
  if (!host) return;
  view.screen = 'select';
  view.selected = null;
  host.hidden = false;
  if (view.canvas) view.canvas.hidden = true;
  const snapshot = drawMap();
  log('info', `进入选关地图：第 ${view.levelId} 关居中，视口内 ${snapshot ? snapshot.visible.length : 0} 个节点（世界平移，页面不滚动）`);
}

function hideMap() {
  stopMapInertia(); // 19.5：收起地图要停掉惯性，否则 rAF 会继续改已隐藏的世界
  const host = document.getElementById('map');
  if (host) host.hidden = true;
  if (view.canvas) view.canvas.hidden = false;
}

/**
 * 重画地图（打开地图或视口尺寸变化时调用）；星级与总星数从存档读，地图层自己不碰存储。
 * 19.3：解锁状态是**派生量** —— 这里用 `level.isLevelUnlocked` 逐关算好（含反锁保护），
 * 把 `unlocked` / `required` 两张表与天边云层状态一起交给地图层；地图层只负责画。
 * 19.5：`centerOn` 让**当前关进图即居中**（用户口径的「自动定位」）。
 */
function drawMap() {
  const host = document.getElementById('map');
  if (!host) return null;
  const totalStars = getTotalStars(view.levelStars); // 总星数是派生量（v1.21 口径），只读不写
  const unlocked = {};
  const required = {};
  const revealed = {};
  for (const position of LEVEL_MAP_POS) {
    const earned = view.levelStars?.[position.id] ?? 0;
    required[position.id] = unlockStarsFor(position.id);
    unlocked[position.id] = isLevelUnlocked(position.id, { earned, totalStars });
    revealed[position.id] = true;
  }
  const tianbianOpen = isTianbianOpen(totalStars);
  const tianbianStars = unlockStarsFor(HIDDEN_LEVEL_IDS[0]);
  if (!tianbianOpen) {
    // 云层未散去：隐藏关**不渲染**（地图层用 revealed=false 跳过它们，并画出世界顶部的云带）
    for (const id of HIDDEN_LEVEL_IDS) revealed[id] = false;
  }
  renderMap(host, {
    stars: view.levelStars,
    current: view.levelId,
    centerOn: view.levelId,
    totalStars,
    unlocked,
    required,
    revealed,
    tianbian: { open: tianbianOpen, stars: totalStars, required: tianbianStars },
    starTotal: LEVEL_COUNT * 3 // 19.3：⭐ n/150 的分母只数主线关（隐藏关不计入）
  });
  view.mapLocked = unlocked; // 供 pickLevel 判定；只读快照，不进存档
  view.mapRequired = required;
  return mapSnapshot(host);
}

/** 点某一关：19.3 起**锁定的关卡不放行**，只弹一条提示；进入关卡时不写任何存档。 */
function pickLevel(levelId) {
  if (!Number.isFinite(levelId)) return;
  const id = Math.min(Math.max(Math.round(levelId), 1), MAX_MAP_LEVEL_ID);
  const earned = view.levelStars?.[id] ?? 0;
  const unlocked = view.mapLocked?.[id] ?? isLevelUnlocked(id, { earned, totalStars: getTotalStars(view.levelStars) });
  if (!unlocked) {
    const need = view.mapRequired?.[id] ?? unlockStarsFor(id);
    const missing = Math.max(0, need - getTotalStars(view.levelStars));
    showMapToast(`第 ${id} 关还没解锁：还差 ${missing} ⭐（需要 ${need} ⭐）`);
    log('info', `地图：第 ${id} 关未解锁（需要 ${need} 星，当前 ${getTotalStars(view.levelStars)} 星），已拒绝进入`);
    return;
  }
  view.levelId = id;
  startNewGame(); // 内部会 hideMap() 并把 screen 切回 playing
  log('info', `已从地图选择第 ${view.levelId} 关`);
}

/** 地图内的一次性提示条（画布外的 DOM；`vine-map.css` 的 `.vine-toast`），2 秒后自动淡出。 */
function showMapToast(text) {
  const host = document.getElementById('map');
  if (!host) return;
  let toast = host.querySelector('.vine-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.className = 'vine-toast';
    toast.setAttribute('role', 'status');
    host.appendChild(toast);
  }
  toast.textContent = text;
  toast.dataset.visible = 'true';
  if (view.toastTimer) clearTimeout(view.toastTimer);
  view.toastTimer = setTimeout(() => {
    toast.dataset.visible = 'false';
  }, 2000);
}

// ---------------------------------------------------------------------------
// 音效与震动（Step 16，v1.22；AGENTS.md 5.6）
//
// 规则侧只定义「什么事件该有反馈」，声音怎么合成在 `audio.js`（唯一创建 AudioContext 的模块），
// 开关与偏好落在 `storage.js`。这里只做三件事：绑开关、在事件点调 `feedback()`、首次手势解锁音频。
// ---------------------------------------------------------------------------

/**
 * Step 21.2（v1.32 / D048）：设置齿轮 —— 把音效/震动开关收进一枚浮层按钮。
 * 只切换 `#settings` 的 `hidden` 与齿轮的 `aria-expanded`：**开关本身的行为、绑定与落盘都没变**
 * （`#settings .pref` 的 click 仍由 bindPrefs 绑着），浮层是绝对定位的，因此 `--booster-bar-h` 不受影响。
 */
function bindSettingsToggle() {
  const toggle = document.getElementById('settings-toggle');
  const panel = document.getElementById('settings');
  if (!toggle || !panel) return; // 没有齿轮也能玩（开关默认都开）
  toggle.addEventListener('click', () => {
    const opening = panel.hidden;
    panel.hidden = !opening;
    toggle.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (opening) log('info', '设置：音效/震动开关已展开');
  });
}

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
  if (!view.canvasSize) return;
  const scene = {
    canvas: view.canvasSize, // Step 23：{w,h}（满屏竖版）
    board: entry ? entry.board : view.game.board,
    matched: entry && entry.phase === 'clear' && entry.levelIndex === 0 ? view.firstGroups : [],
    selected: entry ? null : view.selected,
    clearing: entry && entry.phase === 'clear' ? { keys: entry.keys, progress } : null,
    falling: entry && (entry.phase === 'fall' || entry.phase === 'shuffle') ? { moves: entry.moves, progress } : null,
    hidden: entry && entry.phase === 'fall' ? entry.hidden : null,
    banner: entry?.banner ?? view.comboBanner ?? null, // 5.5 重排提示 / 21.1 连击文案（结算阶段刻意不叠加横幅，见 timeline.js）
    // Step 17（v1.27）：本帧的粒子快照（particles.js 的只读叶子字段，已按 maxPerFrame 截断）
    particles: view.particles ? activeParticles(view.particles) : [],
    // Step 21.1（v1.31）：分数飘字（hud.js 的池）与本帧时间（心跳/飘字/闪烁都只由它驱动）
    floats: view.floats,
    nowMs: nowMs(),
    // Step 19.2：选关界面已改为画布外的藤蔓地图层（`#map`），canvas 场景里不再有选关网格
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
  ({ restartRect: view.restartRect, nextRect: view.nextRect, selectRect: view.selectRect } = hit);
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

/** Step 20（v1.25）：结算阶段的日志文案（`resolve.settlement` 为空时不会被调用）。 */
function settlementText(settlement) {
  return (
    `剩余 ${settlement.steps} 步 → 奖励 +${settlement.stepScore} 分，` +
    `转化 ${settlement.converted.length} 颗特殊糖果，` +
    `从棋盘底部到顶部连锁引爆 ${settlement.detonations} 次`
  );
}

/** 正式日志入口（AGENTS.md 6 节：不使用调试用 console.log）。 */
function log(level, message) {
  if (!(level in LOG_RANK) || LOG_RANK[level] < MIN_LOG_RANK) return;
  const line = `[xxl] ${message}`;
  if (level === 'error') console.error(line);
  else if (level === 'warn') console.warn(line);
  else console.info(line);
}
