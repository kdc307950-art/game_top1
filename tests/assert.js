// tests/assert.js — 极简断言工具 + 测试注册表
// 不依赖任何测试框架。见 AGENTS.md 7.1。
//
// 用法（两种都支持）：
//   1) 单文件跑：node tests/board.test.js      —— 文件末尾的 summarize() 自动执行
//   2) 全量跑：  node tests/run-all.js         —— 自动发现 tests/*.test.js，失败时退出码 1
//
// 约定：测试文件顶部 `import { test, assertEqual, assertTrue } from './assert.js';`
//       文件末尾 `if (!globalThis.__XXL_TEST_BUNDLE__) summarize();`

const state = (globalThis.__XXL_TEST_STATE__ ??= {
  file: null,
  tests: [],
  assertions: 0,
  loadErrors: [],
  pending: [] // P3-13：异步用例的 Promise 收在这里，由 summarize() 统一 await
});

/** run-all.js 在每个测试文件导入前调用，用于归属统计。 */
export function setFile(name) {
  state.file = name;
}

function fail(message, expected, actual) {
  const err = new Error(`FAIL: ${message}\n  expected: ${safe(expected)}\n  actual:   ${safe(actual)}`);
  err.__assertion = true;
  throw err;
}

function safe(value) {
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

export function assertEqual(actual, expected, msg = 'assertEqual') {
  state.assertions++;
  if (actual !== expected) fail(msg, expected, actual);
}

export function assertTrue(value, msg = 'assertTrue') {
  state.assertions++;
  if (!value) fail(msg, true, value);
}

export function assertFalse(value, msg = 'assertFalse') {
  state.assertions++;
  if (value) fail(msg, false, value);
}

export function assertDeepEqual(actual, expected, msg = 'assertDeepEqual') {
  state.assertions++;
  const a = safe(actual);
  const e = safe(expected);
  if (a !== e) fail(msg, expected, actual);
}

export function assertThrows(fn, msg = 'assertThrows') {
  state.assertions++;
  let threw = false;
  try {
    fn();
  } catch {
    threw = true;
  }
  if (!threw) fail(msg, 'throw', 'no throw');
}

/**
 * 注册并立即执行一个用例；断言失败时记录错误但继续跑后续用例。
 *
 * P3-13 根治（Step 16）：用例函数可以是 async —— 它的 Promise 会被收进 `state.pending`，
 * 由 `summarize()` 逐个 await 之后再统计。修之前 `test()` 不 await，异步用例的断言会在
 * summarize 之后才跑：既不计入统计，又只能靠 unhandled rejection 暴露失败（等于一段假绿）。
 */
export function test(name, fn) {
  const entry = { file: state.file ?? '(direct)', name, ok: true, error: null, async: false };
  const record = (err) => {
    entry.ok = false;
    entry.error = err;
  };
  let result;
  try {
    result = fn();
  } catch (err) {
    record(err);
  }
  if (result && typeof result.then === 'function') {
    entry.async = true;
    state.pending ??= [];
    state.pending.push(result.then(() => {}, (err) => record(err)));
  }
  state.tests.push(entry);
  return entry.ok;
}

/** run-all.js 在某个测试文件加载/语法失败时调用。 */
export function recordLoadError(file, err) {
  state.loadErrors.push({ file, error: err });
}

/** 打印汇总；有失败或加载错误时把 process.exitCode 置 1（不中断输出）。
 *  P3-13：先 await 所有异步用例，再统计 —— 否则它们的断言会被算漏。 */
export async function summarize() {
  if (state.pending && state.pending.length > 0) {
    const pending = state.pending.splice(0, state.pending.length);
    await Promise.all(pending);
  }
  const passed = state.tests.filter((t) => t.ok).length;
  const failed = state.tests.length - passed;
  const asyncCount = state.tests.filter((t) => t.async).length;
  const direct = state.file === null && state.tests.length > 0;

  if (direct) console.log(`\n[assert] 直接运行模式：${process.argv[1]}`);

  for (const t of state.tests) {
    if (!t.ok) {
      const first = String(t.error && t.error.message ? t.error.message : t.error).split('\n')[0];
      console.log(`  ✗ [${t.file}] ${t.name}\n      ${first}`);
    }
  }

  for (const e of state.loadErrors) {
    const first = String(e.error && e.error.message ? e.error.message : e.error).split('\n')[0];
    console.log(`  ✗ [${e.file}] 加载失败：${first}`);
  }

  console.log(
    `\n[assert] 用例 ${state.tests.length} 个（通过 ${passed} / 失败 ${failed}）` +
      `，断言 ${state.assertions} 次，加载错误 ${state.loadErrors.length} 个` +
      (asyncCount > 0 ? `，异步用例 ${asyncCount} 个（已 await）` : '')
  );

  if (failed > 0 || state.loadErrors.length > 0) {
    console.log('[assert] 结果：FAIL');
    process.exitCode = 1;
  } else {
    console.log('[assert] 结果：PASS');
  }
  return { passed, failed, assertions: state.assertions, loadErrors: state.loadErrors.length };
}
