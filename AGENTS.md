# AGENTS.md — 手机版消消乐项目 Agent 宪法（开心消消乐规则版）

> 版本：v1.18
> 适用范围：本项目所有 AI Agent 会话
> 修订原则：只增不改，改动必须记入第 11 节修订记录
> 配套文件：`ROADMAP.md`（路线图）、`REFERENCES.md`（外部参考与逐 Step 借鉴方案）、`PROGRESS.md`（进度日志）、`DECISIONS.md`（决策记录）、`prompts.md`（提示词库）

---

## 修订说明（v1.17 → v1.18 关键变更）

本次修订经**用户明确批准**，为 Step 14（关卡类型）定义三种新玩法的规则口径。**只补规则**；对应的数据结构契约（4.1 的收集物字段、4.4 的 `GoalSpec` 扩展、附录 B 的配置键）随 14.1 的代码在**同一 v1.18 版本内**补齐，避免先把未落地的字段写进契约。

1. **3.6 新增三种关卡类型与目标类型**：
   - **水果关（`fruit`）**：棋盘顶部生成**水果**，水果**占格、不参与匹配、随重力下落、不能被消除也不能被特效清除**；消除它下方/周围的动物使其下落，**落到底部出口即收集 1 个**。目标 = 收集 N 个水果。
   - **时间关**：**倒计时替代步数** —— 本局没有步数概念，消除不扣时间；倒计时归零时若目标未达成即失败。HUD 的第二格（5.5）在时间关显示剩余时间。时间关的初始秒数与下限必须走 `config.js`（附录 B），不得写死在关卡表或 UI 里。
   - **金豆荚关（`pod`）**：金豆荚同为**可掉落的收集物**（占格、不参与匹配、不能被清除），但**每次消除只下落 1 格**（分阶段节奏），落到底部出口即收集；目标 = 收集 N 个。它与水果关的区别只在掉落节奏与三星阈值（更高）。
2. **与既有障碍的口径边界**：水果/金豆荚是**可移动的收集物**，与 3.4 的障碍物（不可移动、靠相邻消除受损）不是同一类；它们不参与匹配，也不改变 3.8 的死局/重排判定（重排只搬普通动物格）。
3. **三星与步数派生的衔接**：三种类型仍走 3.7 的三星评分；时间关没有步数，故 3.6 第 6 条的「步数由难度派生」对时间关不适用，改用时间长度（14.2 落地时把口径写进 4.4 与附录 B）。
4. **未实现不作数**：本版本只定义规则；在 14.1/14.2/14.3 各自验收前，这三种类型都**不得**写进 `LEVELS.md` 的 50 关表。

---

## 修订说明（v1.16 → v1.17 关键变更）

本次修订经**用户明确批准**，为 Step 13（藤蔓、巧克力）补齐 3.4 的规则口径、3.5 的计分口径，并新增一个配置键。不改变任何既有玩法数值与行为。

1. **3.4 补全藤蔓与巧克力的口径**：**藤蔓**是覆层障碍（格内有动物），格内动物**不能被交换** —— 判定落在 `shuffle.isCellMovable`，`game.trySwap` 因此直接拒绝并回退、**不消耗步数**（3.1）；动物照常参与匹配、可被相邻消除波及，被消除后该格从上方补位；**藤蔓本身永不被清除**（永久锁格，v1.17 口径）。**巧克力**是占格障碍、单层，格内没有动物、不参与匹配、不补位、把所在列切成两段；被**相邻（上下左右）消除**或被**特效波及**即整块消除（与雪块同一条受损路径），不留残层。
2. **3.5 补全障碍物计分**：新增「巧克力每块 1000 分」，与冰块/雪块同档；**藤蔓不计分**（它永不被清除，不会产生层数分）。
3. **附录 B 新增 `SCORE_CONFIG.chocPerLayer`（默认 1000）**：口径与 `icePerLayer` / `snowPerLayer` 一致，便于日后单独调整巧克力分数而不影响其它障碍。
4. **未列入 50 关表**：藤蔓与巧克力本步只做机制与演示关，`LEVELS.md` 的 50 关表不变（排入关卡表需先改文档与 3.6 的硬指标，属另一步）。

---

## 修订说明（v1.15 → v1.16 关键变更）

本次修订经**用户明确批准**，把本地存档从 `app.js` 拆到新模块 `storage.js`。Step 12 的选关界面、每关星级存档与目标 HUD 让 `app.js` 涨到 366 行、越过第 6 节的 300 行上限，按第 6 节「超过则拆分」的要求拆分。行为零改动。

1. **新增 `storage.js` 并登记**（2.2 节目录 + 2.3 边界）：职责是「本地存档读写 + 容错」——最高分与每关星级两张表的读写，以及无痕模式、配额、脏数据三类失败的回落。它是一个注入 logger 的工厂（`createStorage(logger)`），因此在 Node 测试里可以完全不开控制台。
2. **「唯一允许读写 `localStorage`」的职责从 `app.js` 移到 `storage.js`**：2.3 相应改写了 `app.js` 的职责描述（不再提 `localStorage`），并新增 `storage.js` 的边界条目。9 节的「逻辑模块禁止列表」不变 —— `storage.js` 与 `app.js`、`hud.js`、`render.js` 一样属于界面/IO 层，不是逻辑模块。
3. **`app.js` 回到 300 行以内**：255 行的存档与文案职责外移（存档 → `storage.js`；回放分数插值与目标文案 → `hud.js`），`app.js` 现为 297 行纯代码，且不再直接出现 `localStorage`。

---

## 修订说明（v1.14 → v1.15 关键变更）

本次修订经**用户明确批准**，为 Step 12 增加两条玩法规则：**步数由关卡难度派生**、**本局结束前引爆盘面上的特殊方块再结算**。不改动既有数值，但会改变步数的来源与结算流程。

1. **3.6 新增「步数由难度派生」**：关卡不再手写步数，改由公式 `步数 = clamp(round(base + 目标工作量 × workload − 障碍摩擦), min, max)` 算出（系数集中在 `config.js` 的 `STEP_BUDGET`）。目标工作量按目标类型折算（分数/收集/消冰各自的单位，`mixed` 相加），障碍摩擦 = 障碍格数 × perCell + 障碍总层数 × perLayer + 超过 5 色的部分 × perColor。**设计期派生**：同一关卡配置永远算出同一步数，关卡仍可复现、可巡检。
2. **3.6 新增「本局结束前引爆特殊方块」**：走完最后一步（步数用尽）**或**已达成目标时，先引爆盘面上所有特殊方块（条纹/包装各自展开；魔力鸟按它保留的颜色清除全屏同色），引爆过程中新生成的特殊方块**继续链式引爆**，直到盘面没有特殊方块或达到 `ENDGAME_CONFIG.maxDetonationRounds`。引爆的消除与得分**计入目标判定与分数**，然后才做星级结算 —— 因此「最后一步引爆刚好达成目标」算通关。
3. **4.2 补 `level.computeStepBudget`**：新增的关卡步数派生函数（纯函数、无随机；系数全部来自 `CONFIG.STEP_BUDGET`）。
4. **附录 B 新增 `STEP_BUDGET`（10 键）与 `ENDGAME_CONFIG.maxDetonationRounds`**：公式系数与引爆轮数上限都必须集中登记，逻辑模块里不出现魔法数字。
5. **`LEVELS.md` 同步**：50 关表的「步数」列改为**公式输出**（不再手写），并在 §6 写明公式；巡检脚本用 `computeStepBudget` 重算并逐关比对，公式一改就红。

---

## 修订说明（v1.13 → v1.14 关键变更）

本次修订经**用户明确批准**，为 Step 12（关卡模式与三星评分）补齐 HUD 与结束状态所需的契约：两处纯追加、一处 UI 落地口径、一个配置键。不改变任何既有玩法数值与行为。

1. **4.2 追加 `GameSnapshot` 五个字段**：`goal`（`GoalSpec`，HUD 要常驻显示目标）、`collected`（本局已收集的动物计数）、`clearedIce`（本局已清除的冰块层数）、`stars`（按 3.7 由最终分数算出的 0-3 星）、`won`（是否已达成通关目标）。它们让 HUD 与结束面板只靠快照就能渲染，不需要绕过 `getState` 去读 `state.level`。
2. **4.4 追加 `Level.completed`**：布尔值，表示本局已达成通关目标（3.6）。它把「通关」与既有的 `gameOver`（步数用尽 / 死局重排失败）区分开 —— 三者在结束面板上必须显示不同的文案。
3. **5.5 落地 HUD 四格**：HUD 常驻四格 = **分数 / 剩余步数 / 关卡目标进度 / 最高分**；目标进度按目标类型显示「当前值/目标值」（如 `frog 8/12`、`消冰 5/12`、`分数 3200/7000`），混合目标最多显示两项。
4. **附录 B 新增 `STORAGE_KEYS.LEVEL_STARS`**（默认 `xxl_level_stars`）：每关星级的存档键（Step 12.2 的选关界面用），仍是**只在 `app.js` 读写** `localStorage`。

---

## 修订说明（v1.12 → v1.13 关键变更）

本次修订经**用户明确批准**，在 Step 12 开工前把「关卡模式」引入文档：新增配套文件 `LEVELS.md`（50 关设计表与关卡设计约束），并把「避免单关元素过多」定成可验收的硬指标。本次修订**不新增玩法、不改动任何既有规则数值**，也不改变任何模块的行为。

1. **新增配套文件 `LEVELS.md` 并登记**：2.2 节目录与第 17 节配套文件表各加一条；该文件是**关卡设计的唯一真相源** —— `level.js` 的关卡表必须与它的 50 关表逐项一致，改关卡先改文档再改代码。
2. **3.6 新增「关卡设计约束（硬指标）」**五条：① 单关障碍物类型 ≤ 2 种；② 单关障碍格 ≤ 12 格（8×8 的 20%）；③ 每关最多引入 1 种新机制，且新机制首次出现时其余维度不升档；④ 混合目标最多 3 个大项、`collect` 最多 2 个动物种类；⑤ 目标必须可达（`clearIce` ≤ 该关冰块总层数；`collect` ≤ `步数 × 0.9`（单动物）/ `步数 × 1.6`（多动物）的保守估算）。违反任一条即视为设计缺陷。
3. **4.4 补充关卡表的来源**：`LevelConfig` 的 50 个实例以 `LEVELS.md` 为准（结构本身不变，仍是 4.4 已定义的字段）。
4. **50 关的规模与曲线**：分数 12 关（1–12）、收集 18 关（13–30）、消除冰块 10 关（31–40）、混合 10 关（41–50）；机制引入点固定在 L4 冰块、L11 雪块、L13 收集目标、L21 冰层 3、L26 双动物收集、L31 消除冰块目标、L40 雪层 5、L41 混合目标。曲线与逐关数值见 `LEVELS.md`。
5. **只用已实现的元素**：这 50 关只使用 6 色 + 条纹/包装/魔力鸟 + 冰块/雪块 + 四种目标类型；藤蔓、巧克力（Step 13）、宝石、水果关/时间关/金豆荚关（Step 14）、道具（Step 15）不排进本表，避免把未实现的能力写进可玩清单。

---

## 修订说明（v1.11 → v1.12 关键变更）

本次修订经**用户明确批准**，为 Step 11（冰块与雪块）补齐 3.4 的规则口径、3.5 的计分口径，以及三条纯追加契约。不改变任何既有玩法行为与数值。

