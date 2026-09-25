// hud.js — HUD 与结束面板的绘制。见 AGENTS.md 2.2 / 2.3 / 5.4 / 5.5。
//
// 边界（2.3）：只接收「场景描述」（分数 / 剩余步数 / 最高分、结束面板数据），
// 不读游戏状态、不碰 localStorage、不绑事件。
// 与 render.js 的关系：render.js 负责棋盘层、本文件负责信息层；render.js **单向**依赖本文件
// （需要 HUD_RATIO / hudCells 来烘焙静态图层）。为避免 render ↔ hud 形成模块环，
// 圆角矩形路径在本文件就地实现一份（10 行纯几何），不反向 import render.js。
//
// Step 21.1（v1.31 / D048）：HUD「果汁感」—— 目标进度条（含达标闪烁）、步数 ≤5 的心跳缩放、
// 分数向上飘字、连击文案。**纯信息层观感**：所有数值只影响绘制；飘字池是纯函数（有界 / 按时间回收 /
// 偏移确定性）；动效只由传入的 `nowMs` 与 `HUD_CONFIG` 的周期键决定（不使用运行时随机）。

import { CONFIG } from './config.js';

/**
 * **Step 23：HUD 带高 / 画布高**（原来是「HUD 带高 / 棋盘边长」）。
 * 配比口径从「被棋盘宽度卡住」改成「跟着屏高走」：390×844 上画布高 744 ⇒ HUD **123px（14.6% 屏高）**，
 * 与真实竖屏手游的顶部 HUD（15–20%）同一档；原来只有 47px（5.6%）。
 */
export const HUD_RATIO = 0.165;
// 低步数 / 低时间的**阈值**：`heartbeatScale` 与 `drawHud` 共用这两个常量，避免两处判定漂移。
export const HUD_LOW_STEPS = 5; // 剩余步数 ≤ 此值：**红色警告 + 心跳**（P0-2，用户 2026-09-26）
export const HUD_LOW_TIME = 10; // 剩余秒数 ≤ 此值：同一条警告路径（3.6 v1.18 的时间关）
const HUD_CELL_BG = 'rgba(255, 255, 255, 0.06)'; // 修饰性底色；透明度 ≤ 0.1（REFERENCES §3.5 红线 3）
const HUD_LABEL_COLOR = 'rgba(255, 255, 255, 0.55)';
const HUD_VALUE_COLOR = '#ffffff';
/** P0-2：低步数警告色改为**红**（原来是品牌金 `#ffd93b`，与「达标闪烁」「进度条填充」撞色，
 *  玩家读不出「危险」）。现在金色只用于正向反馈，红色只用于预警，语义不再重叠。 */
