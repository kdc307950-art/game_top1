# DECISIONS — 关键决策记录

> 关联文件：`AGENTS.md`、`ROADMAP.md`、`REFERENCES.md`
> 使用方式：每次出现非显然决策时追加。新的记录在最上方。
> 编号规则：`D001`、`D002`……，一旦分配不再复用。

---

## D015：Step 3 的消除循环落点、契约扩展与可测性

- 日期：2026-09-19
- 背景：Step 3 要实现「消除 → 下落 → 填充 → 级联」，但宪法 4.2 把「整条消除循环」放在了 `game.js` 的 `resolveBoard`（Step 4 才允许改 `game.js`），而 Step 3 的验收又要求 `tests/integration.test.js` 能断言**最终棋盘与级联层数** —— 循环若写在 `app.js`，集成测试就无法导入（`app.js` 依赖 DOM）。此外有若干 4.2 未定义的细节必须现在定下来。
- 决策：
  1. **消除循环落在 `board.js`**，新增导出 `resolveCascades(board, colorCount, options?)`（4.2 的 board.js 清单里没有它，属**契约扩展**，在此登记）。理由：Step 3 不许改 `game.js`；`app.js` 无法被 Node 测试；而 `board.js` 是棋盘机制的自然归属。Step 4 的 `game.resolveBoard` 将**在其上叠加**计分、步数、状态快照，而不是重写一遍循环（因此 `resolveCascades` 不是临时过渡代码，而是长期底层入口）。
  2. **给 `refillBoard` / `resolveCascades` 增加可选的 `rng` 参数**（默认 `Math.random`），用于测试注入确定性随机源。4.2 的签名未包含该参数，属**契约扩展**。依据：参考项目 game2 的 `createBoard(rows, cols, colors, seed)` 与 `makeRandomGem(colors, rng = Math.random)` 同样支持注入随机源，是「可测试性」的通行做法。副作用：`options.rng` 使「级联层数」这类断言可以写成确定值，而不是「跑出来多少算多少」。
  3. **级联层数上限 = 棋盘格数**（8×8 → 64 层），用于「禁止无限重试」的同类保护。4.2 未定义该上限，而**新增配置键必须同步宪法附录 B（需批准）**，因此本步不复用也不新增配置项，取一个由棋盘尺寸导出的、任何真实级联都远达不到的宽松上界；`capped` 标志返回给调用方，`app.js` 会 `log('warn')`。
  4. **不采纳参考实现的对角下落**：AlexKutepov 的 `BoardPhysics` 除直落外还有 `calculateDiagonalFalls`（正上方无格子时改从斜上方落）。宪法 4.3 只规定「下落填充」，故本项目只做直落，`REFERENCES.md` 的该条借鉴要点在此**明确不采纳**。
  5. **障碍物在重力下的语义（本步暂定，Step 11/13 定稿）**：动物格 = `color !== null`（含冰块/藤蔓里的动物，3.4「冰块内的动物可以移动并消除」）；空洞 = `color === null && obstacle === null`；**纯障碍格（雪块/巧克力）= 屏障**，不下落、不被穿越，并把该列切成若干段分别压缩。依据：3.4「障碍物……占据格子，影响下落」+ 参考实现把不可承载格（`canHoldChip=false`）当作下落查找的终点。**未决项**：藤蔓中的动物在重力下是否跟随下落（3.4 只说了「不能移动」）留给 Step 13。
  6. **清除时保留 `obstacle`/`obstacleLayers`，只把 `color` 置空，并复位 `type`/`direction`**：3.4 规定冰块不因里面的动物被消除而消失；而空格必须保持 4.1「color 为 null 表示空格或纯障碍」的不变式，不能留下「无颜色却仍是条纹/包装」的格子。特殊元素的**激活**流程属 Step 7，届时在清除前扩展。
  7. **`app.js` 的分层回放让时间语义落到既有配置键上**：交换后的高亮帧停留 `ANIMATION_CONFIG.clearDuration`（该键的语义就是「消除动画时长」），每层级联之间间隔 `ANIMATION_CONFIG.cascadeGap`（键的语义就是「级联间隔」）；`fallDuration` 暂不使用，留给 Step 5 的位移补间。逻辑在 `resolveCascades` 中**同步算完**，回放只画历史快照，符合 5.4「先更新状态，再播放动画」。
  8. **回放期间锁定输入**（`view.playback`）：否则玩家能在画面尚未追上逻辑时继续交换，导致所见与状态错位。
  9. **行数超限登记**：`app.js` 458 行、`board.js` 355 行，均超出宪法 6 节「模块不超过 300 行」的目标。`app.js` 的拆分已获用户批准、定于 Step 5 前执行；`board.js` 若同样要拆，需要新增 2.2 节未登记的文件，**属待批准事项**（建议与 Step 5 的 `app.js` 拆分一并处理，例如把下落/填充抽到 `gravity.js`）。