1. **3.4 补全冰块与雪块口径**：冰块内的动物被消除后，该格**从上方补位并继续被冰块覆盖**（冰层归零后冰块消失），因此 3 层冰需要三次消除；**同一级联层内每格障碍物最多减少一层** —— 无论该层有多少颗相邻动物被消除、特效扫过多少格，一次「被波及」就是一层。
2. **3.4 明确两类障碍**：`ice`/`vine` 是**覆层障碍**（格内有动物，动物参与匹配、可移动；动物被消除后该格补位而障碍物保留）；`snow`/`choc` 是**占格障碍**（格内没有动物，不参与匹配、不补位、不下落，把所在列切成上下互不相通的两段）。这使 4.1 的 `color` 语义与 D014 第 5 条的分工成为明文，并修正「冰块格在动物被消除后被误判为屏障」这一潜伏缺陷。
3. **3.5 明确障碍物计分口径**：层数分**另算、不参与特效倍数** —— 单层结算分 = 动物数 × 10 × 特效倍数 + 连消加分 + 障碍物层数分；冰块连消（同一局中第 n ≥ 2 层清掉冰块）额外加 `(n − 1) × 1000`，与普通连消的 +30/档并存。
4. **4.2 三条纯追加**：`Obstacle = { type, layers }`（`obstacles.createObstacle` 的返回值，此前只有名字）；`ObstacleDamage = { r, c, type, layersRemoved, cleared }` 以及 `ResolveLevel.damaged` / `ResolveResult.damaged`（逐层障碍物受损明细，供计分与 UI 显示层数变化）；`LevelScore.obstacle`（该层障碍物得分，含冰块连消加分）。三者的缺省行为与既有调用完全一致。

---

## 修订说明（v1.10 → v1.11 关键变更）

本次修订经**用户明确批准**，为 Step 9（魔力鸟）补齐规则口径与两条纯追加的契约。不改变任何既有玩法行为与数值。

1. **3.2 补全魔力鸟口径**：与任意普通色块对调时清除全屏该颜色（含被交换格与魔力鸟自身），**该交换消耗 1 步**，且**不能与空格或纯障碍交换**；魔力鸟保留生成时的颜色用于渲染，但**不参与普通同色匹配**；被其它特效波及时不额外触发全屏清除（保守口径，见 `DECISIONS.md` D025）。
2. **4.3 新增第 14 条**：魔力鸟不参与同色匹配的匹配层要求（条纹与包装糖果仍参与，并在被消除时按 4.3.8 优先激活）。
3. **4.2 三条纯追加**：`special.getMagicTargets(board, color)`（返回全屏该颜色的坐标）；`board.resolveCascades` 新增可选 `options.initialClear`（第一层先清除给定坐标，再进入正常级联）；`game.resolveBoard` 新增可选 `options.initialClear` 透传。三者的默认行为与既有调用完全一致。

---

## 修订说明（v1.9 → v1.10 关键变更）

本次修订经**用户明确批准**，只做**登记性对齐**：把「路线图先行」的既成事实补记为宪法条目，并让外观模块的职责描述与实现一致。不新增玩法、不改动任何规则数值。

1. **2.2 / 2.3 更新 `candy.js` 的职责描述**：原文只写「条纹特效」，比实现窄 —— Step 8 起它还要画包装糖果，Step 9 起为魔力鸟。现补为「条纹 / 包装 / 魔力鸟特效」。模块边界不变（只接收坐标、颜色与形状参数，不认识棋盘状态，`render.js → candy.js` 单向）。
2. **登记「路线图先行」并消除头部版本不一致**：`ROADMAP.md` v1.10 已先于本次修订引入 §0.1-0.8（扩展前 Bug Audit Gate、L0-L6 证据等级、从可玩到可交付的门槛、阶段总表、统一执行卡、DoR/DoD、需求追溯与版本规则、App 包装与发布清单）。本次补记该事实，使 `AGENTS.md` 与 `ROADMAP.md` 的头部版本重新一致。此前一致性脚本只能放宽为「ROADMAP 可高于 AGENTS」，属已登记的 P3 缺陷（P3-1），**本次关闭**。
3. **一致性脚本恢复严格判定**：两文件已对齐，故 `_build/consistency_check.py` 恢复「头部版本必须相等」的严格断言。将来若 `ROADMAP.md` 再次先行，脚本会直接失败并提示补齐宪法修订记录，不再允许静默漂移 —— 这正是第 11 节与第 17 节的意图。

---

## 修订说明（v1.8 → v1.9 关键变更）

本次修订承接 Bug Audit Gate 的收尾审计，只修正文档交叉引用和两个低风险边界缺陷，不推进 Step 8，不改变游戏规则数值。

1. **修正旧门禁引用**：第 9 节与第 17 节统一引用当前的 0.1-0.3 门禁，避免 Agent 按已删除的 0.8 条执行。
2. **补充结束原因与窄屏尺寸边界**：要求结束日志区分步数用尽与死局重排失败；棋盘尺寸在可用空间小于 220px 时服从实际空间，禁止以最小值造成横向溢出。

## 修订说明（v1.7 → v1.8 关键变更）

本次修订经用户批准，先于 Step 8 固化“扩展前 Bug Audit Gate”和“从可玩 H5 到原生交付”的证据边界。它不新增游戏玩法，不改变任何规则数值，目的在于防止把“代码存在”“单测通过”“浏览器可玩”“平台可发布”混写成同一结论。

1. **新增 0.1 扩展前 Bug Audit Gate**：Step 7 完成后，必须先完成自动回归、静态一致性、本机 HTTP 浏览器冒烟和可用的移动交互检查；P0/P1 未清零或关键冒烟失败时，不得开始 Step 8。
2. **新增 0.2 证据等级**：用 L0-L6 区分代码审查、Node 测试、桌面浏览器、移动模拟、Android、iOS 与发布候选证据；所有进度记录必须区分“已验证”“仅代码审查”“未验证”。
3. **新增 0.3 交付阶梯**：核心可玩、移动可玩、功能冻结、包装候选、平台验证、发布候选必须按顺序验收；Capacitor 是经用户批准的 Step 18 依赖例外，不能追溯性破坏 H5 零依赖约束。
4. **扩充第 8、10、12、16、17 节**：补充审计记录、完成定义、Step 18.1-18.7 的工作流、凭据隔离、回滚和配套文件交叉引用要求。

## 修订说明（v1.6 → v1.7 关键变更）

本次修订登记 Step 7 落地「用户批准的糖果外观方案」时产生的**模块拆分**：外观代码让 `render.js` 超过第 6 节的 300 行上限，按第 6 节「超过则拆分」的要求拆出 `candy.js`。逻辑与行为零改动，不改动任何游戏规则数值。

1. **2.2 / 2.3 登记 `candy.js`**：`render.js` 收敛为「几何、布局、每帧绘制」；`candy.js` 负责「糖果形状路径、配色、内嵌图案、条纹特效，以及精灵的离屏烘焙」。依赖方向单向：`render.js → candy.js`；`candy.js` 只依赖 `config.js` 的字符串常量，不反向依赖 `render.js`，也不认识棋盘状态。
2. **外观方案（零素材，程序化绘制）**经用户批准后落地：深色描边 + 底部内阴影 + 内嵌图案 + 左上高光；条纹糖果叠 3 条条纹与方向箭头。取舍记入 `DECISIONS.md` D020，**不引入任何外部素材**（延续 D009）。
3. 触发拆分的原因值得记录：外观与特效代码量本就属于「画一颗糖果」这一职责，`render.js` 混装「布局」与「造型」必然超限；拆分后两者都在 300 行内。

---

## 修订说明（v1.5 → v1.6 关键变更）

本次修订只做**纯重构的登记**：把可移动性判定、死局检测与重排从 `board.js` 拆到 `shuffle.js`（Step 6.1），逻辑与行为零改动。不改动任何游戏规则数值。

1. **2.2 / 2.3 登记 `shuffle.js`**：`board.js` 收敛为「数据结构、交换、下落、填充、克隆」；`shuffle.js` 负责「可移动性、死局检测、重排」。依赖方向单向：`board.js → shuffle.js`（`createBoard` 需要 `hasPossibleMove` 校验开局可玩性），`shuffle.js` 只依赖 `config.js` 与 `match.js`，不反向依赖 `board.js`。
2. **4.2 把 `isCellMovable` / `hasPossibleMove` / `shuffleBoard` 三条从 `board.js` 挪到 `shuffle.js` 块**：签名与语义完全不变。

---

## 修订说明（v1.4 → v1.5 关键变更）

本次修订把 Step 5 的第二次拆分登记入目录与边界，并为 Step 6 的死局重排补全契约。不改动任何游戏规则数值。

1. **2.2 / 2.3 登记 `hud.js` 与 `timeline.js`**：`app.js` 进一步瘦身为「编排 + 存档 + 日志」；信息层（HUD、结束面板、重排提示）移入 `hud.js`，动画时间线调度与 rAF 回放移入 `timeline.js`，两者均只接收数据、不读游戏状态、不碰 `localStorage`。
2. **4.2 扩展 `shuffleBoard`**：改为 `shuffleBoard(board, options?: { rng?: () => number, maxTries?: number }): boolean`，允许注入随机源（确定性测试）与覆盖尝试上限（3.8 的默认值取附录 B 的 `shuffleMaxTries`）。
3. **4.2 补 `ResolveResult.deadlock`**：新增 `DeadlockResolution = { tries, shuffled, before, after }`，让「消除后检测到死局 → 重排」的过程与前后快照对 UI 可见（3.8 要求每次消除填充后检测）。

---

## 修订说明（v1.3 → v1.4 关键变更）

本次修订把 Step 2-4 落地过程中产生的**契约扩展与规则口径**正式写入宪法（此前只记在 `DECISIONS.md`），并为 Step 5 的模块拆分登记目录与边界。不改动任何既有游戏规则数值。

1. **4.2 补齐结构定义**：`GameState`、`SwapResult`（追加 `resolve` / `afterSwap`）、`ResolveResult`、`ResolveLevel`、`LevelScore`、`GameSnapshot`、`MoveRecord` 此前只有名字没有形状，现逐项写明；`createGame` 增加可选 `options.rng`，`refillBoard` / `resolveCascades` 增加可选 `rng`（只用于注入随机源，便于确定性测试）。
2. **4.2 补 `board.resolveCascades` 与 `level.consumeStep`**：两者分别承担 4.2 未命名的「整条消除循环」与「步数消耗」（2.3 规定 level.js 的职责含步数消耗），`game.resolveBoard` / `game.trySwap` 在其上叠加计分与状态。
3. **3.5 明确连消口径**：第 1 次消除（交换本身造成的消除）不计连消，自第 2 层起第 n 层加 `(n − 1) × 30`，依次 30、60、90、120。
4. **2.2 / 2.3 登记 Step 5 的模块拆分**：`app.js` 拆为 `app.js`（编排/动画调度/存档）+ `render.js`（绘制与几何）+ `input.js`（手势与视口守卫），并写明三者的边界与「`localStorage` 仍只在 `app.js`」。

---

## 修订说明（v1.2 → v1.3 关键变更）

本次修订只做**登记性补齐与一致性修复**，不改动任何游戏规则：

1. **补齐 `REFERENCES.md` 的宪法地位**：2.2 节目录、第 8 节工作流、8.3 节会话流程、第 12 节初始提示词、第 17 节配套文件表与交叉引用规则，六处全部登记（S1/S2/S3）。
2. **2.2 节目录补 `package.json` 与 `assets/`**：前者为 ES Module 的必要条件（D004），后者为 Step 16 音频资源预留（D009）。
3. **第 0 节优先级纳入 `REFERENCES.md`**：用户指令 > 宪法 > `ROADMAP.md` > `REFERENCES.md` > AI 默认习惯。
4. **附录 B 补 9 个配置键，并新增 B-2 字符串常量登记表**：解决「附录 B 与 `config.js` 必须一致」的长期不一致（D006/D011）。
5. **8.1 第 1 条补 `DECISIONS.md`**：会话开始时必须读历史决策，避免重走已否决的路线。

---

## 修订说明（v1.1 → v1.2 关键变更）

本次修订在 v1.1 基础上做以下优化：

1. **补全 `game.js` 接口契约**：v1.1 中 4.2 节遗漏了 `game.js` 对外接口，本次补全。
2. **补全附录 B 配置项**：补入 `LEVEL_DEFAULTS` 与 `BOARD_SIZE` 关联条目，并清理 v1.1 末尾的空表格残渣。
3. **与 ROADMAP 双向引用**：第 1 节各阶段、第 12 节提示词、附录 Step 编号与 `ROADMAP.md` 对齐。
4. **新增第 17 节“配套文件与交叉引用”**：明确各配套文件的职责与维护方式。
5. **补充关卡数据结构契约**：新增 4.4 节，定义 `Level` 与 `LevelConfig` 结构，与 14 节示例对齐。
6. **修正若干措辞**：统一术语，消除歧义。
7. **更新修订记录**：新增 v1.2 条目。