export const HUD_WARN_COLOR = '#ff4d5e';
const HUD_WARN_FRAME = 'rgba(255, 77, 94, 0.85)'; // 低步数时套在步数格外的警示边框
const HUD_WARN_RING = 'rgba(255, 77, 94, 0.30)'; // 心跳时向外扩散的一圈（几何描边，不是模糊）
const OVERLAY_DIM = 'rgba(10, 8, 20, 0.78)';
const OVERLAY_PANEL = '#241f3a';
const OVERLAY_TITLE_COLOR = '#ffffff';
const OVERLAY_RECORD_COLOR = '#ffd93b';
// 第三轮视觉评审（用户 P0）：结算按钮的**游戏内语言** —— 亮金主按钮（果冻）+ 深灰次按钮，
// 各自带「顶部内嵌高光 + 厚底边」。旧的荧光洋红 `#ff4fd8` 退役（它与深色糖果 UI 体系割裂，
// 当初选它只是为了「不与糖果撞色、便于程序化验证」——那属于测试便利，不该决定产品外观）。
const BUTTON_PRIMARY = { base: '#ffc93b', edge: '#b8801a', gloss: 'rgba(255, 255, 255, 0.42)', text: '#3a2605' };
const BUTTON_SECONDARY = { base: '#3a3352', edge: '#1d1830', gloss: 'rgba(255, 255, 255, 0.16)', text: '#e8e6f0' };
const GOAL_DONE_COLOR = '#4ecb71'; // 已完成的目标分项（与糖果绿色同为调色板内的绿）
const BANNER_BG = 'rgba(20, 16, 34, 0.92)';
const BANNER_TEXT_COLOR = '#ffe9a8';
const FONT_STACK = 'system-ui, -apple-system, "PingFang SC", "Microsoft YaHei", sans-serif';
// Step 21.1（D048）：进度条 / 飘字的配色与文案。纯观感常量按 D013 留在模块内（不进规则层）。
const PROGRESS_FILL = '#ffd93b';
const PROGRESS_DONE = '#4ecb71';
const PROGRESS_DONE_FLASH = '#ffe9a8';
const PROGRESS_TRACK = 'rgba(255, 255, 255, 0.14)';
const FLOAT_COLOR = '#ffe9a8';
const FLOAT_OUTLINE = 'rgba(28, 22, 48, 0.85)';
// 连击文案：第 3 / 4 / 5+ 层各一句（`comboText` 是纯函数，可在 Node 里测）
const COMBO_TEXTS = ['太棒了！', '干得好！', '不可思议！'];
const COMBO_FROM_LEVEL = 2; // 级联层下标 ≥ 2（= 第 3 层）起显示连击文案
// Step 24（v1.38 / D052）：彩星标记的配色（五角星按**五个角**分色，纯几何填充、无渐变）。
const RAINBOW_COLORS = ['#ff5f6d', '#ffb340', '#ffe14d', '#4ecb71', '#a06bff'];
const RAINBOW_LABEL_COLOR = '#ffe9a8';

/** HUD 四个信息格的位置（静态图层与文字共用，避免两处各算一遍）。v1.14：3 格 → 4 格（5.5）。
 *  Step 23：横向按**画布宽**（满宽 HUD 带）、纵向按**HUD 带高**摊开 —— 卡片因此接近正方形。 */
export function hudCells(canvasW, hudHeight) {
  const pad = hudHeight * 0.18;
  const gap = hudHeight * 0.08;
  const w = (canvasW - pad * 2 - gap * 3) / 4;
  const h = hudHeight - pad * 2;
  return [0, 1, 2, 3].map((index) => ({ x: pad + index * (w + gap), y: pad, w, h }));
}

/** HUD 底色（静态图层的一部分，由 render.js 烘焙；这里只提供几何与颜色）。 */
export function hudCellBackground() {
  return HUD_CELL_BG;
}

/** HUD 卡片的烘焙参数（render.js 在布局期用；本文件不画卡片，只提供数值）。21.1 / D048 */
export function hudCardStyle() {
  const cfg = CONFIG.HUD_CONFIG;
  return { radiusRatio: cfg.cardRadius, highlightRatio: cfg.cardHighlight };
}

/**
 * 目标分项（**数值形态**）：目标进度条与文本共用同一份推导。
 * 纯函数 —— 只读传入的场景描述，不认识棋盘状态（2.3），可在 Node 里逐项测。
 * `text` 与 v1.14 的 5.5 文案逐字一致（`分数 3200/7000`、`冰 5/12`、`frog 8/12`…）。
 */
export function goalEntries(hud) {
  const goal = hud?.goal ?? null;
  if (!goal) return [];
  const collected = hud.collected ?? {};
  const entries = [];
  const push = (label, value, target) => {
    const current = Number.isFinite(Number(value)) ? Number(value) : 0;
    const need = Number.isFinite(Number(target)) ? Number(target) : 0;
    entries.push({ label, value: current, target: need, done: current >= need, text: `${label ? `${label} ` : ''}${current}/${need}` });
  };
  if (goal.type === 'score') push('', hud.score, goal.target);
  if (goal.type === 'clearIce') push('冰', hud.clearedIce ?? 0, goal.target);
  // 3.6（v1.18）：水果关/金豆荚关的进度就是「已收到几个」
  if (goal.type === 'fruit') push('水果', hud.collectedFruit ?? 0, goal.target);
  if (goal.type === 'pod') push('豆荚', hud.collectedPod ?? 0, goal.target);
  if (goal.type === 'collect' || goal.type === 'mixed') {
    const targets = goal.type === 'collect' ? goal.targets : goal.collect;
    for (const [name, need] of Object.entries(targets ?? {})) push(name, collected[name] ?? 0, need);
  }
  if (goal.type === 'mixed') {
    if (goal.score !== undefined) push('', hud.score, goal.score);
    if (goal.clearIce !== undefined) push('冰', hud.clearedIce ?? 0, goal.clearIce);
  }
  return entries;
}

