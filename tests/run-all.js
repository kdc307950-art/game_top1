// tests/run-all.js — 测试入口（自动发现模式）
// 见 AGENTS.md 7.1。
//
// 与「手写 import 清单」的差异（DECISIONS.md D005）：
//   旧写法 `import './board.test.js'` 在文件尚不存在时会直接抛 ERR_MODULE_NOT_FOUND，
//   使 Step 0 的验收项「node tests/run-all.js 可执行」无法通过。
//   本实现改为扫描 tests/*.test.js 动态导入：
//     - 没有测试文件也能正常退出（退出码 0，Step 0 合法状态）；
//     - 新增测试文件不需要改本文件；
//     - 某个测试文件语法错误只记为「加载失败」，不会拖垮整轮。
globalThis.__XXL_TEST_BUNDLE__ = true;

import { readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { setFile, recordLoadError, summarize } from './assert.js';

const HERE = dirname(fileURLToPath(import.meta.url));

async function main() {
  const files = readdirSync(HERE)
    .filter((f) => f.endsWith('.test.js'))
    .sort();

  console.log(`[run-all] 发现测试文件 ${files.length} 个：${files.join(', ') || '（无）'}`);

  for (const file of files) {
    setFile(file);
    try {
      await import(pathToFileURL(join(HERE, file)).href);
    } catch (err) {
      recordLoadError(file, err);
    }
  }

  summarize();
}

await main();