---

## 修订说明（v1.0 → v1.1 关键变更）

1. 统一棋盘数据结构为 `cell[][]`，4.1 为唯一真相源。
2. 藤蔓统一归入第三阶段。
3. `game.js` 补入第 9 节逻辑模块禁止列表。
4. `tests/` 补全为覆盖 8 个逻辑模块。
5. 全篇统一使用“魔力鸟”。
6. 倍数、分数等自创数值明确标注为“项目约定值”。
7. 新增术语表、关卡配置示例、性能与动画预算、提交与回滚规范、配置项集中表。
8. 4.2 节接口补全参数与返回值类型；第 7 节补测试用例示例；第 8 节补失败与回滚流程。
9. 移动端 UX 补充安全区适配、方向锁定、低功耗、色盲友好。
10. 附录 B 新增“配置项集中表”。

---

## 0. 元规则

本文件是本项目 AI Agent 的最高开发约束。
优先级：用户明确指令 > 本宪法 > `ROADMAP.md` > `REFERENCES.md` > AI 默认习惯。

你的角色：资深移动端 H5 游戏工程师 + 严格测试者 + 消消乐规则专家。
你的目标：用 vibe coding 小步构建一个可玩的手机版消消乐，游戏规则对标开心消消乐，而不是一次性生成不可维护的 Demo。

核心原则：

1. 每次只做一件事。
2. 先读文件，再计划，再编码，再验证。
3. 不确定必须问，禁止猜测 API、需求或数据结构。
4. 小步修改，小步提交，保持随时可运行。
5. 不追求炫技，优先可玩、可测、可维护。
6. 游戏规则的实现必须可追溯至本宪法第 3 节或附录 A，禁止自行发明规则。
7. 凡本宪法未明确规定的数值、阈值、时长，必须集中定义在 `config.js`，禁止散落魔法数字。
8. 任务粒度以 `ROADMAP.md` 的 Step 为准，禁止跨 Step 混合修改。

### 0.1 扩展前 Bug Audit Gate

一个玩法 Step 完成后，准备进入下一个玩法 Step 前，必须先做独立 Bug 审计。当前 Step 7 完成后，Step 8 只能在本门禁通过后开始；审计期间不得顺手实现包装糖果、魔力鸟、组合或其他后续玩法。

审计至少包含：

1. **自动回归**：运行 `node tests/run-all.js`，记录测试文件数、用例数、断言数、失败数和退出码；失败用例必须先修复，或在 `PROGRESS.md` 标记为阻塞。
2. **静态一致性**：若 `_build/consistency_check.py` 存在则运行，检查目录、模块边界、配置键、文档交叉引用和禁止依赖；静态脚本通过不等于行为已验证。
3. **浏览器冒烟**：通过 HTTP 服务器验证首屏、有效交换、无效交换、消除/下落/补充、步数、结束面板和最高分；必须记录浏览器、系统、端口和控制台结论。
4. **移动交互**：在可用的窄屏 DevTools 模拟、模拟器或真机上验证触摸滑动、方向锁、安全区、滚动/缩放禁用和输入锁；桌面鼠标结果不得冒充真机触摸结果。
5. **边界清单**：对照 `PROGRESS.md` 与 `DECISIONS.md` 列出已实现、仅有单测、仅代码审查、未验证和延期能力；未实现的后续 Step 不得写入已支持能力。
6. **缺陷分级**：P0 为无法启动、数据损坏或规则状态不可恢复；P1 为核心交换、消除、步数或结束流程错误；P2 为视觉、兼容性或低频边界问题；P3 为可延期优化。P0/P1 阻止进入下一 Step，P2/P3 必须登记负责人、复现步骤和回归计划。
7. **证据归档**：在 `PROGRESS.md` 追加命令、环境、结果、失败日志路径和未验证边界；规则或范围改变时同步追加 `DECISIONS.md`。

只有 P0/P1 清零、自动回归通过、浏览器冒烟通过，且剩余 P2/P3 已登记，才可以写“允许进入下一 Step”。

### 0.2 证据等级与可声明范围

任何“通过”都必须带证据等级，不得跨等级推断：

| 等级 | 最低证据 | 可以声明 | 不能声明 |
|---|---|---|---|
| L0 | 阅读代码、接口和决策记录 | 已检查静态实现 | 功能可玩、平台可用 |
| L1 | Node 单测/集成测试 | 算法在测试夹具中通过 | 浏览器、触摸或真机通过 |
| L2 | 本机 HTTP 浏览器手动流程 | 桌面浏览器流程通过 | 移动端触摸、WebView、商店就绪 |
| L3 | DevTools 窄屏/触摸模拟 | 模拟移动交互通过 | 真实设备性能、音频、震动 |
| L4 | Android 模拟器或真机安装包 | Android 安装和冒烟通过 | iOS 或商店发布 |
| L5 | macOS/Xcode 上的 iOS 模拟器或真机 | iOS 构建和设备冒烟通过 | 签名、审核、商店就绪 |
| L6 | 签名产物、升级/卸载回归、合规材料 | 可交付的发布候选版本 | 尚未完成的审核或未声明平台 |

进度和发布文案必须使用“已验证”“仅代码审查”“未验证”三类词。写“移动端可玩”至少需要 L3；写“Android/iOS 已支持”分别需要 L4/L5；写“可发布”至少需要 L6。Windows 环境不得声称完成 iOS 构建、签名或商店发布。

### 0.3 从可玩到可交付的总门槛

项目里程碑按以下顺序推进：

1. **核心可玩**：逻辑测试通过，本地浏览器能完整玩一局。
2. **移动可玩**：窄屏、触摸、安全区、性能和视觉边界完成验证。
3. **功能冻结**：本阶段玩法暂不扩展，Bug Audit 清零 P0/P1，并保留可回退 commit/tag。
4. **包装候选**：Web 资源、应用标识、版本号、图标/启动图、隐私说明和 Capacitor 配置可重建。
5. **平台验证**：Android 与 iOS 分别完成构建、安装、升级、卸载、断网和恢复测试。
6. **发布候选**：签名、产物校验和证据归档完成；只有 L6 才能称为“可交付”或“商店准备完成”。

Step 18 统一拆为 18.1 环境冻结、18.2 Web 资源与初始化、18.3 WebView 兼容、18.4 Android Debug、18.5 iOS、18.6 Release 签名与合规、18.7 发布候选回归与回滚。每个子步骤单独验收，不能用“已生成原生工程”替代“已安装/已验证/已签名”。

---

## 1. 项目目标

> 与 `ROADMAP.md` 第 1 节“阶段总览”保持一致。

### 第一阶段：核心可玩版（对应 ROADMAP Step 0 - Step 6）

- 8×8 棋盘，6 种颜色。
- 移动端触摸滑动交换相邻格子。
- 横向或纵向连续 3 个及以上同色消除。
- 消除后下落填充，顶部生成新格子。
- 支持级联消除（连消）。
- 计分、步数限制、游戏结束。
- localStorage 保存最高分。
- 手机浏览器可玩，禁止页面滚动和缩放。

### 第二阶段：开心消消乐核心机制（对应 ROADMAP Step 7 - Step 12）

- 特殊元素：条纹糖果、包装糖果、魔力鸟。
- 特殊元素组合效果。
- 障碍物：冰块、雪块。
- 关卡目标系统：收集动物、消除冰块、达到指定分数。
- 三星评分系统。

### 第三阶段：扩展机制（对应 ROADMAP Step 13 - Step 18）

- 更多障碍物：藤蔓、巧克力、绳索。
- 关卡类型：水果关、时间关、金豆荚关。
- 道具系统：刷新、加五步、小木锤。
- 音效、震动反馈、粒子动画。
- Capacitor 打包为 Android/iOS。

---

## 2. 技术栈与目录

### 2.1 技术栈

- HTML5 Canvas
- Vanilla JavaScript，ES2020+
- CSS
- 无框架、无构建工具、无外部依赖，除非用户明确批准。

H5 本体的零依赖约束持续有效。只有完成 0.1 Bug Audit Gate、固定功能冻结版本并取得用户明确批准后，Step 18 才允许为 Capacitor 添加受控的 CLI/runtime、平台工程或资源暂存脚本；该例外必须记录在 `DECISIONS.md`，不得反向改变游戏逻辑契约。

### 2.2 目录结构

```
/
  index.html
  styles.css
  config.js        # 全局配置：颜色数、倍数、时长、关卡默认值
  game.js          # 对外统一接口，组合调用其他模块
  board.js         # 棋盘数据结构、交换、下落、填充、克隆
  shuffle.js       # 可移动性判定、死局检测、重排（3.8）
  match.js         # 匹配检测（横向、纵向、L/T 型）
  special.js       # 特殊元素生成、激活、组合效果
  score.js         # 计分系统、连消倍数
  obstacles.js     # 障碍物逻辑（冰块、雪块、藤蔓、巧克力）
  level.js         # 关卡目标、步数限制、三星评分
  app.js           # 应用编排：视图状态、调用游戏逻辑、动画起播（localStorage 读写已移交 storage.js，v1.16）
  storage.js       # 本地存档读写与容错：最高分、每关星级（唯一允许读写 localStorage 的模块，v1.16）
  render.js        # 棋盘层绘制与几何：画布尺寸/DPR、棋盘布局、静态图层烘焙、每帧贴图
  candy.js         # 糖果外观与精灵烘焙：形状路径、配色、内嵌图案、条纹 / 包装 / 魔力鸟特效（D020 / D023）
  hud.js           # 信息层绘制：HUD（分数/步数/最高分）、结束面板、重排提示
  input.js         # 触摸/鼠标手势识别与视口守卫：只产出手势，不碰游戏状态
  timeline.js      # 动画时间线调度与 rAF 回放：只接收阶段列表与回调
  tests/
    assert.js
    run-all.js
    board.test.js
    match.test.js
    special.test.js
    score.test.js
    obstacles.test.js
    level.test.js
    game.test.js
    integration.test.js
  AGENTS.md
  ROADMAP.md
  PROGRESS.md
  DECISIONS.md
  prompts.md
  REFERENCES.md    # 外部参考项目与逐 Step 借鉴方案
  README.md
  LEVELS.md        # 关卡模式与 50 关设计表（关卡设计的唯一真相源，v1.13 登记）
  .gitignore
  package.json     # 仅含 {"type": "module"} 与 scripts，零依赖（见 DECISIONS.md D004）
  assets/          # 音频等资源，Step 16 起启用；零素材策略下仅限自制或已授权素材（见 D009）
```

### 2.3 模块边界

- `config.js`：唯一允许存放可调数值的文件。
- `game.js`：对外统一接口，组合调用其他逻辑模块，不碰 DOM。
- `board.js`：棋盘数据结构、交换、下落、填充、克隆；单向依赖 `shuffle.js` 的 `hasPossibleMove`。
- `shuffle.js`：可移动性判定、死局检测与重排（3.8）；只依赖 `config.js` 与 `match.js`。
- `match.js`：匹配检测，返回匹配组及其形状（直线、L 型、T 型）。
- `special.js`：根据匹配形状生成特殊元素，处理激活和组合。
- `score.js`：基础分、特效倍数、连消倍数计算。
- `obstacles.js`：障碍物创建、消除、层数管理。
- `level.js`：关卡配置、目标追踪、步数消耗、三星判定。
- `app.js`：应用编排——持有视图状态、调用游戏逻辑、按时间线起播动画。**不再直接读写 `localStorage`**（v1.16 起统一经 `storage.js`）。
- `render.js`：棋盘层绘制与几何计算（画布尺寸与 DPR、棋盘布局、静态图层烘焙、每帧贴图与几何命中）。只接收「场景描述」对象，不读游戏状态、不绑定事件、不碰存档；单向依赖 `hud.js` 取布局常量、`candy.js` 取糖果精灵。
- `candy.js`：糖果外观与精灵烘焙（形状路径、配色、内嵌图案、条纹特效及其方向箭头、包装糖果光晕与四角白结、魔力鸟彩虹环）。只接收坐标、颜色与形状参数，不认识棋盘状态、不读游戏状态、不绑定事件、不碰存档；依赖方向为 `render.js → candy.js` 单向，不得反向依赖。
- `hud.js`：信息层绘制（HUD 三个信息格、结束面板、重排提示）。只接收场景数据，不读游戏状态、不绑定事件、不碰存档。
- `input.js`：触摸与鼠标手势识别（滑动阈值、主轴锁定、视口守卫），只产出 `{ kind, x0, y0, x1, y1 }` 手势事件；不认识棋盘、不碰游戏状态与存档。
- `timeline.js`：动画时间线调度（阶段划分、时长计算、rAF 回放）。只接收阶段列表与每帧/结束回调；不读游戏状态、不碰存档、不实现游戏规则。
- `index.html`：只放结构、viewport、引入脚本。
- `styles.css`：移动端布局、禁止滚动、Canvas 样式。
- `tests/`：各模块的算法单元测试与集成测试。