/** 主进度（进度条用）：优先第一个**未完成**的分项；全完成则取最后一项（于是条子显示满格）。 */
export function goalProgress(hud) {
  const entries = goalEntries(hud);
  if (entries.length === 0) return { has: false, ratio: 0, done: false, text: '' };
  const primary = entries.find((entry) => !entry.done) ?? entries[entries.length - 1];
  const ratio = primary.target > 0 ? Math.min(1, Math.max(0, primary.value / primary.target)) : 1;
  return { has: true, ratio, done: primary.done, text: primary.text };
}

/** 心跳缩放（步数 ≤5 或时间 ≤10s）：只由 `nowMs` 与周期键决定 —— 纯函数、无随机。 */
export function heartbeatScale(steps, remainingTime, timeLimit, nowMs) {
  const cfg = CONFIG.HUD_CONFIG;
  const timed = Number.isFinite(timeLimit) && timeLimit > 0;
  const low = timed ? (Number(remainingTime) || 0) <= HUD_LOW_TIME : (Number(steps) || 0) <= HUD_LOW_STEPS;
  if (!low) return 1;
  const phase = ((Number(nowMs) || 0) % cfg.lowStepsPulseMs) / cfg.lowStepsPulseMs;
  const wave = (1 - Math.cos(phase * Math.PI * 2)) / 2; // 0 → 1 → 0
  return 1 + (cfg.lowStepsScale - 1) * wave;
}

/** 目标达成后的闪烁因子（0..1）：进度条用它在「亮金 ↔ 完成绿」之间闪。 */
export function flashFactor(done, nowMs) {
  if (!done) return 0;
  const phase = ((Number(nowMs) || 0) % CONFIG.HUD_CONFIG.progressFlashMs) / CONFIG.HUD_CONFIG.progressFlashMs;
  return (1 - Math.cos(phase * Math.PI * 2)) / 2;
}

/** 连击文案（第 3 / 4 / 5+ 层）：纯函数，返回 `null` 表示这一层不弹。 */
export function comboText(levelIndex) {
  const index = Math.trunc(Number(levelIndex));
  if (!Number.isFinite(index) || index < COMBO_FROM_LEVEL) return null;
  return COMBO_TEXTS[Math.min(index - COMBO_FROM_LEVEL, COMBO_TEXTS.length - 1)];
}

/** HUD 常驻信息（5.5 / v1.14）：分数 / 剩余步数 / 关卡目标进度 / 最高分。
 *  v1.19：时间关**没有步数**，第二格改显示剩余时间（3.6 第 8 条 + 5.5）。
 *  Step 21.1（D048）：目标格加**进度条**（含达标闪烁）、步数/时间低值时**心跳缩放**；
 *  `nowMs` 只驱动这两个动效（不参与任何判定，缺省 0 也能画出静止态）。 */
