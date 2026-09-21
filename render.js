// render.js — Canvas 绘制与几何计算（棋盘层）。见 AGENTS.md 2.2 / 2.3 / 5.2 / 5.4。
//
// 边界（2.3）：只接收「场景描述」对象并绘制；不读游戏状态、不绑定事件、不碰 localStorage。
// 信息层（HUD、结束面板）在 hud.js，本文件**单向**依赖它（需要 HUD_RATIO/hudCells 切分布局与烘焙静态图层）。
// 【Step 7】糖果外观与精灵烘焙拆到 candy.js（宪法 v1.7）：本文件只保留几何、布局与每帧绘制。
// 性能（REFERENCES.md §3.5 三条红线）：
//   1) 每帧绘制路径不使用阴影模糊类 API（本文件没有该调用，验证见 PROGRESS 的红线计数）；
//   2) 静态图层（背景 + HUD 底 + 棋盘区底 + 64 个格位槽）与糖果精灵（candy.js 烘焙）
//      都在布局时烘焙，每帧只用 drawImage 复用，避免每帧几十次路径绘制；
//   3) 修饰性底色透明度 0.045（≤ 0.1）；匹配/选中高亮是有意义的状态提示，不属修饰性描边。
// 色盲友好（5.4）：普通动物除颜色外还有 6 种可区分形状 + 内嵌图案（candy.js 实现）。
// 外观方案经用户批准（深色描边 + 内阴影 + 内嵌图案 + 高光 + 条纹/方向箭头），见 DECISIONS.md D020。

import { CELL_TYPE, CONFIG, DIRECTION } from './config.js';
import { buildCollectibleAtlas, buildObstacleAtlas, buildSpriteAtlas, roundRectPath } from './candy.js';
import { HUD_RATIO, drawBanner, drawGameOver, drawHud, drawLevelSelect, hudCellBackground, hudCells } from './hud.js';

// 渲染常量：只影响观感，不参与游戏规则（归属取舍见 D013）
const MAX_DPR = 3; // 后备缓冲上限：高 DPR 机型不做无意义的 4× 过度绘制
const BOARD_MARGIN = 16; // px；画布与安全区内容边缘之间的呼吸空间（两侧各一份）
const MIN_BOARD_PX = 220; // 极窄视口下的可读下限
const MAX_BOARD_PX = 720; // 平板/桌面上不让棋盘无限放大
const BACKDROP_RADIUS_RATIO = 0.03; // 画布圆角 / 边长
const FIELD_RADIUS_RATIO = 0.03; // 棋盘区圆角 / 棋盘边长
const SLOT_INSET_RATIO = 0.06; // 格位槽相对格子的内缩比例
const SLOT_RADIUS_RATIO = 0.18; // 格位槽圆角 / 格子边长
const MATCH_RING_RATIO = 0.44; // 匹配高亮环半径 / 格子边长
const SELECT_RING_RATIO = 0.43; // 选中环半径 / 格子边长
const BACKDROP_COLOR = '#1b1830';
const FIELD_COLOR = '#221d38';
const SLOT_COLOR = 'rgba(255, 255, 255, 0.045)'; // 格位槽底色（红线 3：≤ 0.1 的修饰性底色）
const MATCH_RING_COLOR = 'rgba(255, 246, 180, 0.95)';
const SELECT_RING_COLOR = 'rgba(255, 255, 255, 0.85)';

/** 画布边长（CSS 像素）：取可用宽高中的较小者，扣除安全区与留白（5.1）。 */
export function computeBoardSize() {
  const root = document.documentElement;
  const viewportW = root.clientWidth || window.innerWidth;
  const viewportH = root.clientHeight || window.innerHeight;
  const availW = viewportW - readSafeInset('left') - readSafeInset('right') - BOARD_MARGIN * 2;
  const availH = viewportH - readSafeInset('top') - readSafeInset('bottom') - BOARD_MARGIN * 2;
  const available = Math.min(availW, availH);
  if (available <= 0) return 1;
  // 220px 是可读性目标；更窄的设备必须服从实际可用空间，避免棋盘横向溢出。
  const target = available < MIN_BOARD_PX ? available : Math.min(available, MAX_BOARD_PX);
  return Math.max(1, Math.floor(target));
}