---

## 3. 核心游戏规则（开心消消乐对标）

### 3.1 基础消除规则

- 三个相同的色块成同一直线（横竖均可）即可消除并产生分数。
- 只允许交换上下左右相邻格子。
- 交换后如果没有匹配，必须回退，不消耗步数。
- 只有有效交换才扣步数。
- 匹配检测必须同时检查横向和纵向。
- 下落填充后必须继续级联检测，直到无新匹配。

### 3.2 特殊元素生成规则

**条纹糖果（直线特效）**：四个同色糖果排成一行或一列（4 连）生成，消除一整行或一整列。条纹的方向决定爆破方向：横向四连生成横向条纹（消除整行），纵向四连生成纵向条纹（消除整列）。本项目以此为准；若需对标特定版本，须在关卡配置中显式声明。

**包装糖果（爆炸特效）**：五个同色糖果排成 T 型或 L 型（5 连非直线）生成，消除周围 3×3 共 9 格范围。

**魔力鸟**：五个同色糖果连成一条直线（5 连直线）生成。魔力鸟与任意普通色块对调，可消除全屏该颜色所有色块（含被交换的那一格与魔力鸟自身），该交换消耗 1 步；**不能与空格或纯障碍交换**。魔力鸟保留生成时的颜色用于渲染，但**不参与普通同色匹配**（4.3.14），只能通过交换触发；被其它特效波及时不额外触发全屏清除（保守口径，理由见 `DECISIONS.md` D025）。

生成优先级（当一次消除可同时满足多种形状时）：魔力鸟 > 包装糖果 > 条纹糖果。

### 3.3 特殊元素组合效果

两个相邻的特殊元素交换时触发组合效果：

| 组合 | 效果 |
|---|---|
| 条纹 + 条纹 | 同时触发两个直线爆破，形成十字形清除 |
| 条纹 + 包装 | 条纹方向全行/列清除，并对清除区域内再触发包装糖 3×3 爆炸 |
| 条纹 + 魔力鸟 | 将所有同色糖果转变为条纹糖果并立即触发 |
| 包装 + 包装 | 两个包装糖果各触发一次强化爆炸，范围约 5×5 |
| 包装 + 魔力鸟 | 将全屏同色糖果转变为包装糖果并触发 |
| 魔力鸟 + 魔力鸟 | 清除游戏面板上所有糖果 |

组合效果优先级：魔力鸟相关组合 > 包装 + 包装 > 条纹 + 包装 > 条纹 + 条纹。

### 3.4 障碍物规则

**冰块**：被冻在透明冰块内的动物可以移动并消除。冰块最多可叠加 3 层。消除冰块上面的小动物（普通消除与特效消除均可）连带消除一层冰块。每消除一层冰块得 1000 分。

**雪块**：最多可叠加 5 层。消除雪块旁边的小动物可以消除一层雪块，特效也可以消除一层雪块。

**藤蔓（第三阶段）**：被困的小动物不能移动，只能通过交换未被困的小动物进行关联消除。**v1.17 口径**：格内动物不能被交换 —— 判定在 `shuffle.isCellMovable`（返回 `false`），`game.trySwap` 直接拒绝并回退且**不消耗步数**；动物照常参与匹配、可被相邻消除波及，被消除后该格从上方补位；**藤蔓本身永不被清除**（永久锁格），因此 `obstacles.damageObstacle` / `board` 的受损判定必须跳过藤蔓。

**巧克力（第三阶段）**：单层，被相邻消除或特效波及时消除。**v1.17 口径**：它是占格障碍（格内没有动物、不参与匹配、不补位、把所在列切成上下两段），被**上下左右相邻**的动物消除波及、或被特效范围覆盖到该格时**整块消除**（与雪块同一条受损路径，不留残层）；每块 1000 分（3.5）。

障碍物不参与三消匹配，但占据格子，影响下落和交换。障碍物只能通过相邻位置的消除来被动减少层数。藤蔓中的动物不能被交换，但可以被相邻消除波及。

障碍物分两类（v1.12 明文，实现见 `board.js` 的洞/屏障判定）：

- **覆层障碍**（`ice` / `vine`）：格内有动物，动物照常参与匹配、可被交换（藤蔓例外，见上）。动物被消除后该格**从上方补位**，障碍物本身留在原格 —— 冰块因此可以被反复消除，3 层冰需要三次消除；冰层归零时冰块消失。
- **占格障碍**（`snow` / `choc`）：格内没有动物，不参与匹配、不补位、不下落，把所在列切成上下互不相通的两段（3.4「占据格子，影响下落」）。

**一层 = 一次「被波及」**：同一个级联层内，每格障碍物最多减少一层 —— 无论该层有多少颗相邻动物被消除、特效扫过多少格，都只算一次。冰块由其上的动物被消除而受损；雪块由**相邻（上下左右）**动物被消除、或被特效波及（特效范围覆盖到该格）而受损。

### 3.5 计分规则

基础消除：每个动物 10 分。

特效消除倍数（项目约定值，集中定义于 `config.js`，可调）：

| 触发类型 | 倍数 |
|---|---|
| 条纹糖果（4 消） | 基数 × 1.5 |
| 包装糖果（L/T 型） | 基数 × 2.0 |
| 魔力鸟（5 消直线） | 基数 × 2.5 |
| 条纹 + 条纹 | 基数 × 3.0 |
| 条纹 + 包装 | 基数 × 3.5 |
| 包装 + 包装 | 基数 × 4.0 |
| 魔力鸟 + 魔力鸟 | 基数 × 5.0 |

障碍物得分：冰块每层 1000 分，雪块每层 1000 分，**巧克力每块 1000 分（v1.17）**，宝石 1500 分。**藤蔓不计分**（v1.17：它永不被清除，不产生层数分）。

连续消除（连消）加分：**第 1 次消除（交换本身造成的消除）不计连消**；自第 2 层起每次递增一档，第 n 层（n ≥ 2）加 `(n − 1) × 30` 分，依次为 30、60、90、120。冰块连消每次 +1000 分，同样自第 2 层起依次叠加。

剩余步数转化：关卡结束时，每剩余一步约转化为 30 分连续消除加分。

障碍物计分（v1.12 明确）：层数分**另算、不参与特效倍数** —— 单层结算分 = 动物数 × 10 × 特效倍数 + 连消加分 + 障碍物层数分。冰块连消（同一局中第 n ≥ 2 层清掉冰块）额外加 `(n − 1) × 1000`，与普通连消的 +30/档并存（即 3.5 原文「冰块连消每次 +1000 分，同样自第 2 层起依次叠加」的落地口径）。

> 以上所有数值均为项目约定值，集中在 `config.js` 的 `SCORE_CONFIG` 中定义。修改数值必须同步更新本表与附录 B。

### 3.6 关卡目标系统

每个关卡必须配置至少一种通关目标，步数用尽时若目标未达成则游戏失败。

目标类型：

- **分数目标**：在限定步数内达到指定分数。例如“7000 分以上”。
- **收集动物**：消除指定种类和数量的动物。
- **消除冰块**：消除指定数量的冰块。
- **混合目标**：同时满足多个条件。
- **收集水果（水果关，v1.18）**：收集 N 个掉落到棋盘底部出口的水果。
- **收集金豆荚（金豆荚关，v1.18）**：收集 N 个掉落到棋盘底部出口的金豆荚（每次消除只下落 1 格）。
- **时间关（v1.18）**：在限定时间内达成上述任一目标；时间归零未达成即失败。

**关卡设计约束（硬指标，v1.13；50 关表的落点见 `LEVELS.md`）**：以下五条对每个关卡都成立，违反任一条即视为设计缺陷。

1. 单关**障碍物类型 ≤ 2 种**（冰块与雪块可以同台；第三种障碍需先在此登记其元素预算）。
2. 单关**障碍格 ≤ 12 格**（8×8 = 64 格的 20%）。障碍格 = 冰块格 + 雪块格。
3. **每关最多引入 1 种新机制**（新的障碍类型 / 新的目标类型 / 新解锁的层数档位）；新机制首次出现的关卡，其余维度（障碍格数、收集数量、三星阈值）**不升档**。
4. **混合目标最多 3 个大项**（`score` / `collect` / `clearIce` 各算一项），其中 `collect` 最多 2 个动物种类。
5. **目标必须可达**：`clearIce` 目标 ≤ 该关冰块总层数（`冰格数 × 冰层数`，雪块层数不计入 `clearedIce`）；`collect` 目标的单一动物数量 ≤ `步数 × 0.9`，多动物合计 ≤ `步数 × 1.6`（保守估算，用于排期而非精确模拟）。
6. **步数由难度派生（v1.15）**：关卡不手写步数，由 `level.computeStepBudget` 按
   `clamp(round(base + 目标工作量 × workload − 障碍摩擦), min, max)` 算出：
   目标工作量 = 分数目标 `target / scoreUnit` + 收集目标 `合计 / collectUnit` + 消冰目标 `target / iceUnit`（`mixed` 相加）；
   障碍摩擦 = `障碍格数 × perCell + 障碍总层数 × perLayer + max(0, 色数 − 5) × perColor`。
   系数全部来自 `CONFIG.STEP_BUDGET`（附录 B），是**设计期派生**：同配置同结果、无运行时随机。
7. **本局结束前引爆特殊方块（v1.15）**：走完最后一步（步数用尽）或已达成目标时，先引爆盘面上所有特殊方块，
   引爆过程中新生成的继续链式引爆（上限 `ENDGAME_CONFIG.maxDetonationRounds`），直到盘面无特殊方块。
   引爆的消除与得分**计入目标判定与分数**，之后才做星级结算；因此最后一步的引爆可以完成关卡目标。

### 3.7 三星评分系统

每个关卡配置三个分数阈值：一星（通关最低分）、二星、三星。

达成通关目标即获得一星。分数达到二星阈值获得二星，达到三星阈值获得三星。三星评分不依赖于步数剩余量，仅取决于最终得分。

### 3.8 死局检测与重排

每次消除和填充完成后，必须检测棋盘上是否存在至少一个有效交换（交换后能形成至少一组三消）。

如果无可行交换，必须自动重排棋盘（shuffle）或结束游戏。重排不消耗步数，且必须满足：

1. 重排后的棋盘不存在初始三连。
2. 重排后的棋盘存在至少一个有效交换。
3. 重排不得改变障碍物布局。
4. 重排尝试次数上限为 50 次；超过上限则判定为关卡异常，进入游戏结束流程。

---

## 4. 数据与算法契约

### 4.1 棋盘状态（唯一真相源）

棋盘为二维 `cell` 对象数组：