export function drawHud(ctx, { canvasW, hudHeight, hud, nowMs = 0 }) {
  const boxes = hudCells(canvasW, hudHeight);
  const timed = Number.isFinite(hud.timeLimit) && hud.timeLimit > 0;
  const low = timed ? (hud.remainingTime ?? 0) <= HUD_LOW_TIME : hud.steps <= HUD_LOW_STEPS;
  const pulse = heartbeatScale(hud.steps, hud.remainingTime, hud.timeLimit, nowMs);
  const stats = [
    { label: '分数', value: String(hud.score) },
    timed
      ? { label: '时间', value: `${Math.max(0, Math.ceil(hud.remainingTime ?? 0))}s`, warn: low, pulse }
      : { label: '步数', value: String(hud.steps), warn: low, pulse },
    { label: '目标', lines: goalLines(hud), bar: goalProgress(hud) },
    { label: '最高分', value: String(hud.best) }
  ];
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  // Step 23：HUD 带由 47px 涨到 ~123px，字号不再写死比例，而是「先按带高给目标字号、
  // 再用 `fitSize` 压到卡片宽度以内」—— 分数/最高分是 4~7 位数，放不下时必须缩，不许溢出卡片。
  const labelWant = Math.max(10, Math.round(hudHeight * 0.17));
  const valueWant = Math.max(13, Math.round(hudHeight * 0.3));
  boxes.forEach((box, index) => {
    const stat = stats[index];
    const cx = box.x + box.w / 2;
    ctx.font = `500 ${fitSize(ctx, stat.label, box.w * 0.92, labelWant, 500)}px ${FONT_STACK}`;
    ctx.fillStyle = HUD_LABEL_COLOR;
    ctx.fillText(stat.label, cx, box.y + box.h * (stat.lines ? 0.17 : 0.25));

    if (stat.lines) {
      // 目标格最多两行（v1.14 的 5.5 口径）+ 底部进度条（21.1）。
      // Step 23：文本区的上下界与行距**按卡片高算**（原来用固定比例，HUD 一加高两行就会互相压住、
      // 也会压到底部进度条），行号间均分，字号再取「行距 × 0.78」与「带高比例」的较小者。
      const lineCount = stat.lines.length;
      const barH = Math.max(3, Math.round(hudHeight * CONFIG.HUD_CONFIG.progressBarH));
      const textTop = box.y + box.h * 0.28;
      const textBottom = box.y + box.h - (stat.bar?.has ? barH + hudHeight * 0.12 : box.h * 0.08);
      const step = (textBottom - textTop) / lineCount;
      const want = Math.max(9, Math.round(Math.min(hudHeight * 0.26, step * 0.78)));
      stat.lines.forEach((line, i) => {
        ctx.font = `700 ${fitSize(ctx, line.text, box.w * 0.94, want, 700)}px ${FONT_STACK}`;
        ctx.fillStyle = line.done ? GOAL_DONE_COLOR : HUD_VALUE_COLOR;
        ctx.fillText(line.text, cx, textTop + step * (i + 0.5));
      });
      if (stat.bar?.has) drawProgressBar(ctx, box, stat.bar, hudHeight, nowMs);
      return;
    }
    const base = Math.max(12, Math.round(valueWant * (stat.pulse ?? 1)));
    ctx.font = `700 ${fitSize(ctx, stat.value, box.w * 0.94, base, 700)}px ${FONT_STACK}`;
    ctx.fillStyle = stat.warn ? HUD_WARN_COLOR : HUD_VALUE_COLOR;
    ctx.fillText(stat.value, cx, box.y + box.h * 0.65);
    // P0-2：低步数时**在步数格外套一圈红框 + 一圈随心跳扩散的描边**（纯几何、1–2 次描边，
    // 零模糊、零每帧渐变）。心跳波形与字号缩放**同源**（都来自 `heartbeatScale` 的同一 phase）。
    if (stat.warn) drawWarnFrame(ctx, box, hudHeight, stat.pulse ?? 1);
  });
}

/** Step 23：把字号压到「这段文本恰好放得进 `maxWidth`」（只量一次：按宽度比线性缩放，不循环）。 */function fitSize(ctx, text, maxWidth, want, weight) {
  const size = Math.max(8, Math.round(want));
  ctx.font = `${weight} ${size}px ${FONT_STACK}`;
  const measured = ctx.measureText(text).width;
  if (!(measured > maxWidth) || measured <= 0) return size;
  return Math.max(8, Math.floor((size * maxWidth) / measured));
}

