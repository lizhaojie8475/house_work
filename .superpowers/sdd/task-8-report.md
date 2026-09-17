# Task 8 实施报告

## 实现内容

- 新增家务输入归一化与校验，覆盖名称、周期类型、周期配置、日期、提醒天数、耗时等字段。
- 新增 `chore.create`、`chore.batchCreate`、`chore.list`、`chore.get`、`chore.update`、`chore.setArchived` 六个 action。
- 所有 handler 均先校验成员身份，并从成员记录派生 `familyId`。
- 所有按家务 ID 操作均通过 `loadOwnChore`，区分不存在的 `NOT_FOUND` 与跨家庭的 `FORBIDDEN`。
- 更新家务时仅在周期配置变化后重算到期日；批量创建在写入前完成全部校验。
- 在 action 注册表中显式注册六个家务 action，并保留 `loadOwnChore` 导出供 Task 9 复用。

## 测试与结果

- 基线 focused：`npx jest cloudfunctions/api`，新增家务测试前为 6 suites、69 tests 全部通过。
- 基线 repo-wide：`npm test`，10 suites、158 tests 全部通过。
- GREEN focused：`npx jest cloudfunctions/api`，7 suites、98 tests 全部通过。
- GREEN repo-wide：`npm test`，11 suites、187 tests 全部通过。
- IDE lint：四个变更文件均无诊断错误。
- `git diff --check`：通过。

## TDD Evidence

### RED

- 命令：`npx jest cloudfunctions/api/test/chore.test.js`
- 结果：1 suite failed，29 tests failed。
- 关键输出：`TypeError: actions[name] is not a function`。
- 符合预期：测试先于实现创建，失败原因是家务 action 尚未注册和实现。

### GREEN

- 命令：`npx jest cloudfunctions/api`
- 结果：7 suites passed，98 tests passed。
- 全量命令：`npm test`
- 结果：11 suites passed，187 tests passed。

## 变更文件

- `cloudfunctions/api/lib/chore-input.js`
- `cloudfunctions/api/actions/chore.js`
- `cloudfunctions/api/actions/index.js`
- `cloudfunctions/api/test/chore.test.js`
- `.superpowers/sdd/task-8-report.md`

## 自审结论

- 已逐项实现 brief 的六个步骤与 29 个测试用例。
- 所有可预期、面向用户的校验和鉴权失败均通过 `appError` 返回中文消息。
- 所有 handler 均调用 `requireMember`，未信任 payload 中的 `familyId`。
- 所有按 ID 的家务操作均调用 `loadOwnChore`。
- 仅实现 brief 指定的六个 action；未修改同步生成模块、受保护文件或依赖配置。
- 测试输出无 warning/error，lint 与差异格式检查通过。

## Concerns

无。

## Review Findings 修复报告（2026-09-17）

### 逐项修复

1. `initialLastDoneKey`：在格式校验后用 `parseDateKey` 与 `daysInMonth` 校验真实日历日期，拒绝非法月份、非法月内日期和非闰年 2 月 29 日；保留有效闰日。
2. 周期错误消息：继续用一次真实 `computeNextDueAt` 统一校验规则；底层异常通过 `console.error` 记录，用户只收到可直接展示的中文提示，不再泄漏英文诊断。
3. 列表筛选类型：`archived` 仅接受 `undefined` 或布尔值，默认 `false`；`room` 仅接受 `undefined` 或字符串，其他类型均通过 `appError` 返回中文参数错误。
4. 固定规则规范化：按 weekly、monthly、yearly 的稳定字段顺序重建 `fixedRule`，并将 `weekdays` 升序排列，使等价规则的序列化结果一致，避免无意义重算到期日。
5. 错误消息测试：为非法日期、非法周期和非法归档状态断言具体中文消息，并覆盖周期底层错误已写入服务端日志。

### 未来日期决策

未拒绝未来的 `initialLastDoneKey`。需求同时明确要求当前日期之后的 `2028-02-29` 必须被接受，因此本次只校验它是否为真实日历日期，不增加未来日期限制。

### 测试与输出

- 修改前：`npx jest cloudfunctions/api` → 7 suites passed，98 tests passed。
- 修改前：`npm test` → 11 suites passed，187 tests passed。
- RED：`npx jest cloudfunctions/api/test/chore.test.js --runInBand` → 1 suite failed，10 tests failed、30 tests passed；失败点对应日期真实性、中文周期错误、筛选类型与规则规范化。
- 修改后：`npx jest cloudfunctions/api/test/chore.test.js --runInBand` → 1 suite passed，40 tests passed。
- 修改后：`npx jest cloudfunctions/api` → 7 suites passed，109 tests passed。
- 修改后：`npm test` → 11 suites passed，198 tests passed。
- IDE lint：三个变更代码文件均无诊断错误。
- `git diff --check`：通过，无输出。
