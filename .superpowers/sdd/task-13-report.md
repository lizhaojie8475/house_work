# Task 13 报告：提醒云函数

## 实现内容

- 新增每小时整点运行的提醒云函数入口与七段式定时触发器配置。
- 使用 `lib/date.js` 计算 Asia/Shanghai 当前日与小时，不依赖运行环境本地时区。
- 按当前提醒小时扫描家庭，先用 30 天窗口查询候选家务，再按每件家务自己的 `reminderLeadDays` 精筛。
- 将同一家庭的全部待提醒家务聚合为一份摘要；每个符合条件且有订阅额度的家庭成员只收到一条消息。
- 使用 `sortChores`、`classify`、`formatDueText` 选择最紧急家务并生成摘要。
- 模板 ID 从 `REMINDER_TEMPLATE_ID` 读取；模板字段集中封装在 `lib/message.js`，`thing` 字段限制为 20 字符，`phrase` 字段限制为 5 字符。
- 发送成功后才扣减额度并写入按成员、日期去重的发送记录。
- 发送失败时不扣减原额度、不写去重记录，将本地额度校正为 0，并继续处理其他成员与家庭。

## 测试与结果

- 开始前基线：`npm test`，15 个测试套件、257 个测试全部通过。
- 聚焦测试：`npx jest cloudfunctions/reminder`，2 个测试套件、22 个测试全部通过。
- 全量回归：`npm test`，17 个测试套件、279 个测试全部通过。
- IDE 诊断：`cloudfunctions/reminder` 无 linter 错误。
- `git diff --check` 通过。

## TDD Evidence

### RED

命令：

```text
npx jest cloudfunctions/reminder
```

失败输出：

```text
FAIL cloudfunctions/reminder/test/message.test.js
  ● Test suite failed to run

    Cannot find module '../lib/message' from 'cloudfunctions/reminder/test/message.test.js'

FAIL cloudfunctions/reminder/test/scan.test.js
  ● Test suite failed to run

    Cannot find module '../lib/scan' from 'cloudfunctions/reminder/test/scan.test.js'

Test Suites: 2 failed, 2 total
Tests:       0 total
Snapshots:   0 total
Time:        0.351 s
Ran all test suites matching /cloudfunctions\/reminder/i.
```

这是预期失败：两个测试文件已按 brief 原样创建，而生产模块 `lib/message.js` 与 `lib/scan.js` 尚未实现。

### GREEN

命令：

```text
npx jest cloudfunctions/reminder
```

通过输出：

```text
PASS cloudfunctions/reminder/test/scan.test.js
PASS cloudfunctions/reminder/test/message.test.js

Test Suites: 2 passed, 2 total
Tests:       22 passed, 22 total
Snapshots:   0 total
Time:        0.353 s
Ran all test suites matching /cloudfunctions\/reminder/i.
```

## `npm run sync:shared` 精确输出

```text

> house-work@1.0.0 sync:shared
> node scripts/sync-shared.js

synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared

```

## 文件变更

手写文件：

- `cloudfunctions/reminder/package.json`
- `cloudfunctions/reminder/config.json`
- `cloudfunctions/reminder/index.js`
- `cloudfunctions/reminder/lib/message.js`
- `cloudfunctions/reminder/lib/scan.js`
- `cloudfunctions/reminder/test/message.test.js`
- `cloudfunctions/reminder/test/scan.test.js`
- `.superpowers/sdd/task-13-report.md`

生成文件：

- 运行同步脚本刷新了 `cloudfunctions/reminder/lib/date.js`、`repo.js`、`schedule.js`、`urgency.js`，其内容与仓库已有版本一致，因此没有产生 Git 内容变更。
- 同步脚本同时刷新了 API 与小程序共享代码副本，内容均未变化。

## 自检结论

- 家庭内多件家务聚合为一条家庭摘要，不会按家务逐条发送；每个符合条件的成员各收到一条该摘要。
- 发送失败路径不会执行额度递减，也不会写入去重记录；本地额度校正为 0。
- 单个成员发送失败由成员级 `try/catch` 隔离，不影响其他成员或后续家庭。
- 日期与当前小时均通过同步的日期库及其 `TZ_OFFSET_MS` 处理，没有使用本地时区 Date API 推导北京日历日。
- `thing` 20 字符与 `phrase` 5 字符限制已落实。
- 聚焦与全量测试输出干净，没有测试期间的 `console.error` 噪声。