/** 低步数/低时间的警示框（P0-2）：`pulse`（1 → lowStepsScale）越大，外圈越远、越淡。 */
function drawWarnFrame(ctx, box, hudHeight, pulse) {
  const inset = Math.max(1.5, hudHeight * 0.035);
  const radius = Math.max(4, hudHeight * 0.12);
  roundRectPath(ctx, box.x + inset, box.y + inset, box.w - inset * 2, box.h - inset * 2, radius);
  ctx.lineWidth = Math.max(1.5, hudHeight * 0.035);
  ctx.strokeStyle = HUD_WARN_FRAME;
  ctx.stroke();
  // 心跳外圈：`pulse` 的归一化位置决定扩散距离与透明度（不新增 PRNG，也不读额外状态）
  const cfg = CONFIG.HUD_CONFIG;
  const t = Math.max(0, Math.min(1, (pulse - 1) / Math.max(0.001, cfg.lowStepsScale - 1)));
  const grow = t * hudHeight * 0.07;
  roundRectPath(ctx, box.x + inset - grow, box.y + inset - grow, box.w - (inset - grow) * 2, box.h - (inset - grow) * 2, radius + grow);
  ctx.lineWidth = Math.max(1, hudHeight * 0.022);
  ctx.strokeStyle = HUD_WARN_RING;
  ctx.stroke();
}

/** 目标进度条（21.1）：1 条轨道 + 1 条填充，共 2 次路径填充，无渐变、无阴影（15 节红线）。 */
function drawProgressBar(ctx, box, progress, hudHeight, nowMs) {
  const height = Math.max(3, Math.round(hudHeight * CONFIG.HUD_CONFIG.progressBarH));
  const width = box.w * 0.82;
  const x = box.x + (box.w - width) / 2;
  const y = box.y + box.h - height - hudHeight * 0.06;
  roundRectPath(ctx, x, y, width, height, height / 2);
  ctx.fillStyle = PROGRESS_TRACK;
  ctx.fill();
  const filled = Math.max(height, width * progress.ratio);
  roundRectPath(ctx, x, y, filled, height, height / 2);
  if (!progress.done) ctx.fillStyle = PROGRESS_FILL;
  else ctx.fillStyle = flashFactor(true, nowMs) > 0.5 ? PROGRESS_DONE_FLASH : PROGRESS_DONE;
  ctx.fill();
}

/**
 * 分数飘字池（21.1）：与 particles.js 同一条思路的**纯逻辑** —— 有界、按时间回收、偏移确定性。
 * `spawnFloat` 返回**新数组**（不改入参），池满时丢最旧的一条（O(1) 语义、永不阻塞）。
 */
export function spawnFloat(pool, text, nowMs) {
  const list = [...(pool ?? [])];
  const index = (list.length > 0 ? list[list.length - 1].index : 0) + 1;
  list.push({ text: String(text), bornAt: Number(nowMs) || 0, index });
  const max = Math.max(1, Math.trunc(CONFIG.HUD_CONFIG.floatMax));
  return list.length > max ? list.slice(list.length - max) : list;
}

/** 丢弃已过期的飘字（存活 `floatLifeMs`）。 */
export function advanceFloats(pool, nowMs) {
  const life = CONFIG.HUD_CONFIG.floatLifeMs;
  const now = Number(nowMs) || 0;
  return (pool ?? []).filter((float) => now - float.bornAt < life);
}

/** 单条飘字的生命进度（0 → 1）。 */
export function floatProgress(float, nowMs) {
  const life = CONFIG.HUD_CONFIG.floatLifeMs;
  return Math.min(1, Math.max(0, (Number(nowMs) - float.bornAt) / life));
}

/** 单条飘字的相对位移：横向按序号取模错开（确定性，**不引入第四份 PRNG**），纵向按进度上升。 */
export function floatOffset(float, nowMs, side) {
  const progress = floatProgress(float, nowMs);
  const dx = ((Math.trunc(float.index) % 3) - 1) * side * 0.06;
  const dy = -side * CONFIG.HUD_CONFIG.floatRiseRatio * progress;
  return { progress, dx, dy };
}

