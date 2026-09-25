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
import { buildCollectibleAtlas, buildObstacleAtlas, buildParticleAtlas, buildSpriteAtlas, roundRectPath } from './candy.js';
import { HUD_RATIO, drawBanner, drawFloats, drawGameOver, drawHud, hudCardStyle, hudCellBackground, hudCells } from './hud.js';

// 渲染常量：只影响观感，不参与游戏规则（归属取舍见 D013）
const MAX_DPR = 3; // 后备缓冲上限：高 DPR 机型不做无意义的 4× 过度绘制
// Step 23（满屏竖版配比）：`BOARD_MARGIN` 的语义从「画布到屏幕边缘」改成「**棋盘到画布两侧**」，
// 并由 16 → 10 —— 棋盘因此能吃掉更多屏宽（390px 宽上 370px，格边长 38.9 → 46.25px，+19%）。
const BOARD_MARGIN = 10;
const MAX_BOARD_PX = 720; // 平板/桌面上不让棋盘无限放大
// Step 23：HUD 与棋盘之间的留白，占「棋盘下方剩余空间」的比例（其余留给底部托盘）。
const BOARD_TOP_SHARE = 0.3;
const BACKDROP_RADIUS_RATIO = 0.035; // 画布圆角 / 画布较短边
const FIELD_RADIUS_RATIO = 0.03; // 棋盘区圆角 / 棋盘边长
const SLOT_INSET_RATIO = 0.06; // 格位槽相对格子的内缩比例
const SLOT_RADIUS_RATIO = 0.18; // 格位槽圆角 / 格子边长
const MATCH_RING_RATIO = 0.44; // 匹配高亮环半径 / 格子边长
const SELECT_RING_RATIO = 0.43; // 选中环半径 / 格子边长
const BACKDROP_COLOR = '#1b1830';
const FIELD_COLOR = '#221d38';
const SLOT_COLOR = 'rgba(255, 255, 255, 0.045)'; // 格位槽底色（红线 3：≤ 0.1 的修饰性底色）
// Step 23：棋盘底下的「托盘」与底部装饰带 —— 把原本属于空白的下半个屏幕变成有结构的底座。
// 两者都是**布局期烘焙一次的几何填充**（零素材、零模糊、零每帧渐变）。
const TRAY_PAD_RATIO = 0.03; // 托盘相对棋盘边长的外扩
const TRAY_COLOR = 'rgba(255, 255, 255, 0.035)';
const TRAY_EDGE_COLOR = 'rgba(255, 255, 255, 0.07)'; // 台面上沿的 1px 高光（几何描边）
const BOTTOM_BAND_TOP = 'rgba(255, 196, 140, 0.06)'; // 棋盘下方落下的暖光（自棋盘底边向下渐隐）
const BOTTOM_BAND_BOTTOM = 'rgba(255, 196, 140, 0)';
const MATCH_RING_COLOR = 'rgba(255, 246, 180, 0.95)';
const SELECT_RING_COLOR = 'rgba(255, 255, 255, 0.85)';
// Step 17（v1.27）：粒子种类 → 精灵形状（外观方案 A：三类强度由颗数与形状共同表达）
const PARTICLE_SHAPE_OF = { clear: 'dot', striped: 'shard', wrapped: 'star', magic: 'star', combo: 'star' };

/**
 * **Step 23：画布尺寸（CSS 像素）—— 满屏竖版。**
 * 宽 = 视口宽（扣掉左右安全区），高 = 视口高（扣掉上下安全区与画布外的道具条）。
 * 这样「对局页」和「藤蔓地图页（`#map` 是 `inset: 0` 的绝对定位层）」一样铺满整屏，
 * 不再是浮在屏幕正中的一块正方形卡片；棋盘区仍是正方形（5.2），它只是画布里的一块 —— 见 `boardRect`。
 */
export function computeCanvasSize() {
  const root = document.documentElement;
  const viewportW = root.clientWidth || window.innerWidth;
  const viewportH = root.clientHeight || window.innerHeight;
  const w = viewportW - readSafeInset('left') - readSafeInset('right');
  // Step 15（v1.20 / 3.9）：道具条是画布外的 DOM 元素，它的高度必须从画布高度里扣掉，
  // 否则画布会与道具条重叠（`--booster-bar-h` 是两边唯一的真相源）。
  const h = viewportH - readSafeInset('top') - readSafeInset('bottom') - readCssPx('--booster-bar-h');
  return { w: Math.max(1, Math.floor(w)), h: Math.max(1, Math.floor(h)) };
}