- 影响：`board.js`、`app.js`、`tests/integration.test.js`。`match.js`、`config.js` 本步**未改动**（Step 3 允许但无必要）。
- 替代方案：把循环写进 `app.js`（否决：集成测试无法导入 DOM 模块，等于放弃 Step 3 的自动化验收）；把循环写进 `game.js`（否决：Step 3 范围不含 `game.js`，跨 Step 修改）；新增 `MAX_CASCADE_LEVELS` 配置键（否决：需先改附录 B）；不做 `rng` 注入、改为断言随机结果（否决：级联层数不可断言，测试会变成「跑出来是多少就是多少」）；采纳对角下落（否决：宪法 4.3 未规定，属自行发明规则）。

---

## D014：Step 2 的规则空白与实现取舍（含参考项目冲突一处）

- 日期：2026-09-19
- 背景：Step 2（触摸交换 + 匹配检测）是第一个含游戏逻辑的 Step，落地时遇到宪法未覆盖或需明确读法的 8 个点；同时按 `REFERENCES.md` §2.1 Step 2 的强制要求重读了参考项目源码，发现一处规则冲突。
- 参考核实结果（2026-09-19，GitHub API + raw 源码实读；两仓库均**无 LICENSE**，按 `REFERENCES.md` §5 只借鉴思路、不复制代码）：
  - `rola2005-klc/game2` 实测 7 个文件（`index.html`、`style.css`、`app.js`、`game.js`、`test.js`、`mobile-ui.test.js`、`README.md`）。其 `game.js` 用**数字二维数组**、`createBoard` 用「过滤左边两格/上面两格同色」+ 最多 200 次重试保证开局无三连且存在可行交换、无效交换通过**返回原棋盘副本**实现回退、`hasPossibleMove` 只枚举「右」「下」两个方向。本项目按 4.1 的 `cell[][]` 重新实现，未沿用其数据结构与命名。
  - `AlexKutepov/Match3-algorithm-TS-Cocos-creator` 实测含 `Systems/MatchDetector.ts`（8.3KB）、`Systems/BoardPhysics.ts`、`Core/Board.ts` 等；`MatchDetector` 用 `processedH/processedV` 两个 Set 保证一段只上报一次，并用「只检查被交换的两个位置」判定 `wouldMatchAfterSwap`（O(1) 局部判定）与 `hasValidMoves`。本项目用「只在段起点产出」达到同样去重效果（无需额外 Set）；那套局部判定属性能优化，8×8 规模下未采用，留给 Step 5/6 实测后再决定。
