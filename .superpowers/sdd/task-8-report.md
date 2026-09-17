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

## initialLastDoneKey 未来日期修正（2026-09-17）

### 变更

- `chore-input.js`：在真实日历日校验通过后，用 `YYYY-MM-DD` 字符串与 `todayKey()` 比较，拒绝严格晚于今天的 `initialLastDoneKey`（今天仍接受）；错误为 `INVALID_ARGUMENT`，文案「上次完成日不能晚于今天」。
- `chore.test.js`：闰日有效用例改为过去日期 `2024-02-29`；新增「明天」拒绝（`addDays(todayKey(), 1)`）与「今天」接受用例。

### 测试

- 修改前：`npx jest cloudfunctions/api` → 109 passed；`npm test` → 198 passed。
- 修改后：`npx jest cloudfunctions/api` → 111 passed；`npm test` → 200 passed。

## loadOwnChore 防 id 探测（2026-09-17）

### 变更

- `loadOwnChore`：跨家庭访问与「不存在」均返回 `NOT_FOUND` 及同一中文文案（共享常量 `CHORE_NOT_FOUND_MESSAGE`）；跨家庭时 `console.error` 记录 choreId、ownerFamilyId、callerFamilyId；注释说明故意不区分两分支。`requireMember` / `requireOwner` 的 `FORBIDDEN` 未改动。
- `chore.test.js`：两处跨家庭用例改为断言 `NOT_FOUND` 并重命名；新增「不存在与跨家庭拒绝的 code 与 message 完全一致」用例。

### 测试

- 修改前：`npx jest cloudfunctions/api` → 111 passed；`npm test` → 200 passed。
- 修改后：`npx jest cloudfunctions/api` → 112 passed；`npm test` → 201 passed。

## 输入边界与测试噪声修复（2026-09-17）

### 逐项修复

1. 路由 payload：在单入口将 `null`、字符串、数字、布尔值等非对象 payload 统一归一化为 `{}`，再传给 handler；保留 action 自有属性检查、业务错误标记识别、错误码自有属性检查及依赖调用位置。
2. 批量项：在 `normalizeChoreInput` 顶部拒绝 `null`、非对象和数组，通过 `appError(INVALID_ARGUMENT, '每件家务都需要填写完整信息')` 返回可展示中文消息。守卫放在公共 normaliser，可同时保护 create、update、batchCreate；batchCreate 仍先完成全部 `map` 校验再统一写入，因此合法项后出现 `null` 也不会留下部分数据。
3. 控制台噪声：三个跨家庭测试均临时 stub `console.error`、断言审计日志确实写入，并在 `finally` 恢复；固定周期错误测试也改用 `try/finally`，避免断言中途失败后泄漏 stub。
4. 消息断言：缺少名称、非法 `scheduleType` 和批量项非法测试均断言具体、可直接展示且不含 ASCII 字母的中文消息。

### 测试与输出

- 修改前：`npx jest cloudfunctions/api` → 7 suites passed，112 tests passed；输出包含 3 段预期的跨家庭 `console.error` 噪声。
- 修改前仓库基线（任务提供）：`npm test` → 11 suites passed，201 tests passed。
- RED：`npx jest cloudfunctions/api/test/router.test.js cloudfunctions/api/test/chore.test.js` → 2 suites failed，6 tests failed、61 tests passed；失败均对应 payload 未归一化和嵌套项未走业务错误通道。
- GREEN：`npx jest cloudfunctions/api/test/router.test.js cloudfunctions/api/test/chore.test.js` → 2 suites passed，67 tests passed。
- 修改后：`npx jest cloudfunctions/api` → 7 suites passed，118 tests passed。
- 修改后：`npm test` → 11 suites passed，207 tests passed。
- 两次修改后完整 Jest 输出均无 stray `console.error`、warning 或 error 噪声。
- IDE lint：四个变更代码文件均无诊断错误；`git diff --check` 通过。