/**
 * **Step 23：画布内的分区几何** —— 顶部**满宽 HUD 带** + **正方形棋盘区** + 底部托盘留白。
 * `hudHeight` 现在是**画布高**的比例（`HUD_RATIO`），不再是棋盘边长的比例：
 * HUD 从「被棋盘宽度卡住的一条 47px」变成「跟着屏高走的 ~123px」，这才放得下目标与进度条。
 * 棋盘区取「可用宽 / 可用高 / `MAX_BOARD_PX`」的较小者 —— 手机上仍是**宽度受限**（370px），
 * 剩下的纵向余量按 `BOARD_TOP_SHARE` 分给 HUD 下方与底部托盘。
 */
export function boardRect(canvas) {
  const hudHeight = Math.round(canvas.h * HUD_RATIO);
  const availW = canvas.w - BOARD_MARGIN * 2;
  const availH = canvas.h - hudHeight - BOARD_MARGIN * 2;
  const side = Math.max(1, Math.min(availW, availH, MAX_BOARD_PX));
  const slack = Math.max(0, availH - side);
  return {
    hudHeight,
    field: {
      x: Math.round((canvas.w - side) / 2),
      y: Math.round(hudHeight + BOARD_MARGIN + slack * BOARD_TOP_SHARE),
      side
    }
  };
}

/** 屏幕坐标 → 棋盘格；落在棋盘区外返回 null。 */
export function cellAt(canvas, clientX, clientY, canvasSize) {
  const rect = canvas.getBoundingClientRect();
  if (rect.width === 0 || rect.height === 0) return null;
  const area = boardRect(canvasSize).field;
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

  function prepare(canvas, dpr, layout) {
    cache = {
      canvas,
      layout,
      cellCss: layout.field.side / CONFIG.BOARD_SIZE,
      chrome: buildChrome(canvas, dpr, layout),
      sprites: buildSpriteAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr),
      obstacles: buildObstacleAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr), // Step 11：冰块/雪块
      collectibles: buildCollectibleAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr), // Step 14：水果/金豆荚
      particles: buildParticleAtlas(layout.field.side / CONFIG.BOARD_SIZE, dpr) // Step 17：粒子精灵（3 形状 × 6 色）
    };
  }

  function draw(ctx, scene) {
    const empty = { restartRect: null, nextRect: null, selectRect: null };
    const size = scene.canvas; // Step 23：{w,h}（满屏竖版），不再是单个正方形边长
    if (!cache || !size || cache.canvas.w !== size.w || cache.canvas.h !== size.h) return empty;
    const { field } = cache.layout;
    ctx.clearRect(0, 0, size.w, size.h);
    ctx.drawImage(cache.chrome, 0, 0, size.w, size.h); // 静态图层：1 次 drawImage

    drawCandies(ctx, cache, scene, field);
    drawCollectibles(ctx, cache, scene, field); // 3.6（v1.19）：水果/金豆荚占格、独立于糖果绘制
    drawObstacles(ctx, cache, scene, field); // 5.4：冰块覆层要盖在糖果之上
    drawParticles(ctx, cache, scene, field); // Step 17：粒子在障碍之上、环与 HUD 之下
    drawRings(ctx, scene, field);
    if (scene.banner) drawBanner(ctx, field, scene.banner); // 5.5：死局重排前的提示 / 21.1 的连击文案
    if (scene.floats?.length) drawFloats(ctx, field, scene.floats, scene.nowMs ?? 0); // 21.1：分数飘字
    drawHud(ctx, { canvasW: size.w, hudHeight: cache.layout.hudHeight, hud: scene.hud, nowMs: scene.nowMs ?? 0 });
    return { ...empty, ...(scene.overlay ? drawGameOver(ctx, field, scene.overlay) : null) };
  }

  return { prepare, draw };
}