- 决策：
  1. **条纹方向冲突（宪法 vs 参考实现）**：`MatchDetector.getBonusType` 让条纹方向**垂直于**匹配方向（`isHorizontal → LineVertical`）。宪法 3.2 明定「横向四连生成横向条纹（消除整行）」，按 `AGENTS.md` 第 17 节「文件冲突以宪法为准」，本项目**采用宪法读法**（匹配方向 = 爆破方向），不采纳参考实现。Step 7 实现条纹时必须按此执行。
  2. **6 连及以上的直线**：3.2 只定义了 3/4/5 连。按开心消消乐惯例，`长度 ≥5` 一律判为 `line5`（魔力鸟），不新增形状枚举（`MATCH_SHAPE` 只有 5 个值）。
  3. **十字形（3+3 共中心，5 格）**：宪法只有 `L` 与 `T` 两个枚举。判为 `T`（交叉点落在两条臂的中间，与 T 的判定规则一致），不新增 `CROSS`。
  4. **`detectMatchShape` 的严格性**：只有「两条臂都 ≥3 格、交叉点存在、无游离格」的交叉才算包装糖果形状（3.2 要求 L/T 型 **5 连**），否则返回 `null`；这样 4 格的伪「L」不会被误判为包装糖果。
  5. **障碍物的 color 语义**：3.4 说冰块内的动物「可以移动并消除」、藤蔓「困住小动物」，故 `ice`/`vine` 格保留 `color`；雪块与巧克力是**占格障碍**（3.4「消除雪块旁边的小动物」「巧克力被相邻消除波及」），格内没有动物，`color` 置 `null`。障碍物的**行为**（层数减少、影响下落、阻止交换）仍属 Step 11/13。
  6. **createBoard 复用 `shuffleMaxTries` 作为重试上限**：`createBoard` 需要「无初始三连 + 至少一个可行交换」两个约束（后者对应 3.8 的可玩性要求，参考项目也这么做），但宪法没有为此定义配置键。**新增配置键必须改宪法附录 B（需用户批准）**，因此本步**读取**已有的 `CONFIG.ANIMATION_CONFIG.shuffleMaxTries`（语义同属「重排/生成的最大尝试次数」，全项目仅此一处复用）。若你希望改为独立键（如 `GENERATION_MAX_TRIES`），需先改附录 B。
  7. **`hasPossibleMove` 的判定口径**：要求匹配组**包含被交换的两个格子之一**，而不是「交换后棋盘上存在任意匹配」。棋盘若已残留匹配（Step 2 无消除，有效交换后会留下匹配），后者会把任意交换都算成可行。
  8. **交换编排暂放 `app.js`**：4.2 的 `game.trySwap` 属 Step 4，而 Step 2 不允许修改 `game.js`，故「快照 → 交换 → 检测 → 回退」这段编排暂放 `app.js` 的 `attemptSwap`，Step 4 迁入 `game.js`。步数计数器同样属 Step 4，因此本步「无效交换不扣步数」自然成立、无法被验证，已如实记录。
  9. **`app.js` 达 401 行，超出宪法 6 节「模块不超过 300 行」的目标，本轮不拆**：拆成 `render.js` / `input.js` 会新增文件，而 2.2 节目录清单未登记这两个文件 —— 按第 11 节，改宪法需用户明确批准。**待批准事项**：Step 5（动画打磨，`app.js` 还会显著增长）之前，建议把渲染与输入拆成两个文件并同步 2.2 节；在获批之前保持单文件并在此登记偏差。
- 影响：`board.js`、`match.js`、`app.js`、`tests/board.test.js`、`tests/match.test.js`。
- 替代方案：采纳参考实现的条纹方向（否决：违反 3.2，且第 17 节规定冲突以宪法为准）；为 6 连/十字新增枚举（否决：改 `MATCH_SHAPE` 属附录 B-2 枚举变更，需用户批准且无必要）；新增 `GENERATION_MAX_TRIES` 配置键（否决：触发附录 B 同步义务，需先获批准，本步用读取复用绕开）；`hasPossibleMove` 用宽松判定（否决：会误报可行交换）；拆 `app.js`（否决：擅自改目录结构）。

---

## D013：Step 1 的三处取舍（渲染常量归属、占位颜色、旧 meta 标签）

- 日期：2026-09-19
- 背景：Step 1（棋盘渲染）遇到三个必须先定的口子：
  1. ROADMAP Step 1 的范围只允许改 `index.html` / `styles.css` / `app.js`，而宪法 2.3 与 9 节规定 `config.js` 是唯一存放可调数值的文件 —— 调色板与 DPR 上限该放哪；
  2. Step 1 要求「每格显示一个随机颜色」，但宪法 9 节禁止在 4.1 的 `cell[][]` 之外另立棋盘数据结构，而 `board.js` 属逻辑模块、本 Step 禁止修改；
  3. Chrome 对 Step 0 写入的 `apple-mobile-web-app-capable` 发出弃用警告，与 Step 0/1 的「控制台无 warning」验收相冲突。