/** 画分数飘字（棋盘区上方，逐条 2 次调用：描边 + 填充）。返回画了几条（供巡检断言）。 */
export function drawFloats(ctx, field, pool, nowMs) {
  if (!ctx || !field || !Array.isArray(pool) || pool.length === 0) return 0;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.font = `700 ${Math.round(field.side * 0.062)}px ${FONT_STACK}`;
  ctx.lineWidth = Math.max(2, field.side * 0.008);
  ctx.strokeStyle = FLOAT_OUTLINE;
  ctx.fillStyle = FLOAT_COLOR;
  let drawn = 0;
  for (const item of pool) {
    const { progress, dx, dy } = floatOffset(item, nowMs, field.side);
    const alpha = progress < 0.15 ? progress / 0.15 : 1 - Math.max(0, (progress - 0.55) / 0.45);
    ctx.globalAlpha = Math.min(1, Math.max(0, alpha));
    const x = field.x + field.side / 2 + dx;
    const y = field.y + field.side * 0.42 + dy;
    ctx.strokeText(item.text, x, y);
    ctx.fillText(item.text, x, y);
    drawn += 1;
  }
  ctx.globalAlpha = 1;
  return drawn;
}

/**
 * 目标进度文本（v1.14 的 5.5）：按目标类型给出「当前值/目标值」，最多两行。
 * 混合目标先显示未完成的分项（更有用），超出两行的部分以 `+N` 提示。
 * 只接收场景数据，不认识棋盘状态 —— 与 hud.js 的边界一致（2.3）。
 */
function goalLines(hud) {
  const entries = goalEntries(hud);
  if (entries.length === 0) return [{ text: '—', done: false }];
  // 混合目标先显示未完成的分项（更有用），超出两行的部分以 `+N` 提示（v1.14 的 5.5 口径）
  const ordered = [...entries.filter((entry) => !entry.done), ...entries.filter((entry) => entry.done)];
  const shown = ordered.slice(0, 2).map((entry) => ({ text: entry.text, done: entry.done }));
  if (ordered.length > shown.length) shown[shown.length - 1].text += ` +${ordered.length - shown.length}`;
  return shown;
}

/**
 * 结束面板（5.5：页面内 UI，禁止 alert）。返回「再来一局」按钮在画布内的命中区域，
 * 供 app.js 做点按判定（本文件不做命中测试，也不认识手势）。
 */
/**
 * 重排提示（5.5：无可行交换时必须给出明确提示，再进行重排）。
 * 画在棋盘区中央的一枚胶囊上，不遮挡 HUD，也不参与任何判定。
 */