// 21.1（D048）：HUD 卡片的烘焙材质。纯观感常量按 D013 就地，不进规则层。
const CARD_SHADOW_COLOR = 'rgba(6, 4, 14, 0.45)';
const CARD_HIGHLIGHT_COLOR = 'rgba(255, 255, 255, 0.1)';
// P2：棋盘暖色环境光 —— 竖直渐变 + 加色混合，天花板上洒下来的一层暖光。
// 三段的量级是算好的：顶部在 `#221d38`(34,29,56) 上叠加 ≈ (22,15,9) ⇒ R−B 由 −22 抬到 ≈ −9、
// 亮度仍只有 ≈ 55（暗盘没被洗白、糖果依旧跳出来）；底部只剩 ≈ (8,5,3) ⇒ 上暖下冷的方向感。
const AMBIENT_LIGHT_TOP = 'rgba(255, 178, 108, 0.085)';
const AMBIENT_LIGHT_MID = 'rgba(255, 172, 100, 0.05)';
const AMBIENT_LIGHT_BOTTOM = 'rgba(255, 166, 94, 0.03)';

/** 静态图层：整屏底板 + 满宽 HUD 卡片 + 棋盘托盘 + 棋盘区底 + 64 个格位槽 + 暖色环境光 + 底部装饰带。
 *  一帧内不变，烘焙后每帧只 drawImage 一次（红线 2；Step 23 起画布是**满屏竖版**）。 */
function buildChrome(canvas, dpr, layout) {
  const out = document.createElement('canvas');
  out.width = Math.round(canvas.w * dpr);
  out.height = Math.round(canvas.h * dpr);
  const ctx = out.getContext('2d');
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

  // Step 23：整块画布裁剪在圆角内 —— 台面与底部装饰带会铺到画布边缘，必须被同一个圆角裁掉
  ctx.save();
  roundRectPath(ctx, 0, 0, canvas.w, canvas.h, Math.min(canvas.w, canvas.h) * BACKDROP_RADIUS_RATIO);
  ctx.clip();
  // ① 整屏底板（画布本身就是游戏屏幕）
  ctx.fillStyle = BACKDROP_COLOR;
  ctx.fill();
  // 21.1（D048）：HUD **卡片化** —— 投影 + 卡片渐变 + 顶部内嵌高光。
  // 全部只在**布局期**烘焙一次；运行期依旧零阴影模糊类 API（`shadow*` 系列）、零渐变（15 节红线 / D043 / D044）。
  const card = hudCardStyle();
  for (const box of hudCells(canvas.w, layout.hudHeight)) {
    const radius = box.h * card.radiusRatio;
    roundRectPath(ctx, box.x, box.y + box.h * 0.06, box.w, box.h, radius);
    ctx.fillStyle = CARD_SHADOW_COLOR;
    ctx.fill();
    roundRectPath(ctx, box.x, box.y, box.w, box.h, radius);
    const gradient = ctx.createLinearGradient(0, box.y, 0, box.y + box.h);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 0.12)');
    gradient.addColorStop(1, hudCellBackground());
    ctx.fillStyle = gradient;
    ctx.fill();
    roundRectPath(ctx, box.x + box.w * 0.12, box.y + box.h * 0.06, box.w * 0.76, Math.max(1, box.h * card.highlightRatio * 0.5), box.h * 0.06);
    ctx.fillStyle = CARD_HIGHLIGHT_COLOR;
    ctx.fill();
  }
  const { x, y, side } = layout.field;
  // ② Step 23：**棋盘台面** —— 从棋盘上方一点一直铺到画布底部的一块浅色圆角台面，棋盘坐在它上面。
  //    这样「HUD 之下、棋盘左右与下方」的那 ~20% 屏高是**有结构的地面**，而不是一片空白；
  //    底部刻意多铺 24px，让下沿的两个圆角落在画布之外（只露上沿圆角）。
  const trayPad = side * TRAY_PAD_RATIO;
  const platformTop = y - trayPad;
  roundRectPath(ctx, 0, platformTop, canvas.w, canvas.h - platformTop + 24, side * (FIELD_RADIUS_RATIO + 0.012));
  ctx.fillStyle = TRAY_COLOR;
  ctx.fill();
  // 台面上沿的一道细高光（纯几何描边 1px；零模糊、零阴影）
  ctx.beginPath();
  ctx.moveTo(0, platformTop + 0.5);
  ctx.lineTo(canvas.w, platformTop + 0.5);
  ctx.lineWidth = 1;
  ctx.strokeStyle = TRAY_EDGE_COLOR;
  ctx.stroke();
  // ③ 棋盘区底
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
  // ④ P2（用户评审「深色棋盘看久了累」）：**极淡的暖色环境光**，从画布顶部洒下来。
  // 一盏「室内暖灯」从棋盘上方落下来（竖直渐变 + **加色混合**），给偏冷的暗紫台面补上一点环境暖色；
  // 用加色而不是覆盖，格位槽自己的层次一分不减。Step 23 起它的跨度是**整块画布**（不再只罩棋盘区），
  // 于是 HUD 与底部台面也一并带上环境色。整块只在**布局期**烘焙一次（红线 2：零每帧渐变），
  // 纯几何渐变、**不含任何模糊滤镜**（D043/D044）；外面已经裁剪在画布圆角内。
  ctx.globalCompositeOperation = 'lighter';
  const warm = ctx.createLinearGradient(0, 0, 0, canvas.h);
  warm.addColorStop(0, AMBIENT_LIGHT_TOP);
  warm.addColorStop(0.55, AMBIENT_LIGHT_MID);
  warm.addColorStop(1, AMBIENT_LIGHT_BOTTOM);
  ctx.fillStyle = warm;
  ctx.fillRect(0, 0, canvas.w, canvas.h);
  // ⑤ Step 23：**底部暖光带** —— 棋盘下沿往下渐隐的一条暖光，暗示「下面是台面/道具区」，
  //    和画布外的道具条视觉相接。同一条烘焙原则：纯几何渐变、只画一次。
  const bandTop = platformTop + side + trayPad * 2;
  if (bandTop < canvas.h - 1) {
    const band = ctx.createLinearGradient(0, bandTop, 0, canvas.h);
    band.addColorStop(0, BOTTOM_BAND_TOP);
    band.addColorStop(1, BOTTOM_BAND_BOTTOM);
    ctx.fillStyle = band;
    ctx.fillRect(0, bandTop, canvas.w, canvas.h - bandTop);
  }
  ctx.globalCompositeOperation = 'source-over';
  ctx.restore();
  return out;
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