- 决策：
  1. 渲染常量（`MAX_DPR`、`BOARD_MARGIN`、`MIN/MAX_BOARD_PX`、圆角与半径比例、`BASE_COLORS` 调色板）暂留在 `app.js`，并在代码中显式注释「只影响观感、不参与游戏规则」。本 Step 不动 `config.js`；日后若集中管理，必须同时更新宪法附录 B 并保持两边一致。
  2. 用 `Uint8Array` 承载「占位颜色索引」作为绘制输入，代码注释显式声明它**不是**棋盘状态，`board.js` 的 `cell[][]` 由 Step 2/3 提供后删除该数组。
  3. `index.html` 补 `<meta name="mobile-web-app-capable" content="yes">`（保留 apple 版供 iOS 使用）。
- 影响：`app.js`、`index.html`。逻辑模块（含 `config.js`）零改动。
- 替代方案：把调色板写进 `config.js`（否决：超出 Step 1 范围，且立即触发附录 B 同步义务，属跨 Step 混合修改）；调用 `board.js` 的 `createBoard` 生成显示棋盘（否决：逻辑模块本 Step 禁止修改，且等于在 `app.js` 内实现棋盘规则）；删掉 apple 版 meta 只留新版（否决：iOS 独占 Web App 模式仍依赖 apple 版）。

---

## D012：Step 0 收口时统一首次提交、package.json 与原生目录策略

- 日期：2026-09-19
- 背景：Step 0 最终审查发现三处初始约束冲突：`AGENTS.md` 第 16 节要求提交信息使用 `[stepN]`，而 ROADMAP 旧文写 `[init]`；宪法 2.2 节写 `package.json` 仅含 `type` 与 scripts，实际文件还含可选元数据；`.gitignore` 又忽略了 Step 18 明确要求新增的 `android/` 与 `ios/` 原生工程。
- 决策：按文件优先级采用 `[step0] 项目骨架与宪法 v1.3` 作为首次提交；删除 `package.json` 的可选元数据，只保留 `type` 与 scripts；未来跟踪 `android/`、`ios/` 原生源码，仅忽略其缓存和构建产物。
- 影响：`ROADMAP.md`、`prompts.md`、`package.json`、`.gitignore`、首次 Git 提交。
- 替代方案：继续使用 `[init]`（否决：低优先级文件不能覆盖宪法）；修改宪法以保留 package 元数据（否决：这些元数据对当前零依赖骨架不是必需）；忽略整个原生目录（否决：Step 18 无法形成可审查、可回滚的提交）。

---

## D011：附录 B 只登记数值，字符串常量另立附录 B-2

- 日期：2026-09-18
- 背景：审查报告 M4 指出：`config.js` 导出 `CELL_TYPE`、`OBSTACLE_TYPE`、`DIRECTION`、`MATCH_SHAPE`、`GOAL_TYPE`、`STORAGE_KEYS` 六个字符串常量对象，宪法 6 节要求它们必须集中在 `config.js`，但附录 B 只登记数值，导致宪法 17 节「附录 B 与 `config.js` 必须一致」长期处于未披露的不一致状态。报告给出两个选项：「把六个枚举也登记进附录 B」或「明确声明附录 B 只登记数值」。
- 决策：**两个都做**——附录 B 保持「可调数值」定位不动，另立**附录 B-2「字符串常量登记表」**登记六个常量对象。理由：这些是枚举而非可调值，混进数值表会让「改数值要同步附录 B」这条规则失去信号；完全不登记又违反 17 节。
- 影响：`AGENTS.md` 附录 B 追加 9 行数值键 + 新增 B-2 表；17 节交叉引用规则补「数值见附录 B，字符串常量见附录 B-2」。
- 替代方案：只登记进附录 B 主表（否决：混淆两种变更语义）；只声明「附录 B 只登记数值」而不登记枚举（否决：`STORAGE_KEYS` 的值改了会破坏玩家存档兼容，必须有一处可查的登记）。

---

## D010：按审查报告做全局一致性修复（S1–S3 / M1–M6 / L1–L5）

