# Task 7 实施报告：家庭相关 action

## 实现内容

- 新增邀请码工具：7 天有效期常量、排除易混淆字符的 6 位邀请码生成器、邀请码有效期判断。
- 新增并注册 5 个家庭 action：
  - `family.createOrGet`：幂等创建或返回现有家庭。
  - `family.join`：按不区分大小写的邀请码加入家庭，并支持恢复非活跃成员。
  - `family.refreshInviteCode`：仅 owner 可刷新邀请码。
  - `family.listMembers`：成员鉴权后列出在册成员。
  - `family.updateSettings`：所有在册成员均可更新合法的家庭提醒设置。
- 所有业务失败均通过 `appError` 返回中文可展示消息；需要访问既有家庭数据的 action 使用 `requireMember` 或 `requireOwner` 鉴权。
- 按任务 brief 原样加入 `invite.test.js` 和 `family.test.js` 中的全部测试用例。

## 测试及结果

- 聚焦测试：`npx jest cloudfunctions/api`
  - 5 个测试套件通过。
  - 52 个测试通过，0 个失败。
- 仓库完整测试：`npm test`
  - 9 个测试套件通过。
  - 141 个测试通过，0 个失败。
- 变更文件 IDE 诊断：无 linter 错误。
- `git diff --check`：通过，无空白错误。

## TDD Evidence

### RED

命令：

```bash
npx jest cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js
```

结果：退出码 1；2 个测试套件失败，20 个已执行测试失败。`invite.test.js` 报错 `Cannot find module '../lib/invite'`，`family.test.js` 报错 `TypeError: actions[name] is not a function`。

这是预期失败：邀请码模块、家庭 action 及 action 注册尚未实现，证明新增测试会捕获缺失功能。

### GREEN

命令：

```bash
npx jest cloudfunctions/api
```

结果：退出码 0；5 个测试套件、52 个测试全部通过。

随后运行：

```bash
npm test
```

结果：退出码 0；9 个测试套件、141 个测试全部通过。

## 文件变更

- 新增 `cloudfunctions/api/lib/invite.js`
- 新增 `cloudfunctions/api/actions/family.js`
- 修改 `cloudfunctions/api/actions/index.js`
- 新增 `cloudfunctions/api/test/invite.test.js`
- 新增 `cloudfunctions/api/test/family.test.js`
- 新增 `.superpowers/sdd/task-7-report.md`

## 自查结论

- 已按 brief 的 6 个步骤顺序执行，并保留要求的导出结构和精确常量。
- brief 中的全部测试用例均已原样加入，测试断言真实 action 和 repository 行为。
- 所有用户可见失败均由 `appError` 构造，消息为中文。
- `refreshInviteCode` 使用 `requireOwner`；`listMembers` 和 `updateSettings` 使用 `requireMember`；`createOrGet` 与 `join` 按其建家/入家语义查询调用者身份。
- 仅实现要求的 5 个 action，未增加依赖，未修改禁止变更的文件，也未创建云函数入口。

## Concerns

无。

## 唯一索引冲突兜底修复（2026-09-17）

### 变更与原因

- `test/fake-repo.js` 的 `createMember` 和 `createFamily` 现在分别模拟 `members.openid`、`families.inviteCode` 唯一索引；重复插入抛出同时带有 `errCode: -502001` 和 `duplicate key error` 消息的数据库错误。seed 数据保持原样装载，不执行约束检查。
- 新增 `lib/db-conflict.js`，通过错误码或错误消息识别 CloudBase 重复键错误。
- `family.createOrGet` 的家庭、成员插入以及 `family.join` 的成员插入会把重复键错误映射为 `appError(CODES.CONFLICT, '操作太快了，请重新进入小程序重试')`；其他错误原样抛出。
- 新增辅助函数识别测试、fake repo 唯一约束测试，以及 `createOrGet`、`join` 在“查询未命中但插入冲突”并发竞态下的中文冲突错误测试。

### 测试命令与完整结果

修改前基线：

```text
$ npx jest cloudfunctions/api
Test Suites: 5 passed, 5 total
Tests:       57 passed, 57 total

$ npm test
Test Suites: 9 passed, 9 total
Tests:       146 passed, 146 total
```

新增测试后的 RED：

```text
$ npx jest cloudfunctions/api/test/db-conflict.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/family.test.js
Test Suites: 3 failed, 3 total
Tests:       4 failed, 25 passed, 29 total
```

实现后的聚焦 GREEN：

```text
$ npx jest cloudfunctions/api/test/db-conflict.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/family.test.js
Test Suites: 3 passed, 3 total
Tests:       32 passed, 32 total
```

最终要求的完整验证：