/**
 * Step 17（v1.27）：粒子贴图。`scene.particles` 是 `particles.js` 的**只读快照**
 * （已按 `PARTICLE_CONFIG.maxPerFrame` 截断，最多 96 项），本函数只做 `drawImage`：
 * 每颗一次调用、无路径重建、无渐变、无阴影模糊类 API（REFERENCES.md §3.5 红线 1）。
 * 坐标快照以「棋盘格」为单位（原点 = 棋盘左上角），因此这里乘 `cellPx` 再加棋盘区偏移。
 * 旋转用 `ctx.translate/rotate` 施加（图集里精灵一律正放）。
 */
function drawParticles(ctx, cache, scene, field) {
  const list = scene.particles;
  if (!list || list.length === 0 || !cache.particles) return;
  const cell = cache.cellCss;
  for (const particle of list) {
    const set = cache.particles[PARTICLE_SHAPE_OF[particle.kind] ?? PARTICLE_SHAPE_OF.clear];
    if (!set) continue;
    const sprite = set[particle.color % set.length];
    const size = Math.max(1, particle.size * cell); // size 是「直径（格）」
    if (particle.rot) {
      ctx.save();
      ctx.globalAlpha = particle.alpha;
      ctx.translate(field.x + particle.x * cell, field.y + particle.y * cell);
      ctx.rotate(particle.rot);
      ctx.drawImage(sprite, -size / 2, -size / 2, size, size);
      ctx.restore();
    } else {
      ctx.globalAlpha = particle.alpha;
      ctx.drawImage(sprite, field.x + particle.x * cell - size / 2, field.y + particle.y * cell - size / 2, size, size);
    }
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

/** 读取一个 CSS 长度型自定义属性（如 `--booster-bar-h`）；取不到时按 0 处理（不阻断布局）。 */
function readCssPx(name) {
  const raw = getComputedStyle(document.documentElement).getPropertyValue(name);
  const px = Number.parseFloat(raw);
  return Number.isFinite(px) ? px : 0;
}