## Concerns / 云部署核验项

- Task 0 尚未完成。部署前必须在微信后台申请真实的一次性订阅消息模板，并设置云函数环境变量 `REMINDER_TEMPLATE_ID`。
- 必须将真实模板字段名、字段类型和编号与 `lib/message.js` 当前的 `thing1`、`phrase2`、`date3` 对齐；如不一致，只修改该文件并重新测试。
- 必须确认真实模板允许当前三项语义：家务名称、待完成数量、提醒日期，并实机验证各字段字符限制及中文内容。
- 必须确认订阅消息跳转页 `pages/todo/todo` 在部署版本中存在且可访问。
- 必须在云开发环境确认七段式触发器 `0 0 * * * * *` 被平台正确创建，并核验 7、8、20 点 Asia/Shanghai 三个时段。
- 必须使用真实授权用户验证成功发送、拒收/额度耗尽错误码、额度校正及次日去重行为。

## 2026-09-20 Review 修复追加报告

### Findings 修复

1. 扫描隔离：分别捕获 `listDueChores`、`listMembers` 和成员级认领、发送、额度写入异常；日志包含 operation、`familyId` 和适用时的 `openid`。家庭失败继续下一家庭，成员失败继续同家庭下一成员，每个被隔离的故障都会增加 `failed`。
2. 发送与持久化分离：只有 `sender` 本身失败才将额度校正为 0；发送成功后立即计入 `sent`，后续额度递减失败只高优日志并计入 `failed`，保留原额度，避免把数据库故障误判为授权耗尽。
3. 原子去重：发送前先用 `recordReminderSent` 抢占 `(openid, dateKey)`；唯一键冲突计为 `skipped` 且不发送。发送失败时调用新增的 `deleteReminderSend` 释放认领，再单独校正额度；释放或校正失败只记录日志，不覆盖原始发送失败。真实仓储和 fake 同时新增删除方法，fake 也模拟 CloudBase `-502001 / duplicate key error`。

重复键识别放在 `cloudfunctions/reminder/lib/scan.js` 本地，判断条件与 API 的 `db-conflict.js` 保持一致。原因是 reminder 云函数独立上传，不能依赖 API bundle；本次只需一个调用点，未增加同步清单和新的共享生成文件。两处副本是有意的 bundle 边界复制，后续修改 CloudBase 错误形态时必须同步更新。

### 测试与同步

- 修复前基线：任务上下文记录 `npm test` 为 17 suites / 279 tests；本次开始时运行 `npx jest cloudfunctions/reminder`，2 suites / 22 tests 通过。
- RED：新增测试后运行 `npx jest cloudfunctions/reminder`，2 个预期失败、25 个通过；运行 `npx jest cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/repo-contract.test.js`，1 个预期失败、8 个通过。
- `npm run sync:shared`：`synced 4 file(s) -> cloudfunctions/api/lib`、`synced 4 file(s) -> cloudfunctions/reminder/lib`、`synced 2 file(s) -> miniprogram/utils/shared`。
- 修复后：`npx jest cloudfunctions/reminder` 为 2 suites / 27 tests；`npx jest cloudfunctions/api` 为 10 suites / 157 tests；`npm test` 为 17 suites / 285 tests，均通过。
- 额外验证：`git diff --check` 通过；本次修改文件的 IDE lint 为 0 errors。

### 云部署仍需人工验证

- 确认生产 `reminder_sends` 已建立 `(openid, dateKey)` 唯一索引；并发启动两次同日扫描，必须只发送一次、只消耗一个订阅额度。
- 用真实授权账号验证成功发送、拒收/额度耗尽：失败后认领记录被删除、额度校正为 0，后续合法运行可重试。
- 在预发布环境注入发送成功后的数据库写失败，确认额度不会被清零、认领保留，并出现含 `familyId`、`openid`、operation 的告警日志。
- 确认部署包包含同步生成的两份 `lib/repo.js`，并复核真实模板字段、5 字 phrase 限制、跳转页和 Asia/Shanghai 00:00–08:00 日期键。