export function drawBanner(ctx, field, text) {
  const fontSize = Math.round(field.side * 0.052);
  ctx.font = `700 ${fontSize}px ${FONT_STACK}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const w = Math.min(field.side * 0.92, ctx.measureText(text).width + fontSize * 1.8);
  const h = fontSize * 2.1;
  const x = field.x + (field.side - w) / 2;
  const y = field.y + field.side * 0.5 - h / 2;
  roundRectPath(ctx, x, y, w, h, h * 0.3);
  ctx.fillStyle = BANNER_BG;
  ctx.fill();
  ctx.fillStyle = BANNER_TEXT_COLOR;
  ctx.fillText(text, field.x + field.side / 2, y + h / 2);
}

/**
 * Step 24（v1.38 / D052）：彩星标记 —— 五角星按**五个角**分色（每角一次三角形填充，共 5 次）。
 * 纯几何、静态颜色：没有渐变、没有阴影模糊类 API（D043/D044 的红线对「结束面板」同样适用）。
 */
function drawRainbowStar(ctx, cx, cy, r) {
  for (let i = 0; i < 5; i += 1) {
    const a0 = -Math.PI / 2 + (i * Math.PI * 2) / 5;
    const a1 = a0 + Math.PI / 5;
    const a2 = a0 + (Math.PI * 2) / 5;
    ctx.beginPath();
    ctx.moveTo(cx + Math.cos(a0) * r, cy + Math.sin(a0) * r);
    ctx.lineTo(cx + Math.cos(a1) * r * 0.46, cy + Math.sin(a1) * r * 0.46);
    ctx.lineTo(cx + Math.cos(a2) * r, cy + Math.sin(a2) * r);
    ctx.closePath();
    ctx.fillStyle = RAINBOW_COLORS[i % RAINBOW_COLORS.length];
    ctx.fill();
  }
}

export function drawGameOver(ctx, field, overlay) {
  // overlay.reason：'won'（达成 3.6 的目标）/ 'steps'（步数用尽）/ 'stuck'（3.8 约束 4：死局重排超限）
  // / 'time'（v1.19：时间关倒计时归零且目标未达成，3.6 v1.18）
  const title =
    overlay.reason === 'won' ? '关卡完成'
      : overlay.reason === 'stuck' ? '无可消除组合'
        : overlay.reason === 'time' ? '时间到'
          : '步数用尽';
  const stars = Number.isFinite(overlay.stars) ? overlay.stars : 0;
  ctx.fillStyle = OVERLAY_DIM;
  ctx.fillRect(field.x, field.y, field.side, field.side);

  const panelW = field.side * 0.82;
  const panelH = field.side * 0.58;
  const px = field.x + (field.side - panelW) / 2;
  const py = field.y + (field.side - panelH) / 2;
  const cx = px + panelW / 2;
  roundRectPath(ctx, px, py, panelW, panelH, field.side * 0.05);
  ctx.fillStyle = OVERLAY_PANEL;
  ctx.fill();

  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  const lines = [
    { text: title, size: 0.085, weight: 700, color: OVERLAY_TITLE_COLOR, at: 0.14 },
    // 3.7 的三星：只在通关时画（失败局面 overlay.stars = 0）
    ...(stars > 0
      ? [{ text: '★'.repeat(stars) + '☆'.repeat(3 - stars), size: 0.1, weight: 700, color: OVERLAY_RECORD_COLOR, at: 0.3 }]
      : []),
    { text: '本局得分', size: 0.042, weight: 500, color: HUD_LABEL_COLOR, at: stars > 0 ? 0.46 : 0.36 },
    { text: String(overlay.score), size: 0.11, weight: 700, color: OVERLAY_TITLE_COLOR, at: stars > 0 ? 0.58 : 0.5 },
    {
      text: overlay.newRecord ? `新纪录！最高分 ${overlay.best}` : `最高分 ${overlay.best}`,
      size: 0.042,
      weight: 500,
      color: overlay.newRecord ? OVERLAY_RECORD_COLOR : HUD_LABEL_COLOR,
      at: stars > 0 ? 0.72 : 0.66
    }
  ];
  for (const line of lines) {
    ctx.font = `${line.weight} ${Math.round(field.side * line.size)}px ${FONT_STACK}`;
    ctx.fillStyle = line.color;
    ctx.fillText(line.text, cx, py + panelH * line.at);
  }

  // Step 24（v1.38 / D052）：**彩星** —— 星星行右侧一枚彩虹五角星 +「彩星」小字。
  // 纯几何（每个角一次填充，共 5 次；**零渐变、零阴影**，与 D043/D044 一致），只在通关且达标时画。
  if (overlay.rainbow && stars > 0) {
    const r = panelH * 0.09;
    const bx = cx + panelW * 0.3;
    const by = py + panelH * 0.3;
    drawRainbowStar(ctx, bx, by, r);
    ctx.font = `700 ${Math.round(field.side * 0.032)}px ${FONT_STACK}`;
    ctx.fillStyle = RAINBOW_LABEL_COLOR;
    ctx.fillText('彩星', bx, by + r * 2);
  }

  // Step 12.2：通关后有「下一关」（最后一关除外），失败时是「重试」；两者都带「选关」
  const btnH = panelH * 0.17;
  const btnY = py + panelH * 0.78;
  const gap = panelW * 0.04;
  const primaryLabel = overlay.hasNext ? '下一关' : overlay.reason === 'won' ? '选择关卡' : '重试';
  const primaryW = panelW * 0.42;
  const primaryX = cx - primaryW - gap / 2;
  const drawButton = (x, y, w, h, label, kind = 'primary') => {
    // 第三轮视觉评审（用户 P0「粉红按钮与游戏内 UI 体系割裂」）：结算按钮改成**游戏内道具栏的语言** ——
    // 深色面板 + 亮色果冻键 + 内嵌顶部高光 + 厚底边。全部是**纯色几何填充**（4 次填充/按钮）：
    // 结束面板是每帧重绘的，因此**不能**用渐变（D043/D044），「果冻感」靠「高光条 + 厚底边」表达。
    const skin = kind === 'primary' ? BUTTON_PRIMARY : BUTTON_SECONDARY;
    const radius = h * 0.32;
    const bodyY = y + h * 0.06; // 主体略上移，留出下面的厚底边
    const bodyH = h * 0.94;
    roundRectPath(ctx, x, bodyY + h * 0.1, w, bodyH, radius);
    ctx.fillStyle = skin.edge;
    ctx.fill();
    roundRectPath(ctx, x, bodyY, w, bodyH, radius);
    ctx.fillStyle = skin.base;
    ctx.fill();
    roundRectPath(ctx, x + w * 0.09, bodyY + bodyH * 0.12, w * 0.82, bodyH * 0.24, bodyH * 0.12);
    ctx.fillStyle = skin.gloss;
    ctx.fill();
    ctx.font = `700 ${Math.round(field.side * 0.045)}px ${FONT_STACK}`;
    ctx.fillStyle = skin.text;
    ctx.fillText(label, x + w / 2, bodyY + bodyH * 0.58);
    return { x, y, w, h };
  };
  const primary = drawButton(primaryX, btnY, primaryW, btnH, primaryLabel, 'primary');
  const select = drawButton(cx + gap / 2, btnY, primaryW, btnH, '选关', 'secondary');
  return { restartRect: primary, nextRect: overlay.hasNext ? primary : null, selectRect: select };
}

/**
 * 回放期间的 HUD 分数：逐层累加本层得分，并在最后一层之后补上「关卡级尾款」
 * （3.5 的剩余步数转化不在逐层明细里，v1.16 从 app.js 移到这里 —— 它是纯信息层推导）。
 */
export function hudScoreAt(playback, levelIndex) {
  if (!playback) return 0;
  let gained = 0;
  for (let i = 0; i <= levelIndex && i < playback.levelScores.length; i += 1) gained += playback.levelScores[i].gained;
  const tail = levelIndex >= playback.levelScores.length - 1 ? playback.tailBonus : 0;
  return playback.scoreBefore + gained + tail;
}

/**
 * 目标的一句话摘要（日志与结束面板用）：把 GoalSpec 说成人话。
 * 放在 hud.js 是因为它属于「信息层文案」—— 与 HUD 的目标进度显示同源，且 app.js 也复用它打日志（v1.16）。
 */
export function describeGoal(goal) {
  if (!goal) return '无目标';
  if (goal.type === 'score') return `分数达到 ${goal.target}`;
  if (goal.type === 'clearIce') return `消除 ${goal.target} 层冰块`;
  if (goal.type === 'collect') return `收集 ${formatTargets(goal.targets)}`;
  if (goal.type === 'fruit') return `收集 ${goal.target} 个水果`;   // 3.6 v1.18
  if (goal.type === 'pod') return `收集 ${goal.target} 个金豆荚`;    // 3.6 v1.18
  const parts = [];
  if (goal.score !== undefined) parts.push(`分数 ${goal.score}`);
  if (goal.clearIce !== undefined) parts.push(`冰块 ${goal.clearIce} 层`);
  if (goal.collect) parts.push(`收集 ${formatTargets(goal.collect)}`);
  return `混合目标（${parts.join(' + ')}）`;
}

const formatTargets = (targets) => Object.entries(targets ?? {}).map(([name, need]) => `${name}×${need}`).join(' + ');

/** 圆角矩形路径（就地一份，理由见文件头：避免与 render.js 形成模块环）。 */
function roundRectPath(ctx, x, y, w, h, r) {
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}