```js
cell = {
  color: 0-5,                                        // 颜色索引，null 表示空格或纯障碍
  type: 'normal' | 'striped' | 'wrapped' | 'magic',  // 元素类型
  direction: 'h' | 'v' | null,                       // 条纹方向
  obstacle: null | 'ice' | 'snow' | 'vine' | 'choc', // 障碍物类型
  obstacleLayers: 0-5,                               // 障碍物剩余层数
  collectible: null | 'fruit' | 'pod',               // v1.18：可掉落的收集物（水果/金豆荚）；占格、不参与匹配、
                                                     //   随重力下落、不可被消除或特效清除，与 obstacle 不是一类
  id: number                                         // 唯一标识，用于动画追踪
}
```

棋盘本身：

```js
board = cell[][]  // board[row][col]
```

约束：

- `board` 一经创建，行列数不可变。
- 所有模块读写棋盘必须使用此结构，禁止使用二维数字数组作为棋盘。
- 如需简化表达（如测试夹具），必须通过 `createBoard` 构造，不得直接构造裸数组传入逻辑函数。

### 4.2 模块接口契约

以下签名中，`Cell` 指 4.1 定义的 cell 对象，`Board` 指 `Cell[][]`，`Pos` 指 `{r: number, c: number}`。

**config.js**

- 导出 `CONFIG`：包含 `BOARD_SIZE`、`COLOR_COUNT`、`SCORE_CONFIG`、`ANIMATION_CONFIG`、`LEVEL_DEFAULTS`。
- 禁止在逻辑模块内直接写数值。

**game.js**

- `createGame(levelConfig: LevelConfig, options?: { rng?: () => number }): GameState`
- `trySwap(state: GameState, a: Pos, b: Pos): SwapResult`
- `resolveBoard(state: GameState, options?: { initialClear?: Pos[] }): ResolveResult`（消除 → 下落 → 填充 → 级联，返回轨迹供动画使用；`options.initialClear` 透传给 `board.resolveCascades`，供 3.2 的魔力鸟交换使用）
- `getState(state: GameState): GameSnapshot`（返回**深拷贝并冻结**的不可变快照，供 UI 读取）

结构定义（v1.4 补齐；此前只登记了函数名）：

```js
GameState = { level: Level, board: Board, gameOver: boolean, rng: () => number }
// 分数不另存字段：统一读 level.currentScore（4.4），避免两处真相源。
// rng 只用于「补充新格子」的随机源：生产为 Math.random，测试可注入确定性序列。

SwapResult = {
  valid: boolean, cascades: number, scoreDelta: number, stepsLeft: number, gameOver: boolean,
  resolve: ResolveResult | null,   // 供 UI 分层回放；无效交换时为 null
  afterSwap: Board | null          // 交换后、结算前的棋盘快照；无效交换时为 null
}

ResolveResult = {
  cascades: number,
  levels: ResolveLevel[],
  cleared: Cell[],                 // 展平后的被消除格子（含 color，供计分）
  damaged: ObstacleDamage[],       // 展平后的障碍物受损明细（v1.12 补，供 3.5 层数分与 UI 显示层数变化）
  collected: Pos[],                // v1.18：本局新收集的收集物坐标（水果/金豆荚落到出口行），供计分与 UI 播收动画
  spawned: Cell[],
  capped: boolean,                 // 是否触发级联层数上限（上限 = 棋盘格数，见 ROADMAP Step 3）
  scoreDelta: number,
  levelScores: LevelScore[],       // 逐层计分明细，供 UI 与测试核对 3.5 公式
  deadlock: DeadlockResolution | null  // 消除填充后检测到无可行交换时的处理结果（v1.5 补）
}

// v1.5 补：3.8 要求「每次消除和填充完成后」检测死局；这里把检测与重排的结果对 UI 公开，
// before/after 供重排动画使用（UI 按 cell.id 匹配即可得到每格的起止位置，无需额外轨迹字段）。
DeadlockResolution = {
  tries: number,      // 实际尝试的重排次数
  shuffled: boolean,  // 是否成功重排（false 表示超过上限，调用方应进入结束流程）
  before: Board,      // 重排前快照
  after: Board        // 重排后快照
}

ResolveLevel = { level: number, groups: MatchGroup[], cleared: Cell[], moves: MoveRecord[], spawned: Cell[], damaged: ObstacleDamage[], board: Board }
LevelScore   = { level: number, base: number, multiplier: number, bonus: number, obstacle: number, gained: number }
// v1.12：LevelScore.gained = base × multiplier + bonus + obstacle（3.5 的层数分另算，见上文 3.5）。

// v1.12 补：3.4 的「一层 = 一次被波及」需要把受损结果对上层公开，既用于 3.5 的层数分，也用于 UI 显示层数变化。
Obstacle       = { type: 'ice' | 'snow' | 'vine' | 'choc', layers: number }   // obstacles.createObstacle 的返回值
ObstacleDamage = { r: number, c: number, type: string, layersRemoved: number, cleared: boolean }

GameSnapshot = {
  levelId: number, rows: number, cols: number, colorCount: number,
  totalSteps: number, remainingSteps: number, currentScore: number, gameOver: boolean,
  goal: GoalSpec,                       // v1.14：HUD 常驻显示通关目标（5.5）
  collected: Record<string, number>,    // v1.14：本局已收集的动物计数（键为 COLOR_NAMES 里的名字）
  clearedIce: number,                   // v1.14：本局已清除的冰块层数（3.6 的 clearIce 目标用）
  collectedFruit: number,               // v1.18：本局已收集的水果数
  collectedPod: number,                 // v1.18：本局已收集的金豆荚数
  stars: 0 | 1 | 2 | 3,                 // v1.14：按 3.7 由最终分数算出
  won: boolean,                         // v1.14：是否已达成通关目标（与 gameOver 的「失败」区分）
  board: Board
}
```

**board.js**

- `createBoard(rows: number, cols: number, colorCount: number, obstacles?: ObstacleSpec[]): Board`（保证无初始三连且至少存在一个可行交换）
- `swapCells(board: Board, a: Pos, b: Pos): void`（原地交换）
- `applyGravity(board: Board): MoveRecord[]`（原地压缩并返回下落轨迹，供动画使用）
  - `MoveRecord = { id: number, from: Pos, to: Pos, color: number }`（只记录真正发生位移的格子；`id` 对应 4.1 的 `cell.id`，供动画追踪）
- `refillBoard(board: Board, colorCount: number, rng?: () => number): Cell[]`（原地填充空洞并返回新生成格子）
- `resolveCascades(board: Board, colorCount: number, options?: { rng?: () => number, initialClear?: Pos[] }): ResolveResult`（反复「消除 → 下落 → 填充」直到无新匹配；`options.initialClear` 让第一层先清除给定坐标（3.2 的魔力鸟交换用），之后照常级联；`game.resolveBoard` 在其上叠加计分与状态，不复写循环）
- `cloneBoard(board: Board): Board`（深拷贝，供测试与回退使用）

**shuffle.js**（v1.6 从 board.js 拆出，逻辑与签名不变）

- `isCellMovable(board: Board, r: number, c: number): boolean`
- `hasPossibleMove(board: Board): boolean`
- `shuffleBoard(board: Board, options?: { rng?: () => number, maxTries?: number }): boolean`
  - 3.8 的重排：只重排普通动物格（`color !== null && obstacle === null`），**不改变障碍物布局**；重排后不得存在初始三连且必须存在可行交换；成功返回 `true`，超过尝试上限返回 `false`（由调用方进入结束流程），失败时把棋盘还原为重排前的排列。`maxTries` 缺省取附录 B 的 `shuffleMaxTries`；`options.stats` 为可选诊断出参（写入实际尝试次数）。
  - 依赖方向：`shuffle.js` 只依赖 `config.js` 与 `match.js`；**board.js 单向依赖 shuffle.js**（`createBoard` 需要 `hasPossibleMove` 校验开局可玩性），不得反向依赖。

**match.js**

- `findMatches(board: Board): MatchGroup[]`，`MatchGroup = { cells: Pos[], shape: Shape, direction: 'h' | 'v' | null }`
- `detectMatchShape(cells: Pos[]): Shape`，`Shape = 'line3' | 'line4' | 'line5' | 'L' | 'T'`
- `matchShapeToSpecial(shape: Shape, direction: 'h' | 'v' | null): 'striped' | 'wrapped' | 'magic' | null`
- `findAllMatchGroups(board: Board): MatchGroup[]`（含重叠合并）

**special.js**

- `createSpecial(board: Board, matchGroup: MatchGroup): Pos`
- `activateSpecial(board: Board, r: number, c: number): Pos[]`
- `resolveSpecialCombo(board: Board, a: Pos, b: Pos): Pos[]`
- `getSpecialAffectedCells(board: Board, r: number, c: number, type: string, direction: string | null): Pos[]`
- `getMagicTargets(board: Board, color: number): Pos[]`（3.2：返回全屏与该颜色相同的格子坐标，供魔力鸟交换使用；不含魔力鸟自身，自身由调用方加入清除集合）

**score.js**

- `calcBaseScore(matchedCells: Cell[]): number`
- `calcSpecialMultiplier(type: string, comboType: string | null): number`
- `calcCascadeBonus(cascadeLevel: number, baseScore: number): number`
- `calcFinalScore(baseScore: number, multiplier: number, cascadeBonus: number): number`

**obstacles.js**

- `createObstacle(type: string, layers: number): Obstacle`
- `damageObstacle(board: Board, r: number, c: number, amount: number): { cleared: boolean, layersRemoved: number }`
- `getObstacleScore(type: string, layersRemoved: number): number`
- `isObstacleCleared(board: Board, r: number, c: number): boolean`

**level.js**

- `createLevel(config: LevelConfig): Level`（按 4.4 校验 `goal` 必填、`starThresholds` 为三元组且非递减）
- `consumeStep(level: Level): number`（扣 1 步并返回剩余步数，已为 0 时保持 0；4.3.3 的调用点在 `game.trySwap`）
- `checkGoal(level: Level, board: Board, score: number, collected: Record<string, number>): boolean`
- `calcStars(score: number, thresholds: [number, number, number]): 0 | 1 | 2 | 3`
- `getRemainingStepBonus(stepsLeft: number): number`
- `computeStepBudget(config: LevelConfig): number`（v1.15：按 3.6 的公式由难度派生步数；纯函数、无随机）

### 4.3 算法规则

1. 只允许交换上下左右相邻格子。
2. 交换后如果没有匹配，必须回退，不消耗步数。
3. 只有有效交换才扣步数。
4. 匹配检测必须同时检查横向和纵向。
5. 检测匹配时，必须识别连续长度：3 连（普通消除）、4 连（条纹）、5 连直线（魔力鸟）、L/T 型 5 连（包装糖果）。
6. 下落填充后必须继续级联检测，直到无新匹配。
7. 如果无可行交换，必须重排或结束游戏，且遵守 3.8 的重排约束。
8. 特殊元素在消除时优先激活其效果，再检查级联。
9. 两个特殊元素相邻交换时，触发组合效果，不进行普通匹配检测。
10. 障碍物不参与匹配，但占据格子，影响下落路径。
11. 藤蔓中的动物不能被交换，但可以被相邻消除波及。
12. 所有核心逻辑必须是纯函数或可测试函数。
13. 一次消除同时满足多种特殊形状时，按 3.2 优先级生成一种特殊元素，不重复生成。
14. 魔力鸟不参与普通同色匹配（3.2）：匹配扫描必须把它当作不可匹配（保留颜色仅供渲染）；条纹与包装糖果仍参与同色匹配，并在被消除时按 4.3.8 优先激活。

### 4.4 关卡数据结构契约

```js
LevelConfig = {
  id: number,
  rows: number,
  cols: number,
  colorCount: number,
  steps: number,
  goal: GoalSpec,
  starThresholds: [number, number, number],
  obstacles: ObstacleSpec[]
}

GoalSpec =
  | { type: 'score',    target: number }
  | { type: 'collect',  targets: Record<string, number> }
  | { type: 'clearIce', target: number }
  | { type: 'fruit',    target: number }   // v1.18：水果关，收集 N 个掉到底部出口的水果
  | { type: 'pod',      target: number }   // v1.18：金豆荚关，收集 N 个（每次消除只下落 1 格）
  | { type: 'mixed',    score?: number, collect?: Record<string, number>, clearIce?: number }

ObstacleSpec = { r: number, c: number, type: 'ice' | 'snow' | 'vine' | 'choc', layers: number }

Level = LevelConfig & {
  remainingSteps: number,
  collected: Record<string, number>,
  clearedIce: number,
  collectedFruit: number,  // v1.18：本局已收集的水果数（落到底部出口计数）
  collectedPod: number,    // v1.18：本局已收集的金豆荚数
  currentScore: number,
  completed: boolean       // v1.14：本局已达成通关目标（3.6）；与 gameOver 的失败原因分开
}
```