- 日期：2026-09-18
- 背景：用户提交《项目文件审查报告》，列出 14 条问题。按独立审计流程逐条核实原始文件后：**13 条成立，1 条（L3）为误报**，另发现 **1 处报告漏掉的同类问题**（宪法第 8 节工作流第 1 条的「会话开始必读文件」清单同样漏了 `REFERENCES.md` 与 `DECISIONS.md`）。
- 决策：
  1. **S1/S2/S3**（严重，硬伤）：`REFERENCES.md` 在宪法中补登记 6 处 —— 2.2 节目录、第 8 节工作流第 1 条、8.3 节、第 12 节、第 17 节表格、第 17 节交叉引用规则。D003 从「未落实的决策」变为已落实。
  2. **M1/M2/M5**：`ROADMAP.md` Step 0 范围补 `REFERENCES.md`；Step 6 把「允许修改 `shuffleMaxTries`」改为「允许读取，改默认值须记录」；Step 16 标注 `assets/` 启用时点。
  3. **M3**：`AGENTS.md.orig-u200b` 不进宪法目录（它是临时备份不是项目资产），改为在 `.gitignore` 增 `AGENTS.md.orig-*` 规则，确认新版后手动删除。
  4. **M4**：见 D011。
  5. **M6**：`REFERENCES.md` §3.5 补测量环境：三个数字来自**另一项目**（PvZ 塔防，Chrome、1000×630、DPR 2、峰值 26 实体），**本项目尚未复现**，只能当方向性红线用。
  6. **L1–L5**：优先级补 `REFERENCES.md`；README 列 script 名、命令表加定位说明；PROGRESS 把 9 个键列全（L3 属清晰度优化，非缺陷）。
- 影响：`AGENTS.md` v1.2 → **v1.3**、`ROADMAP.md` v1.2 → **v1.3**、`REFERENCES.md` v1.0.1 → **v1.0.2**；共 17 处文本替换（含本文件），全部带 `assert count == 1` 保护。
- 附带修正：ROADMAP Step 0 的首次提交信息版本号由 `v1.2` 改为 `v1.3`（宪法已升版，提交信息必须与之一致）。
- 替代方案：只修「严重」三条、其余记入待办（否决：M1 会导致 Agent 严格按 Step 0 执行时漏掉 `REFERENCES.md`；M6 不标注环境会让后续 Step 把别项目的数字当本项目基线）。

---

## D009：零素材策略 —— 不引入任何外部美术/音频/图标资源

- 日期：2026-09-18
- 背景：参考项目中 candy-crush 用 SVG 素材 + 8 个 MP3，bazhanius 用 Material Icons 字体。直接沿用会引入三类风险：素材许可证与代码许可证不同（MIT 只覆盖代码）、`file://` / 离线环境加载失败、打包体积膨胀。
- 决策：第一阶段所有美术（动物、特殊元素、障碍物）用 Canvas 程序化绘制；音频在 Step 16 用 `AudioContext` 合成或使用自制/已授权素材，且素材授权必须在 `REFERENCES.md` §5 单独登记。
- 影响：`app.js` 内需要 `drawX(ctx, ...)` 系列绘制函数；`assets/` 在 Step 16 之前保持空置。
- 替代方案：直接引用 candy-crush 的 SVG（否决：素材授权不明，且与「无外部依赖」原则冲突）。

---

## D008：参考项目列表更新 —— 移除失效仓库，补充上游项目

- 日期：2026-09-18
- 背景：`REFERENCES.md` 原表列出的 `youssefmyh/Match3Algorithm`（C++）经 GitHub API 核实返回 **404**，仓库已不存在。同时 bazhanius 的 README 显式声明其基于 `rembound/Match-3-Game-HTML5`。
- 决策：
  1. 移除 `youssefmyh/Match3Algorithm`，其「匹配算法思路参考」职责转由 `AlexKutepov/Match3-algorithm-TS-Cocos-creator` 承担。
  2. 补充 `rembound/Match-3-Game-HTML5`（MIT，80 星）作为基础三消参考。
  3. 表内所有许可证/星标字段改为实测值，并标注核实日期与核实方式。
- 影响：`REFERENCES.md` §1、§3.4、§4、§5、§6。
- 替代方案：保留 404 仓库并标注「待确认」（否决：把不存在的仓库留在参考表里会误导后续 Step）。

---

## D007：修复 `AGENTS.md` 的格式缺陷（不改任何规则内容）