/** 画布内的分区几何：顶部 HUD 带 + 正方形棋盘区（5.2 棋盘必须是正方形）。 */
export function boardRect(sizePx) {
  const hudHeight = Math.round(sizePx * HUD_RATIO);
  const side = sizePx - hudHeight;
  return { hudHeight, field: { x: (sizePx - side) / 2, y: hudHeight, side } };
}

/** 屏幕坐标 → 棋盘格；落在棋盘区外返回 null。 */
export function cellAt(canvas, clientX, clientY, sizePx) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const area = boardRect(sizePx).field;
  const cols = CONFIG.BOARD_SIZE;
  const c = Math.floor(((clientX - rect.left - area.x) / area.side) * cols);
  const r = Math.floor(((clientY - rect.top - area.y) / area.side) * cols);
  if (r < 0 || c < 0 || r >= cols || c >= cols) return null;
  return { r, c };
}

/** 点按是否落在矩形内（矩形为画布内坐标，需换算掉画布在页面中的偏移）。 */
export function hitTest(canvas, clientX, clientY, box) {
  if (!box) return false;
  const rect = canvas.getBoundingClientRect();
  const x = clientX - rect.left;
  const y = clientY - rect.top;
  return x >= box.x && x <= box.x + box.w && y >= box.y && y <= box.y + box.h;
}

/**
 * 创建渲染器：持有离屏缓存（静态图层 + 糖果精灵图集），按尺寸变化重建。
 * app.js 在布局变化时 prepare，每帧 draw；draw 返回本帧的交互区域（结束面板按钮）。
 */
export function createRenderer() {
  let cache = null;

  function prepare(sizePx, dpr, layout) {
    cache = {
      sizePx,
      layout,
      cellCss: layout.field.side / CONFIG.BOARD_SIZE,
      chrome: buildChrome(sizePx, dpr, layout),
      sprites: buildSpriteAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr),
      obstacles: buildObstacleAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr), // Step 11：冰块/雪块
      collectibles: buildCollectibleAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr) // Step 14：水果/金豆荚
    };
  }

  function draw(ctx, scene) {
    const empty = { restartRect: null, nextRect: null, selectRect: null, levelRects: [] };
    if (!cache || cache.sizePx !== scene.sizePx) return empty;
    const { field } = cache.layout;
    ctx.clearRect(0, 0, scene.sizePx, scene.sizePx);
    ctx.drawImage(cache.chrome, 0, 0, scene.sizePx, scene.sizePx); // 静态图层：1 次 drawImage

    // Step 12.2：选关界面只画 HUD 底 + 关卡网格（不画棋盘层）
    if (scene.select) {
      drawHud(ctx, { sizePx: scene.sizePx, hudHeight: cache.layout.hudHeight, hud: scene.hud });
      return { ...empty, levelRects: drawLevelSelect(ctx, field, scene.select) };
    }

    drawCandies(ctx, cache, scene, field);
    drawCollectibles(ctx, cache, scene, field); // 3.6（v1.19）：水果/金豆荚占格、独立于糖果绘制
    drawObstacles(ctx, cache, scene, field); // 5.4：冰块覆层要盖在糖果之上
    drawRings(ctx, scene, field);
    if (scene.banner) drawBanner(ctx, field, scene.banner); // 5.5：死局重排前的明确提示
    drawHud(ctx, { sizePx: scene.sizePx, hudHeight: cache.layout.hudHeight, hud: scene.hud });
    return { ...empty, ...(scene.overlay ? drawGameOver(ctx, field, scene.overlay) : null) };
  }

  return { prepare, draw };
}