约束：

- `goal` 与 `starThresholds` 必填。
- `starThresholds` 必须是三元组，且非递减。
- 具体示例见第 14 节。
- 50 个关卡的实例值（目标、步数、色数、障碍布局、三星阈值）以 `LEVELS.md` 的 50 关表为准；`level.js` 落地时必须与之一致（v1.13）。

---

## 5. 移动端 UX 约束

### 5.1 视口与滚动

- `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`
- `body` 和 Canvas 设置 `touch-action: none`。
- 禁止页面滚动、下拉刷新、双指缩放。
- 使用 `env(safe-area-inset-*)` 适配刘海屏与 Home Indicator。

### 5.2 渲染

- Canvas 按 `devicePixelRatio` 适配，保持棋盘为正方形。
- 竖屏为主，横屏时给出提示或等比缩放，不重新布局。
- 动画帧率目标 60fps，低端机不得低于 30fps。

### 5.3 触摸交互

- 主交互使用 `touchstart` + `touchend` 判断滑动方向。
- 滑动阈值 20-30px，定义于 `ANIMATION_CONFIG`。
- 点击两次交换作为后备方案，但主交互必须是滑动。
- 触摸过程中锁定方向，避免斜向误判。

### 5.4 动画与反馈

- 动画不能阻塞逻辑更新；先更新状态，再播放动画。
- 特殊元素必须有明显的视觉区分（条纹方向箭头、包装糖果光晕、魔力鸟彩色光芒）。
- 障碍物必须有清晰的层数显示（冰块半透明叠加、雪块白色覆盖）。
- 连消时必须有分数飘字动画和连击提示。
- 色盲友好：颜色之外，普通动物必须有可区分的形状或图案。

### 5.5 UI 与提示

- 游戏结束用页面内 UI，禁止使用 `alert` 作为正式界面。
- 关卡目标、剩余步数、当前分数必须常驻可见。
- HUD 常驻**四格**：**分数 / 剩余步数 / 关卡目标进度 / 最高分**（v1.14）。目标进度显示「当前值/目标值」（如 `frog 8/12`、`消冰 5/12`、`分数 3200/7000`）；混合目标最多显示两项，其余的以「+N」提示。
- 无可行交换时，必须给出明确提示，再进行重排。

---

## 6. 代码风格

- 使用 `const` / `let`，禁止 `var`。
- 函数短小，单一职责。
- 纯函数优先，副作用集中在 `app.js`。
- 命名清晰：变量和函数 `camelCase`，常量 `UPPER_SNAKE_CASE`。
- 每个模块目标不超过 300 行；超过则拆分为更小的文件。
- 注释解释“为什么”，不解释“是什么”。游戏规则相关的注释必须引用本宪法章节号，例如 `// 见 3.2 生成优先级`。
- 不保留调试用 `console.log`；正式日志使用 `app.js` 中的 `log(level, msg)`。
- 不提交密钥、token、个人数据。
- 不擅自格式化整个文件；只改必要范围。
- 特殊元素类型的字符串常量必须集中定义于 `config.js`，禁止散落魔法字符串。
- 所有可调数值必须来自 `config.js`，禁止硬编码。

---

## 7. 测试与验证

### 7.1 自动化测试

每个算法函数必须有测试或可运行断言。测试文件覆盖：

```bash
node tests/run-all.js
```

或逐一运行：

```bash
node tests/board.test.js
node tests/match.test.js
node tests/special.test.js
node tests/score.test.js
node tests/obstacles.test.js
node tests/level.test.js
node tests/game.test.js
node tests/integration.test.js
```

关键测试用例示例：

- `match.test.js`：构造横向 3 连、4 连、5 连、L 型、T 型，断言 `shape` 与 `matchShapeToSpecial` 返回。
- `special.test.js`：构造两个相邻条纹，断言十字爆破坐标集合。
- `score.test.js`：给定匹配组，断言基础分、倍数、连消加分之和。
- `board.test.js`：构造死局棋盘，断言 `hasPossibleMove` 为 false，`shuffleBoard` 后为 true。
- `integration.test.js`：模拟一次完整交换 → 消除 → 下落 → 级联流程，断言最终棋盘状态与分数。

### 7.2 手动验证

打开 `index.html` 手动验证核心路径：

- 棋盘正常显示。
- 滑动可交换。
- 无效交换会回退。
- 3 连可消除。
- 4 连生成条纹糖果，激活后消除整行/列。
- L/T 型 5 连生成包装糖果，激活后消除 9 格。
- 5 连直线生成魔力鸟，激活后消除全屏同色。
- 条纹 + 条纹触发十字爆破。
- 消除后下落并补充。
- 级联消除正常。
- 步数正确减少。
- 冰块/雪块层数正确减少。
- 关卡目标追踪正确。
- 三星评分计算正确。
- 游戏结束和最高分正常。

### 7.3 错误检查

- 检查控制台无新增错误。
- 修 bug 时：先写失败用例，再修代码，最后确认用例通过。
- 禁止声称“已完成”而没有实际验证。

---

## 8. Agent 工作流

每次任务必须按以下格式执行：

1. 读取相关文件，至少包括 `AGENTS.md`、`ROADMAP.md` 当前 Step 及其「参考」栏指向的 `REFERENCES.md` 章节、`PROGRESS.md` 最近记录、`DECISIONS.md`（避免重走已被否决的路线）。
2. 输出 1-3 行计划：
   - 改哪些文件
   - 为什么改
   - 验收标准是什么
3. 只改必要代码，保持小步 diff。
4. 运行测试或手动验证。
5. 汇报：
   - 改了什么
   - 如何验证
   - 下一步建议

如果任务跨多个文件，先说明影响面。
如果需求模糊，先问 1-3 个关键问题，不要直接开写。

### 8.1 任务卡模板

```text
任务：
范围：
验收：
测试：
证据：
失败与回滚：
禁止：
前置依赖：
```

“前置依赖”一栏必须引用 `ROADMAP.md` 中的 Step 编号。

### 8.2 失败与回滚

- 若测试连续 2 次失败且原因不明，停止修改，向用户汇报，不得强行绕过。
- 每次小步修改前，确认当前工作区可运行；若不可运行，先恢复到最近可运行状态。
- 禁止使用 `git reset --hard` 或删除文件的方式回滚，除非用户明确授权。
- Bug 审计或平台构建失败时，保留完整错误、环境、复现步骤和相关 commit；修复后从失败边界重新验证，不得用“理论上可用”替代证据。
- 发布候选回滚必须回到固定 tag/commit，修复后递增构建版本并重新生成产物，不覆盖旧 Release 包。

### 8.3 会话开始与结束

- 会话开始时，先读 `AGENTS.md`、`ROADMAP.md` 当前 Step、`REFERENCES.md` 对应章节、`PROGRESS.md` 最近记录、`DECISIONS.md` 全部条目。
- 会话结束时，在 `PROGRESS.md` 追加一条记录；出现非显然决策时同时在 `DECISIONS.md` 追加。

### 8.4 扩展前审计与交付工作流

当用户要求“先检查 Bug”或准备进入新的玩法/包装阶段时，按以下顺序执行：

1. 先确定当前 Step、工作区状态和上次可运行 commit，不先写新玩法。
2. 运行自动测试与静态一致性检查，再做 HTTP 浏览器流程；每一步都记录退出码或明确写“未运行”。
3. 若有浏览器工具，再检查窄屏、触摸、滚动/缩放、安全区、输入锁和控制台；没有工具时如实写未验证。
4. 按 P0-P3 输出 findings，P0/P1 必须在当前阶段修复并增加回归用例；P2/P3 写入 `PROGRESS.md` 的负责人/复现/计划。
5. 只有达到 0.1 门禁，才允许勾选下一玩法 Step；Capacitor 相关任务还必须确认 0.3 的冻结版本、依赖批准和目标平台环境。
6. 对包装任务，逐项区分 Web 资源准备、原生工程生成、Debug 安装、真机验证、Release 签名、发布候选和商店审核；任何未实际执行的状态均写“未验证”。

---

## 9. 禁止事项

- 禁止一次性生成整个游戏。
- 禁止跨 Step 混合修改（见 0.1-0.3）。
- 禁止擅自引入依赖、框架、构建工具。
- 禁止在游戏逻辑模块（`config.js`、`game.js`、`board.js`、`match.js`、`special.js`、`score.js`、`obstacles.js`、`level.js`）中操作 DOM、Canvas、localStorage。
- 禁止删除或重写用户未要求修改的文件。
- 禁止为了让测试通过而硬编码结果。
- 禁止用 `alert` 做正式 UI。
- 禁止提交密钥、token、个人数据。
- 禁止在没有验证的情况下说“应该可以”。
- 禁止忽略移动端触摸和滚动问题。
- 禁止自行发明开心消消乐中不存在的规则或特殊元素类型。
- 禁止在没有规则依据的情况下修改计分公式。
- 禁止在逻辑模块中硬编码可调数值，必须走 `config.js`。
- 禁止在 4.1 之外另立棋盘数据结构。

---

## 10. 完成定义

一个任务完成必须同时满足：

- 代码可运行。
- 验收标准满足（对应 `ROADMAP.md` 该 Step 的“验收”）。
- 测试通过或手动验证通过（对应 `ROADMAP.md` 该 Step 的“测试”）。
- 无新增控制台错误。
- 变更说明清晰。
- 没有违反本宪法中的禁止事项。
- 如果涉及游戏规则，规则实现与本宪法第 3 节及附录 A 一致。
- 如果涉及数值改动，`config.js` 与附录 B 已同步。
- `PROGRESS.md` 已追加记录。
- 所有“通过”结论都标注了 0.2 的证据等级，并明确哪些内容只是代码审查或仍未验证。
- 若任务是进入下一玩法 Step，0.1 Bug Audit Gate 已通过；若任务是平台交付，目标平台的构建、安装、回归、签名和产物证据已分别满足对应门槛。

---

## 11. 宪法修改与修订记录

修改本文件必须得到用户明确批准。每次修改记录日期、原因和影响范围。