- 日期：2026-09-18
- 背景：原始 `AGENTS.md` 存在三处格式缺陷，影响可读性与工具链：
  1. 全文件被一对 ` ```markdown ` 代码围栏包裹（第 1 行开、文末闭），导致整个宪法被渲染为「代码块里的 markdown」；
  2. 文末残留 1 行孤立围栏 + 5 行空表格（附录 B 残渣，v1.2 修订说明声称已清理，实际未清）；
  3. 第 263 行含一个不可见字符 U+200B（零宽空格），会让文件读取工具误判为「潜在注入」而拒绝加载整个文件，也会破坏代码块与正则匹配。
- 决策：只清理上述三处**格式**问题，**不改动任何条款文字、编号、数值**。原始文件保留为 `AGENTS.md.orig-u200b`（未删除）。
- 影响：`AGENTS.md` 全文可被工具正常读取；条款语义零变化。
- 替代方案：保持原样（否决：U+200B 会持续让读取工具拒载）。
- **备份去留（2026-09-18 第二轮补充）**：`AGENTS.md.orig-u200b` 不写入宪法 2.2 节目录（它是临时备份，不是项目资产），改由 `.gitignore` 的 `AGENTS.md.orig-*` 规则忽略，待用户确认新版无误后手动删除并在 PROGRESS 记录。

---

## D006：新增 9 个配置键，等待 `AGENTS.md` 附录 B 同步

- 日期：2026-09-18
- 背景：`config.js` 落盘时发现宪法内部有两处空洞，必须补配置项才能不留魔法数字/魔法字符串：
  1. `AGENTS.md` 第 14 节的 collect 目标用动物名作键（`targets: { frog: 10, hippo: 25 }`），但 4.1 的 `cell.color` 是 `0-5` 数字索引 —— 缺映射表，`level.js` 无法解析目标；
  2. 3.4 节规定冰块上限 3 层、雪块上限 5 层、藤蔓/巧克力 1 层，这些是「可调数值」但附录 B 未登记；
  3. 6 节要求「特殊元素类型的字符串常量必须集中定义于 `config.js`」，附录 B 却只登记数值，缺字符串常量与 `localStorage` 键名。
- 决策：先在 `config.js` 提供 `COLOR_NAMES`、`OBSTACLE_CONFIG`、`ANIMATION_CONFIG.reducedMotion`、`STORAGE_KEYS`，并在文件头与文件尾用注释标注「待同步附录 B」。
- 影响：`config.js`。**未同步前，宪法 17 节「附录 B 与 config.js 必须一致」处于临时不一致状态**，需用户批准后补表（附录 B 增补行已备好，见本文件末尾附录）。
- 替代方案：不在 config.js 里定义（否决：会违反宪法 0.7「禁止散落魔法数字」）。
- **落实情况（2026-09-18 第二轮）**：9 个数值键已写入 `AGENTS.md` 附录 B，字符串常量部分由 D011 以附录 B-2 落实，临时不一致状态**已解除**。

---

## D005：`tests/run-all.js` 改为自动发现，`assert.js` 扩展为「断言 + 用例注册表」

- 日期：2026-09-18
- 背景：原设计 `run-all.js` 用 8 行静态 `import './xxx.test.js'`。在 Step 0 阶段这 8 个文件只有注释、**第一个 import 就会抛 `ERR_MODULE_NOT_FOUND`**，导致 Step 0 的验收项「`node tests/run-all.js` 可执行」在骨架阶段必然失败；后续每加一个测试文件还要改入口文件。
- 决策：
  1. `assert.js` 保留 `assertEqual` / `assertTrue` / `assertFalse` / `assertDeepEqual`（+ `assertThrows`），并新增 `test(name, fn)` 注册表、`setFile()`、`recordLoadError()`、`summarize()`。
  2. `run-all.js` 扫描 `tests/*.test.js` 后动态导入：无测试文件正常退出（退出码 0）、新文件免登记、单文件语法错误只记为「加载失败」而不断整轮。
  3. 单文件仍可 `node tests/board.test.js` 直接跑（文件末尾 `if (!globalThis.__XXL_TEST_BUNDLE__) summarize();`）。
  4. 失败时 `process.exitCode = 1`，可用作 CI 门禁。
- 影响：`tests/assert.js`、`tests/run-all.js`，以及所有测试文件的收尾约定（写入每个占位测试文件的注释模板）。
- 替代方案：保留静态 import 清单（否决：Step 0 无法验收，且每步都要改入口）。

---

## D004：引入 `package.json`（仅 `{"type":"module"}`）与「ESM 必须走 http」运行方式

- 日期：2026-09-18
- 背景：`config.js` 用 `export const CONFIG`、测试文件用 `import`，即 ES Module。由此产生两个硬约束：
  1. Node 默认按 CommonJS 解析 `.js`，`node tests/run-all.js` 会直接抛 `SyntaxError: Cannot use import statement outside a module` —— 必须有 `package.json` 的 `"type": "module"`（或把每个文件改名 `.mjs`）；
  2. 浏览器在 `file://` 下加载 ES Module 会被 CORS 拦截（`Cross origin requests are only supported for protocol schemes: http, https…`），**双击 `index.html` 打不开**。
- 决策：新增根目录 `package.json`，只含 `name/version/private/description/type/scripts`，**零依赖**；运行方式统一为 `python -m http.server 8000`（手机真机用局域网 IP）；`ROADMAP.md` 新增第 0.9 条说明，`README.md` 同步。
- 影响：新增 `package.json`（`AGENTS.md` 2.2 节目录清单未列，需用户批准后补一行）；`ROADMAP.md` Step 0 范围与测试项；`README.md` 快速开始。
- 替代方案：改用经典 `<script>` + 全局命名空间（否决：测试无法直接 `import` 逻辑模块，`node` 侧要么 `vm` 里 eval 要么引入构建工具，反而更重）；全改 `.mjs`（否决：`index.html` 侧仍要写 `.mjs` 后缀，且与 2.2 节目录命名不一致）。
- **落实情况（2026-09-18 第二轮）**：已获批准，`package.json` 行已写入 `AGENTS.md` 2.2 节，状态由「待批准」转为「已登记」。

---

## D003：建立 REFERENCES.md 作为外部参考索引

- 日期：2026-09-18
- 背景：需要系统化管理 GitHub 参考项目与逐 Step 借鉴方案。
- 决策：新建 `REFERENCES.md`，并在 `AGENTS.md` 第 17 节登记。
- 影响：`ROADMAP.md` 各 Step 增加「参考」字段；具体借鉴决策记入本文件。
- 替代方案：将参考方案并入 `AGENTS.md` 或 `ROADMAP.md`，被否决——会破坏宪法与路线图的清晰度。

## D002：棋盘数据结构统一为 cell[][]

- 日期：2026-09-18
- 背景：初版宪法中 4.1 与 4.2 数据结构不一致。
- 决策：统一为 `cell[][]`，`AGENTS.md` 4.1 为唯一真相源。
- 影响：`board.js`、`match.js`、`special.js` 全部按此实现。
- 替代方案：使用二维数字数组加旁路元数据，被否决——状态分散易出错。

## D001：确认宪法 v1.2 作为最高约束

- 日期：2026-09-18
- 背景：需要明确 Agent 行为的最高约束文件。
- 决策：以 `AGENTS.md` v1.2 为最高约束，优先级为「用户指令 > 宪法 > ROADMAP > AI 默认」。
- 影响：所有 Agent 会话必须先读宪法。
- 替代方案：无。

---

## 附录：登记项落实情况（D004 / D006 / D009 / D011）

以下登记项已于 2026-09-18 第二轮修复中写入 `AGENTS.md` v1.3，**不再是待批准状态**：

| 登记项 | 落点 | 状态 |
|---|---|---|
| `package.json` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（D004） |
| `assets/` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（D009） |
| `REFERENCES.md` 目录行 | `AGENTS.md` 2.2 节 | ✅ 已写入（S2） |
| `REFERENCES.md` 表格行 + 交叉引用规则 | `AGENTS.md` 第 17 节 | ✅ 已写入（S1） |
| 会话开始必读文件补全（含第 8 节工作流第 1 条） | `AGENTS.md` 第 8 节 / 8.1 / 8.3 / 12 | ✅ 已写入（S3 + 报告遗漏项） |
| 第 0 节优先级纳入 `REFERENCES.md` | `AGENTS.md` 第 0 节 | ✅ 已写入（L1） |
| 9 个数值型配置键 | `AGENTS.md` 附录 B | ✅ 已写入（D006） |
| 6 个字符串常量对象 | `AGENTS.md` 附录 B-2（新增） | ✅ 已写入（D011） |
| 修订记录 v1.3 行 | `AGENTS.md` 第 11 节 | ✅ 已写入（D010） |