/** 静态图层：背景 + HUD 底 + 棋盘区底。一帧内不变，烘焙后每帧只 drawImage 一次（红线 2）。 */
function buildChrome(sizePx, dpr, layout) {
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(sizePx * dpr);
  canvas.height = Math.round(sizePx * dpr);
  const ctx = canvas.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  roundRectPath(ctx, 0, 0, sizePx, sizePx, sizePx * BACKDROP_RADIUS_RATIO);
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fill();
  for (const box of hudCells(sizePx, layout.hudHeight)) {
    roundRectPath(ctx, box.x, box.y, box.w, box.h, box.h * 0.22);
    ctx.fillStyle = hudCellBackground();
    ctx.fill();
  }
  const { x, y, side } = layout.field;
  roundRectPath(ctx, x, y, side, side, side * FIELD_RADIUS_RATIO);
  ctx.fillStyle = FIELD_COLOR;
  ctx.fill();
  // 格位槽：给棋盘「底盘格子」的观感（参考项目棋盘语言的零素材复刻）。
  // 64 次路径绘制只发生在布局时（prepare），烘焙后每帧只 1 次 drawImage（红线 2）。
  const cell = side / CONFIG.BOARD_SIZE;
  const inset = cell * SLOT_INSET_RATIO;
  ctx.fillStyle = SLOT_COLOR;
  for (let r = 0; r < CONFIG.BOARD_SIZE; r += 1) {
    for (let c = 0; c < CONFIG.BOARD_SIZE; c += 1) {
      roundRectPath(ctx, x + c * cell + inset, y + r * cell + inset, cell - inset * 2, cell - inset * 2, cell * SLOT_RADIUS_RATIO);
      ctx.fill();
    }
  }
  return canvas;
}

// ---------------------------------------------------------------------------
// 每帧绘制
// ---------------------------------------------------------------------------

/** 棋盘层：静止格贴图；下落格按缓动插值；正在消除的格子缩小淡出；空/纯障碍格不画（Step 11）。 */
function drawCandies(ctx, cache, scene, field) {
  const cell = cache.cellCss;
  const board = scene.board;
  const cols = CONFIG.BOARD_SIZE;

  for (let r = 0; r < cols; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const item = board[r][c];
      if (item.color === null || item.color === undefined) continue;
      const key = `${r},${c}`;
      if (scene.clearing && scene.clearing.keys.has(key)) continue; // 交给下面的「消除中」分支
      if (scene.hidden && scene.hidden.has(key)) continue; // 下落阶段：这一格已被消除

      const move = scene.falling ? scene.falling.moves.get(item.id) : undefined;
      let row = r;
      let col = c;
      if (move) {
        const t = scene.falling.progress * scene.falling.progress; // 重力感：先慢后快
        row = move.from.r + (move.to.r - move.from.r) * t;
        col = move.from.c + (move.to.c - move.from.c) * t;
      }
      blit(ctx, spriteFor(cache, item), field.x + col * cell, field.y + row * cell, cell, 1, 1);
    }
  }

  if (scene.clearing) {
    // 消除动画（15 节 200-300ms）：缩小 + 淡出；颜色从「消除前」的棋盘上读，无需额外缓存
    const scale = 1 - 0.55 * scene.clearing.progress;
    const alpha = 1 - scene.clearing.progress;
    for (const key of scene.clearing.keys) {
      const comma = key.indexOf(',');
      const r = Number(key.slice(0, comma));
      const c = Number(key.slice(comma + 1));
      const item = board[r]?.[c];
      if (!item || item.color === null || item.color === undefined) continue;
      blit(ctx, spriteFor(cache, item), field.x + c * cell, field.y + r * cell, cell, scale, alpha);
    }
  }
}

/**
 * 收集物层（Step 14，3.6 的水果关 / 金豆荚关）：水果与金豆荚是**占格的不透明精灵**，
 * 与糖果同一套下落插值（按 `cell.id` 从 `scene.falling.moves` 取轨迹），因此「金豆荚每次只下落 1 格」
 * 的节奏在画面上是可见的（规则在 board.applyGravity，渲染只负责表现）。
 * 收集物不会被消除，故不参与 `scene.clearing` 的缩放淡出分支。
 */