| 版本 | 日期     | 修改人 | 原因                                                         | 影响范围                 |
| ---- | -------- | ------ | ------------------------------------------------------------ | ------------------------ |
| v1.0 | （初始） | 用户   | 初始版本                                                     | 全文                     |
| v1.1 | （本次） | Agent  | 统一数据结构、补全禁止项、新增术语表与配置项表、强化可执行性 | 全文                     |
| v1.2 | 2026-09-18 | Agent  | 补全 game.js 接口与 4.4 关卡契约、与 ROADMAP 双向引用、清理附录 B 残渣 | 4.2、4.4、12、17、附录 B |
| v1.3 | 2026-09-18 | Agent  | 补齐 REFERENCES.md 的宪法地位（六处）、2.2 节目录补 package.json 与 assets/、第 0 节优先级纳入 REFERENCES.md、附录 B 补 9 键并新增 B-2 字符串常量表、通篇移除不可见字符与格式缺陷 | 2.2、第 0 节、第 8 节、8.1、8.3、12、17、附录 B、附录 B-2、修订记录 |
| v1.4 | 2026-09-19 | Agent  | 把 Step 2-4 的契约扩展与规则口径写入宪法：4.2 补齐 GameState/SwapResult/ResolveResult/ResolveLevel/LevelScore/GameSnapshot/MoveRecord 结构并登记 `options.rng`、`board.resolveCascades`、`level.consumeStep`；3.5 明确连消自第 2 层起计；2.2/2.3 登记 Step 5 的 `render.js`/`input.js` 拆分 | 2.2、2.3、3.5、4.2、11 |
| v1.5 | 2026-09-19 | Agent  | 登记 Step 5 的第二次拆分（`hud.js` 信息层、`timeline.js` 时间线）并写明边界；4.2 扩展 `shuffleBoard` 增加 `rng`/`maxTries` 选项、补 `ResolveResult.deadlock`（`DeadlockResolution`）以支撑 3.8 的死局检测与重排 | 2.2、2.3、4.2、11 |
| v1.6 | 2026-09-19 | Agent  | Step 6.1 纯重构：把可移动性判定、死局检测与重排从 `board.js` 拆到新增的 `shuffle.js`（逻辑与行为零改动），2.2/2.3 登记新文件与依赖方向，4.2 相应移动三条契约 | 2.2、2.3、4.2、11 |
| v1.7 | 2026-09-19 | Agent  | Step 7 落地用户批准的糖果外观方案后，`render.js` 超过第 6 节的 300 行上限，故拆出 `candy.js`（糖果形状、配色、内嵌图案、条纹特效与精灵烘焙）；2.2/2.3 登记新文件与依赖方向（`render.js → candy.js` 单向） | 2.2、2.3、11 |
| v1.8 | 2026-09-20 | Agent  | 经用户批准，在 Step 8 前新增 Bug Audit Gate、L0-L6 证据与“核心可玩 → 移动可玩 → 功能冻结 → 包装候选 → 平台验证 → 发布候选”门槛；明确 Capacitor 仅为 Step 18 的受控依赖例外，并拆分 18.1-18.7 的原生交付、签名、合规、回归与回滚要求 | 0.1-0.3、2.1、8.1-8.4、10-12、16-17、Step 18 相关交叉引用 |
| v1.9 | 2026-09-20 | Agent  | 收尾扩展前 Bug Audit：修正第 9 节与第 17 节的旧门禁引用；明确结束日志按步数用尽/死局重排失败区分；明确极窄视口棋盘尺寸服从可用空间，避免最小尺寸造成溢出 | 8.4、9、17、`app.js`、`render.js` |
| v1.10 | 2026-09-20 | Agent（用户批准） | 登记「路线图先行」的既成事实（ROADMAP v1.10 已先行引入 0.1-0.8），使两文件头部版本一致并关闭 P3-1；`candy.js` 职责补全为「条纹 / 包装 / 魔力鸟特效」（Step 8 起它还要画包装，Step 9 起为魔力鸟）；一致性脚本恢复「头部版本必须相等」的严格判定 | 2.2、2.3、11、`_build/consistency_check.py` |
| v1.11 | 2026-09-20 | Agent（用户批准） | Step 9 魔力鸟的规则口径与契约：3.2 补「清全屏该色（含被交换格与自身）、消耗 1 步、不能与空格/纯障碍交换、不参与同色匹配、被其它特效波及时不额外触发」；4.3 新增第 14 条（匹配层排除魔力鸟）；4.2 三条纯追加（`special.getMagicTargets`、`board.resolveCascades` 的 `initialClear`、`game.resolveBoard` 的透传）；ROADMAP 头部同步升到 v1.11 | 3.2、4.2、4.3、11、`ROADMAP.md` |
| v1.12 | 2026-09-20 | Agent（用户批准） | Step 11 冰块与雪块的口径与契约：3.4 补「冰块内的动物被消除后该格补位且冰块保留（3 层冰需三次消除）」「同一级联层内每格障碍物最多 −1 层」「覆层障碍（ice/vine）与占格障碍（snow/choc）两类」，并修正「冰块格在动物被消除后被误判为屏障」的潜伏缺陷；3.5 补「层数分另算、不参与特效倍数」「冰块连消 (n−1)×1000 与普通连消并存」；4.2 三条纯追加（`Obstacle`、`ObstacleDamage` 与 `ResolveLevel/ResolveResult.damaged`、`LevelScore.obstacle`）；ROADMAP 头部同步升到 v1.12 | 3.4、3.5、4.2、11、`ROADMAP.md` |
| v1.14 | 2026-09-20 | Agent（用户批准） | Step 12 的契约与 UI 口径：4.2 追加 `GameSnapshot` 的 `goal`/`collected`/`clearedIce`/`stars`/`won`；4.4 追加 `Level.completed`；5.5 落地 HUD 四格（分数/步数/目标进度/最高分）；附录 B 新增 `STORAGE_KEYS.LEVEL_STARS`（每关星级存档键） | 4.2、4.4、5.5、附录 B、11 |
| v1.16 | 2026-09-20 | Agent（用户批准） | 拆出 `storage.js`（本地存档读写与容错），把「唯一允许读写 `localStorage`」的职责从 `app.js` 移到该模块；2.2 节目录与 2.3 边界同步；`app.js` 因 Step 12 的选关/星级/目标 HUD 一度涨到 366 行，拆分后回到 297 行（第 6 节的 300 行上限） | 2.2、2.3、11、`storage.js`、`app.js`、`ROADMAP.md` |
| v1.17 | 2026-09-20 | Agent（用户批准） | Step 13（藤蔓、巧克力）的口径与计分：3.4 补藤蔓「不能被交换（判定在 `shuffle.isCellMovable`，`trySwap` 拒绝且不扣步）、动物照常匹配、**藤蔓本身永不被清除**」与巧克力「占格、单层、被相邻消除或特效波及即整块消除」；3.5 补「巧克力每块 1000 分、藤蔓不计分」；附录 B 新增 `SCORE_CONFIG.chocPerLayer`（1000）；50 关表不变 | 3.4、3.5、11、附录 B、`config.js`、`obstacles.js`、`board.js` |
| v1.18 | 2026-09-20 | Agent（用户批准） | Step 14（关卡类型）的规则口径：3.6 新增水果关（水果占格、不参与匹配、随重力下落、不可被消除，落到底部出口计数）、时间关（**倒计时替代步数**，时间归零未达目标即失败）、金豆荚关（可掉落收集物、**每次消除只下落 1 格**）与对应目标类型；明确收集物与障碍物的边界；数据结构契约（4.1/4.4/附录 B）随 14.1 的代码在同一版本内补齐 | 3.6、第 1 节、11、`ROADMAP.md` |
| v1.15 | 2026-09-20 | Agent（用户批准） | Step 12 的两条玩法规则：3.6 新增「步数由难度派生」（`computeStepBudget` + `STEP_BUDGET` 系数）与「本局结束前引爆特殊方块再结算」（链式引爆，成果计入目标判定与分数）；4.2 补 `level.computeStepBudget`；附录 B 新增 `STEP_BUDGET` 10 键与 `ENDGAME_CONFIG.maxDetonationRounds`；`LEVELS.md` 的步数列改为公式输出 | 3.6、4.2、附录 B、11、`LEVELS.md` |
| v1.13 | 2026-09-20 | Agent（用户批准） | Step 12 开工前引入关卡模式：新增配套文件 `LEVELS.md`（50 关设计表）并登记进 2.2 节目录与第 17 节配套文件表；3.6 新增五条关卡设计硬指标（障碍类型 ≤2、障碍格 ≤12、每关只引入 1 种新机制、mixed ≤3 大项且 collect ≤2 种、目标可达性）；4.4 补充「50 关实例以 LEVELS.md 为准」 | 2.2、3.6、4.4、11、17、`LEVELS.md`、`ROADMAP.md` |

---

## 12. 初始协作提示词

每次新会话，用户可以先对 Agent 说：

> 请先阅读 `AGENTS.md`、`ROADMAP.md`、`REFERENCES.md`、`PROGRESS.md`、`DECISIONS.md`。然后按 `ROADMAP.md` 的 Step 0 开始。只允许修改该 Step“范围”内列出的文件。先给计划，再改代码，最后告诉我如何验证。

后续 Step 使用 ROADMAP 中该 Step 自带的提示词模板。通用模板：

```text
任务：实现 <功能名>
范围：只允许修改 <文件列表>
验收：<可观察的行为>
测试：<运行哪些测试 / 手动验证步骤>
证据：<ROADMAP.md §0.2 的 L0-L6；已验证 / 仅代码审查 / 未验证>
失败与回滚：<保留哪些错误证据，回到哪个 commit/tag 或子步骤>
禁止：<本步明确不允许做的事>
前置依赖：<ROADMAP 中的 Step 编号>
```

若仓库已经存在已完成 Step，不得按示例重新从 Step 0 开始；应先读取 `PROGRESS.md` 和 `DECISIONS.md`，锁定当前暂停点。准备进入新玩法时，先执行 0.1；准备进行原生包装时，先确认 0.3 的冻结版本和用户批准的 Step 18 子步骤。

Step 18 统一提示词模板：

```text
任务：按 ROADMAP.md Step 18.<子步骤> 将冻结的 H5 消消乐包装为 Capacitor 候选版本
开始前：完成 0.1 Bug Audit Gate，读取 DECISIONS.md 的依赖例外批准，固定 commit/tag，确认目标平台与可用环境
范围：只改当前子步骤列出的文档、资源准备、Capacitor 配置或平台工程；不得推进 Step 8-17，不得重写游戏规则
证据：按 0.2 标注 L0-L6，分别报告已验证、仅代码审查、未验证；Windows 上 iOS 一律未验证
验收：满足对应子步骤门禁，并将命令、工具版本、设备、产物、校验值和失败边界写入 PROGRESS.md
安全：密钥、证书、Provisioning Profile、密码、真实账号和个人设备信息不得进入 Git、日志或截图
失败与回滚：保留完整错误和最小复现；修复后从 Web 资源暂存与 cap sync 重新验证，发布阻塞缺陷回到固定 tag/commit 并递增构建版本
参考：REFERENCES.md 对应 Step 18.<子步骤>
```

---

## 13. 术语表

| 术语        | 含义                                         |
| ----------- | -------------------------------------------- |
| 动物 / 色块 | 棋盘上可消除的普通元素，由 `color` 区分      |
| 条纹糖果    | 4 连生成的特殊元素，消除整行或整列           |
| 包装糖果    | L/T 型 5 连生成的特殊元素，消除周围 9 格     |
| 魔力鸟      | 5 连直线生成的特殊元素，消除全屏同色         |
| 障碍物      | 冰块、雪块、藤蔓、巧克力等不可匹配元素       |
| 连消 / 级联 | 一次消除下落填充后再次形成的消除             |
| 死局        | 棋盘上不存在任何有效交换的状态               |
| 重排        | 在不改变障碍物布局的前提下重新排列普通元素   |
| 关卡目标    | 通关需满足的条件，如分数、收集数量、消除冰块 |
| 三星评分    | 依据最终分数判定 1-3 星                      |
| Step        | `ROADMAP.md` 中的最小可验收任务单元          |
| Bug Audit Gate | 进入下一玩法 Step 前，对回归、浏览器、移动交互和未验证边界做的强制审计 |
| 证据等级    | L0-L6，表示从代码审查到发布候选的可声明范围   |
| 功能冻结    | 固定可回退版本，暂停玩法扩展，只修复阻塞缺陷   |
| 包装候选    | 已准备可重建 Web 资源和原生包装输入，但不等于平台已验证 |
| 发布候选    | 已有签名产物、安装/升级回归和合规归档的版本   |

---

## 14. 关卡配置示例

```js
const LEVEL_1 = {
  id: 1,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 30,
  goal: {
    type: 'score',
    target: 7000
  },
  starThresholds: [7000, 12000, 18000],
  obstacles: []
};

const LEVEL_2 = {
  id: 2,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 25,
  goal: {
    type: 'collect',
    targets: { frog: 10, hippo: 25 }
  },
  starThresholds: [8000, 14000, 20000],
  obstacles: [
    { r: 3, c: 3, type: 'ice', layers: 2 },
    { r: 3, c: 4, type: 'ice', layers: 2 },
    { r: 4, c: 3, type: 'snow', layers: 3 }
  ]
};

const LEVEL_3 = {
  id: 3,
  rows: 8,
  cols: 8,
  colorCount: 6,
  steps: 28,
  goal: {
    type: 'mixed',
    score: 9000,
    collect: { frog: 25, hippo: 25 },
    clearIce: 12
  },
  starThresholds: [9000, 15000, 22000],
  obstacles: []
};
```