```text
$ npx jest cloudfunctions/api
Test Suites: 6 passed, 6 total
Tests:       64 passed, 64 total

$ npm test
Test Suites: 10 passed, 10 total
Tests:       153 passed, 153 total

$ git diff --check
（无输出，退出码 0）
```

IDE 诊断：本次修改的 6 个 JavaScript 文件均无 linter 错误。

### 既有测试影响

无。57 个既有 `cloudfunctions/api` 测试未作期望调整，且全部通过；没有既有 seed 数据或调用序列依赖违反唯一索引的不可实现状态。

### Concerns

无。

## Review Findings 修复报告（2026-09-17）

### 逐项修复

1. `createOrGet` 现在会通过 `updateMember` 复用并重新激活已有的非活跃成员记录，同时更新 `familyId`、`role: owner`、`active: true` 和 `joinedAt`，避免违反 `members.openid` 唯一约束；回归测试同时验证成员记录仍只有一条，且随后可调用 `family.listMembers`。
2. `generateInviteCode` 的默认随机源改为 Node 内置 `crypto.randomInt`；显式注入的 `() => [0, 1)` 浮点随机源契约保持不变，因此确定性测试及现有调用兼容。
3. `createOrGet` 和 `refreshInviteCode` 在写入前都会查询邀请码碰撞，最多尝试 5 次；刷新时还会排除当前邀请码，耗尽后通过 `appError(CODES.INTERNAL, '邀请码生成失败，请稍后重试')` 返回中文业务错误。
4. “多次生成不应总是相同”测试改用注入序列，不再依赖真实随机结果。

### 测试命令与输出

修改前基线：

```text
$ npx jest cloudfunctions/api
Test Suites: 5 passed, 5 total
Tests:       52 passed, 52 total

$ npm test
Test Suites: 9 passed, 9 total
Tests:       141 passed, 141 total
```

新增回归测试后的 RED：

```text
$ npx jest cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js
Test Suites: 2 failed, 2 total
Tests:       5 failed, 28 passed, 33 total
```

实现修复后的聚焦 GREEN：

```text
$ npx jest cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js
Test Suites: 2 passed, 2 total
Tests:       33 passed, 33 total
```

最终要求的完整验证：

```text
$ npx jest cloudfunctions/api
Test Suites: 5 passed, 5 total
Tests:       57 passed, 57 total

$ npm test
Test Suites: 9 passed, 9 total
Tests:       146 passed, 146 total

$ git diff --check
（无输出，退出码 0）
```

IDE 诊断：4 个变更的 JavaScript 文件均无 linter 错误。

## 非活跃成员并发认领修复（2026-09-17）

### 变更与原因

- 在 fake repository 中新增原子条件认领语义：只有成员仍为 `active: false` 时才应用 patch 并返回深拷贝，否则返回 `null`；该行为对应后续真实 CloudBase repository 必须实现的 `where({ _id, active: false }).update()`。
- `family.join` 和 `family.createOrGet` 的非活跃成员复用分支改为条件认领；认领失败统一通过 `appError(CODES.CONFLICT, '操作太快了，请重新进入小程序重试')` 返回中文冲突。
- `family.createOrGet` 认领失败时补偿删除刚创建的家庭；删除异常只写日志，不覆盖原始 `CONFLICT`，避免留下孤儿家庭或向用户暴露非业务错误。
- 新增 fake repository、两条 action 竞态和邀请码易混淆字符排除测试。竞态测试通过在查询与 claim 之间用 repository 的真实更新行为抢先激活成员来复现，没有直接 stub `claimInactiveMember`。

### 新增 repository 方法契约

- `claimInactiveMember(memberId, patch): Promise<member | null>`
- `deleteFamily(familyId): Promise<boolean>`

### 测试命令与输出

修改前基线：

```text
$ npx jest cloudfunctions/api
Test Suites: 6 passed, 6 total
Tests:       64 passed, 64 total

$ npm test
Test Suites: 10 passed, 10 total
Tests:       153 passed, 153 total
```

新增测试后的 RED：

```text
$ npx jest cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js
Test Suites: 2 failed, 1 passed, 3 total
Tests:       4 failed, 39 passed, 43 total
```

实现后的聚焦 GREEN：

```text
$ npx jest cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js
Test Suites: 3 passed, 3 total
Tests:       43 passed, 43 total
```

最终完整验证：

```text
$ npx jest cloudfunctions/api
Test Suites: 6 passed, 6 total
Tests:       69 passed, 69 total

$ npm test
Test Suites: 10 passed, 10 total
Tests:       158 passed, 158 total

$ git diff --check
（无输出，退出码 0）
```

IDE 诊断：本次修改的 5 个 JavaScript 文件均无 linter 错误。

### Concerns

无。