function drawCollectibles(ctx, cache, scene, field) {
  const cell = cache.cellCss;
  const board = scene.board;
  for (let r = 0; r < board.length; r += 1) {
    for (let c = 0; c < board[r].length; c += 1) {
      const item = board[r][c];
      const sprite = cache.collectibles?.[item.collectible];
      if (!sprite) continue;

      const move = scene.falling ? scene.falling.moves.get(item.id) : undefined;
      let row = r;
      let col = c;
      if (move) {
        const t = scene.falling.progress * scene.falling.progress; // 与糖果同一条重力缓动
        row = move.from.r + (move.to.r - move.from.r) * t;
        col = move.from.c + (move.to.c - move.from.c) * t;
      }
      ctx.drawImage(sprite, field.x + col * cell, field.y + row * cell, cell, cell);
    }
  }
}

/**
 * 障碍物层（Step 11；3.4 与 5.4）：冰块是**半透明覆层**（冰里的动物仍要看得见，故画在糖果之上）、
 * 雪块/巧克力是**不透明占格**（格内没有动物）、藤蔓是**半透明覆层**（Step 13 起）。层数角标已在
 * candy.js 的精灵里烘焙，这里只做贴图：每格一次 drawImage，不产生逐帧文本绘制（15 节「单帧 ≤ 200 次」）。
 * 四种障碍共用同一条查表路径：`cache.obstacles[type]` 缺表或空数组才跳过（不再按类型写死跳过）。
 */
function drawObstacles(ctx, cache, scene, field) {
  const cell = cache.cellCss;
  const board = scene.board;
  const cols = CONFIG.BOARD_SIZE;
  for (let r = 0; r < cols; r += 1) {
    for (let c = 0; c < cols; c += 1) {
      const item = board[r][c];
      if (!item || item.obstacle === null || item.obstacle === undefined) continue;
      const set = cache.obstacles[item.obstacle];
      if (!set || set.length === 0) continue;
      const layers = Math.min(Math.max(Math.trunc(item.obstacleLayers) || 1, 1), set.length);
      ctx.drawImage(set[layers - 1], field.x + c * cell, field.y + r * cell, cell, cell);
    }
  }
}

/** 按格子的 color/type/direction 选精灵：三种特殊元素各用自己的精灵（Step 7/8/9）。 */
function spriteFor(cache, item) {
  const set = cache.sprites[item.color % cache.sprites.length];
  if (item.type === CELL_TYPE.STRIPED) {
    return item.direction === DIRECTION.V ? set.stripedV : set.stripedH;
  }
  if (item.type === CELL_TYPE.WRAPPED) return set.wrapped;
  if (item.type === CELL_TYPE.MAGIC) return set.magic;
  return set.normal;
}

/** 贴图；scale ≠ 1 时以格心为中心缩放（消除动画用）。 */
function blit(ctx, sprite, x, y, cell, scale, alpha) {
  ctx.globalAlpha = alpha;
  if (scale === 1) {
    ctx.drawImage(sprite, x, y, cell, cell);
  } else {
    const size = cell * scale;
    const offset = (cell - size) / 2;
    ctx.drawImage(sprite, x + offset, y + offset, size, size);
  }
  ctx.globalAlpha = 1;
}

function drawRings(ctx, scene, field) {
  const cell = field.side / CONFIG.BOARD_SIZE;
  for (const pos of scene.matched) {
    strokeRing(ctx, field, pos, cell * MATCH_RING_RATIO, cell * 0.09, MATCH_RING_COLOR);
  }
  if (scene.selected) {
    strokeRing(ctx, field, scene.selected, cell * SELECT_RING_RATIO, cell * 0.06, SELECT_RING_COLOR);
  }
}

function strokeRing(ctx, field, pos, radius, lineWidth, color) {
  const cell = field.side / CONFIG.BOARD_SIZE;
  ctx.beginPath();
  ctx.arc(field.x + (pos.c + 0.5) * cell, field.y + (pos.r + 0.5) * cell, radius, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.lineWidth = lineWidth;
  ctx.stroke();
}

function readSafeInset(side) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(`--safe-${side}`);
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}