---

## 15. 性能与动画预算

| 项目               | 目标                                                   |
| ------------------ | ------------------------------------------------------ |
| 帧率               | 60fps，低端机不低于 30fps                              |
| 单次消除动画时长   | 200-300ms                                              |
| 下落动画时长       | 150-250ms，按距离缩放                                  |
| 级联间隔           | 100-150ms                                              |
| 单帧绘制调用       | 不超过 200 次                                          |
| 棋盘更新与渲染解耦 | 必须先更新逻辑状态，再播放动画                         |
| 内存               | 单局新增对象可被 GC 回收，禁止长期持有已消除 cell 引用 |

所有时长定义于 `config.js` 的 `ANIMATION_CONFIG`。

---

## 16. 提交与回滚规范

- 每次小步修改后提交一次，提交信息格式：`[stepN] 简短描述`。
- 提交信息必须说明改动模块与验收方式。
- 禁止在一个提交中混合多个不相关改动。
- 若某次修改导致测试失败且 30 分钟内无法修复，必须回滚到上一个可运行提交。
- 回滚优先使用 `git revert`，禁止 `git reset --hard`，除非用户授权。
- 每个 Step 完成后建议打一次轻量 tag：`stepN-done`。

---

## 17. 配套文件与交叉引用

| 文件           | 职责                      | 谁维护                  | 何时更新             |
| -------------- | ------------------------- | ----------------------- | -------------------- |
| `AGENTS.md`    | 宪法，最高约束            | 用户批准后由 Agent 更新 | 规则或结构变更时     |
| `ROADMAP.md`   | Step 级任务清单与验收标准 | Agent 提议，用户批准    | 新增或调整 Step 时   |
| `REFERENCES.md` | 外部参考项目与逐 Step 借鉴方案 | Agent 提议，用户批准 | 新增参考项目或调整借鉴策略时 |
| `PROGRESS.md`  | 跨会话进度日志            | Agent 每次会话结束追加  | 每次会话结束         |
| `DECISIONS.md` | 关键决策记录              | Agent 每次决策后追加    | 出现非显然决策时     |
| `prompts.md`   | 复用提示词库              | Agent 建议，用户取舍    | 每个 Step 完成时     |
| `README.md`    | 项目门面                  | Agent 建议，用户确认    | 阶段变更或首次发布时 |
| `LEVELS.md`    | 关卡模式与 50 关设计表（关卡设计的唯一真相源） | Agent 提议，用户批准 | 新增/调整关卡或机制时 |

交叉引用规则：

- 宪法第 1 节与 ROADMAP 第 1 节必须一致。
- 宪法第 12 节与 ROADMAP 各 Step 的提示词模板必须一致。
- 宪法附录 B 与 `config.js` 必须一致（数值见附录 B，字符串常量见附录 B-2）。
- 宪法第 8 节、ROADMAP 第 0.1-0.3 条与 `REFERENCES.md` 的 Step 编号必须对齐。
- 任何文件之间的冲突，以宪法为准，并在 `DECISIONS.md` 记录冲突与解决方式。

---

## 附录 A：开心消消乐规则速查表

### 特殊元素生成

| 消除形状            | 生成元素 | 效果          |
| ------------------- | -------- | ------------- |
| 3 连（横/竖）       | 无       | 普通消除      |
| 4 连（横/竖直线）   | 条纹糖果 | 消除整行/整列 |
| 5 连（L 型或 T 型） | 包装糖果 | 消除周围 9 格 |
| 5 连（横/竖直线）   | 魔力鸟   | 消除全屏同色  |

### 特殊元素组合

| 组合            | 效果                       |
| --------------- | -------------------------- |
| 条纹 + 条纹     | 十字形双向直线爆破         |
| 条纹 + 包装     | 条纹方向清除 + 区域爆炸    |
| 条纹 + 魔力鸟   | 全屏同色变为条纹糖果并触发 |
| 包装 + 包装     | 强化爆炸，范围约 5×5       |
| 包装 + 魔力鸟   | 全屏同色变为包装糖果并触发 |
| 魔力鸟 + 魔力鸟 | 清除全屏所有糖果           |

### 计分速查

| 项目            | 得分/倍数    |
| --------------- | ------------ |
| 普通动物        | 10 分/个     |
| 冰块每层        | 1000 分      |
| 雪块每层        | 1000 分      |
| 宝石            | 1500 分      |
| 条纹糖果触发    | 基数 × 1.5   |
| 包装糖果触发    | 基数 × 2.0   |
| 魔力鸟触发      | 基数 × 2.5   |
| 条纹 + 条纹     | 基数 × 3.0   |
| 条纹 + 包装     | 基数 × 3.5   |
| 包装 + 包装     | 基数 × 4.0   |
| 魔力鸟 + 魔力鸟 | 基数 × 5.0   |
| 连消（普通）    | +30/次递增   |
| 连消（冰块）    | +1000/次递增 |
| 剩余步数        | 约 30 分/步  |

### 障碍物速查

| 障碍物 | 最大层数 | 消除方式                            |
| ------ | -------- | ----------------------------------- |
| 冰块   | 3 层     | 消除其上动物或特效波及，连带减 1 层 |
| 雪块   | 5 层     | 消除旁边动物或特效波及，减 1 层     |
| 藤蔓   | 1 层     | 被相邻消除波及，动物不能交换        |
| 巧克力 | 1 层     | 被相邻消除波及                      |

---

## 附录 B：配置项集中表

所有可调数值必须来自 `config.js`，并在本表登记。

| 配置键                             | 含义               | 默认值               | 所属规则 |
| ---------------------------------- | ------------------ | -------------------- | -------- |
| `BOARD_SIZE`                       | 棋盘边长           | 8                    | 1        |
| `COLOR_COUNT`                      | 颜色数             | 6                    | 3.1      |
| `SCORE_CONFIG.basePerCell`         | 普通动物基础分     | 10                   | 3.5      |
| `SCORE_CONFIG.icePerLayer`         | 冰块每层得分       | 1000                 | 3.5      |
| `SCORE_CONFIG.snowPerLayer`        | 雪块每层得分       | 1000                 | 3.5      |
| `SCORE_CONFIG.chocPerLayer`        | 巧克力每块得分     | 1000                 | 3.5      |
| `COLLECTIBLE_CONFIG.fruitFallPerStep` | 水果单次下落格数（≥ 列高即视为整列直落） | 99 | 3.6 v1.18 |
| `COLLECTIBLE_CONFIG.podFallPerStep`   | 金豆荚单次下落格数（分阶段节奏）        | 1  | 3.6 v1.18 |
| `COLLECTIBLE_CONFIG.exitRow`          | 底部出口所在行（收集物到达即计数）      | 7  | 3.6 v1.18 |
| `SCORE_CONFIG.gemScore`            | 宝石得分           | 1500                 | 3.5      |
| `SCORE_CONFIG.specialMultipliers`  | 特效倍数表         | 见 3.5               | 3.5      |
| `SCORE_CONFIG.cascadeStep`         | 普通连消递增       | 30                   | 3.5      |
| `SCORE_CONFIG.cascadeIceStep`      | 冰块连消递增       | 1000                 | 3.5      |
| `SCORE_CONFIG.stepBonus`           | 剩余步数转化       | 30                   | 3.5      |
| `ANIMATION_CONFIG.swipeThreshold`  | 滑动阈值（px）     | 25                   | 5.3      |
| `ANIMATION_CONFIG.clearDuration`   | 消除动画时长（ms） | 250                  | 15       |
| `ANIMATION_CONFIG.fallDuration`    | 下落动画时长（ms） | 200                  | 15       |
| `ANIMATION_CONFIG.cascadeGap`      | 级联间隔（ms）     | 120                  | 15       |
| `ANIMATION_CONFIG.shuffleMaxTries` | 重排最大尝试次数   | 50                   | 3.8      |
| `STEP_BUDGET.base`                 | 步数公式基准       | 24                   | 3.6      |
| `STEP_BUDGET.workload`             | 每单位目标工作量的步数 | 1.6              | 3.6      |
| `STEP_BUDGET.perCell`              | 每障碍格的步数扣减 | 0.25                 | 3.6      |
| `STEP_BUDGET.perLayer`             | 每层障碍的步数扣减 | 0.2                  | 3.6      |
| `STEP_BUDGET.perColor`             | 超过 5 色每色的扣减 | 2                   | 3.6      |
| `STEP_BUDGET.min`                  | 派生步数下限       | 20                   | 3.6      |
| `STEP_BUDGET.max`                  | 派生步数上限       | 34                   | 3.6      |
| `STEP_BUDGET.scoreUnit`            | 分数目标的工作量单位 | 2000               | 3.6      |
| `STEP_BUDGET.collectUnit`          | 收集目标的工作量单位 | 4                  | 3.6      |
| `STEP_BUDGET.iceUnit`              | 消冰目标的工作量单位 | 4                  | 3.6      |
| `ENDGAME_CONFIG.maxDetonationRounds` | 结束前引爆的最大轮数 | 8                 | 3.6      |
| `LEVEL_DEFAULTS.steps`             | 关卡默认步数       | 30                   | 3.6      |
| `LEVEL_DEFAULTS.starThresholds`    | 关卡默认三星阈值   | [7000, 12000, 18000] | 3.7      |
| `COLOR_NAMES`                      | 颜色索引 0-5 到动物名映射 | `['frog','hippo','ladybug','octopus','chick','fox']` | 3.6 / 13 |
| `OBSTACLE_CONFIG.ice.maxLayers`    | 冰块最大层数       | 3                    | 3.4      |
| `OBSTACLE_CONFIG.snow.maxLayers`   | 雪块最大层数       | 5                    | 3.4      |
| `OBSTACLE_CONFIG.vine.maxLayers`   | 藤蔓层数           | 1                    | 3.4      |
| `OBSTACLE_CONFIG.choc.maxLayers`   | 巧克力层数         | 1                    | 3.4      |
| `ANIMATION_CONFIG.reducedMotion`   | 跟随系统减少动效   | false                | 5.4      |
| `STORAGE_KEYS.BEST_SCORE`          | 最高分存储键       | `xxl_best_score`     | 3.5 / ROADMAP Step 4 |
| `STORAGE_KEYS.LEVEL_STARS`         | 每关星级存档键     | `xxl_level_stars`    | 3.7 / ROADMAP Step 12.2 |
| `STORAGE_KEYS.MUTED`               | 静音开关存储键     | `xxl_muted`          | ROADMAP Step 16 |
| `STORAGE_KEYS.BOOSTERS`            | 道具数量存储键     | `xxl_boosters`       | ROADMAP Step 15 |

新增或修改配置项时，必须同步更新本表与第 3 节相关条款。第 1 条（`COLOR_NAMES`）的映射顺序即 `cell.color` 索引语义，调整顺序等于改动所有关卡目标，属破坏性变更。

### 附录 B-2：字符串常量登记表

本表登记 `config.js` 导出的字符串常量对象（第 6 节要求：特殊元素类型的字符串常量必须集中定义于 `config.js`，禁止散落魔法字符串）。这些是**枚举常量**而非可调数值，改动会破坏存档兼容或历史测试夹具，因此同样必须登记。

| 常量对象         | 内容                                             | 所属规则     |
| ---------------- | ------------------------------------------------ | ------------ |
| `CELL_TYPE`      | `normal` / `striped` / `wrapped` / `magic`       | 4.1 / 3.2    |
| `OBSTACLE_TYPE`  | `ice` / `snow` / `vine` / `choc`                 | 4.1 / 3.4    |
| `DIRECTION`      | `h` / `v`                                        | 4.1 / 3.2    |
| `MATCH_SHAPE`    | `line3` / `line4` / `line5` / `L` / `T`          | 4.2 / 4.3    |
| `GOAL_TYPE`      | `score` / `collect` / `clearIce` / `mixed`       | 4.4 / 3.6    |
| `STORAGE_KEYS`   | 见附录 B 上表                                    | 2.3 / 9      |
