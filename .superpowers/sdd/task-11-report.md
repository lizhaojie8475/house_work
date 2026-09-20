# Task 11 实施报告

## 实现内容

- 新增 `shared/repo.js`，实现与 `createFakeRepo` 完全一致的 23 个 repository 方法，并固定使用 `families`、`members`、`chores`、`chore_logs`、`reminder_sends` 五个集合名。
- `claimInactiveMember(memberId, patch)` 使用 `where({ _id: memberId, active: false }).update(...)` 做条件更新，并依据 `stats.updated` 返回成员或 `null`。
- `deleteFamily(familyId)` 依据 CloudBase 删除结果的 `stats.removed` 返回真实布尔值。
- 将 `repo.js` 加入共享文件同步清单，并生成 `cloudfunctions/api/lib/repo.js` 与 `cloudfunctions/reminder/lib/repo.js`。
- 新增 API 云函数入口，通过 `wx-server-sdk` 初始化 CloudBase、构造真实 repo 并装配现有 router；调用者身份只取自 `cloud.getWXContext().OPENID`。
- 新增真实 repo 与 fake repo 的方法集合契约测试，以及固定集合名和 `_state` 暴露边界测试。

## 测试结果

- 开工基线：
  - `npx jest cloudfunctions/api`：9 个测试套件、153 个测试全部通过。
  - `npm test`：13 个测试套件、242 个测试全部通过。
- 完成后聚焦测试：
  - `npx jest cloudfunctions/api`：10 个测试套件、156 个测试全部通过。
- 完成后全量回归：
  - `npm test`：14 个测试套件、245 个测试全部通过。
- IDE lint：本任务涉及文件无 lint 错误。
- `git diff --check`：通过。

## TDD Evidence

### RED

命令：

```text
npx jest cloudfunctions/api/test/repo-contract.test.js
```

预期失败输出：

```text
FAIL cloudfunctions/api/test/repo-contract.test.js
  ● Test suite failed to run

    Cannot find module '../../../shared/repo' from 'cloudfunctions/api/test/repo-contract.test.js'

Test Suites: 1 failed, 1 total
Tests:       0 total
```

失败原因符合预期：契约测试先于 `shared/repo.js` 创建，因此模块尚不存在。

### GREEN

命令：

```text
npx jest cloudfunctions/api
```

通过输出：

```text
Test Suites: 10 passed, 10 total
Tests:       156 passed, 156 total
Snapshots:   0 total
```

其中 `cloudfunctions/api/test/repo-contract.test.js` 通过，确认真实实现与 fake 实现公开的方法集合一致。

## `npm run sync:shared` 精确输出

```text

> house-work@1.0.0 sync:shared
> node scripts/sync-shared.js

synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared

```

## 变更文件

手写文件：

- `shared/repo.js`
- `cloudfunctions/api/index.js`
- `cloudfunctions/api/test/repo-contract.test.js`
- `scripts/sync-shared.js`
- `scripts/sync-shared.test.js`
- `.superpowers/sdd/task-11-report.md`

同步脚本生成文件：

- `cloudfunctions/api/lib/repo.js`
- `cloudfunctions/reminder/lib/repo.js`

## 自审结论

- 契约测试确认真实 repo 与 fake repo 的 23 个公开方法完全一致。
- `shared/repo.js` 未引入 `wx-server-sdk`，也未直接调用微信 API。
- `claimInactiveMember` 保留 `_id + active: false` 条件并检查实际更新数，没有退化为无条件 `doc(id).update()`。
- `deleteFamily` 检查 `stats.removed`，可如实报告是否删除。
- API 入口仅从 `cloud.getWXContext().OPENID` 获取身份，没有信任 event 中的 openid。
- 两份生成的 `repo.js` 内容一致，并与共享源文件（除生成头注释外）一致。
- 未修改 router、errors、auth、actions、fake repo 或 package.json。

## 关注事项

当前环境无法连接真实 CloudBase，因此无法自动验证实际查询行为、索引配置及 CloudBase SDK 返回结构。查询字段名、排序、分页和限制值均逐字采用任务简报；仍需后续在微信云控制台进行人工联调，重点验证条件更新的 `stats.updated` 与删除的 `stats.removed` 返回结构。

---

## Review findings 修复报告（2026-09-20）

### Finding 1：四个列表方法静默截断

- 在 `shared/repo.js` 内新增私有 `listAll` 分页助手，并用于 `listFamiliesByReminderHour`、`listMembers`、`listChores`、`listDueChores`；原有过滤条件及数组返回形态不变。
- 每页取 1000 条，这是 CloudBase 云函数单次 `get()` 的上限；取上限值可在不超过 SDK 限制的前提下减少数据库往返次数。
- 每页固定按唯一字段 `_id` 升序，再用 `skip(page * 1000)` 推进，避免无显式排序时分页顺序不稳定导致静态结果集跳过或重复。
- 最多读取 1000 页（最多返回 1,000,000 条）；若第 1000 页仍满页，则停止并通过 `console.error` 输出带 `[repo-pagination]` 标识、方法名、过滤条件、页大小和页上限的错误，不抛异常，以保留已读取结果。

### Finding 2：`deleteLog` 总是成功

- 改为接收 `remove()` 返回值，并与 `deleteFamily` 保持同一写法：仅当 `res.stats.removed > 0` 时返回 `true`，无匹配记录或缺少删除统计时返回 `false`。

### 验证记录

- 修改前 `npx jest cloudfunctions/api`：10 个测试套件、156 个测试通过。
- 修改前 `npm test`：14 个测试套件、245 个测试通过。
- 缺陷复现命令：`node <<'NODE' ... NODE`（内联 stub 构造 1001 条记录并模拟 `stats.removed: 0`）；修改前按预期失败：实际只返回 1000 条。
- 修复后同一内联命令：通过，输出 `pagination and deleteLog checks passed`。
- `npm run sync:shared` 精确输出：

```text
> house-work@1.0.0 sync:shared
> node scripts/sync-shared.js

synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared
```

- 修改后 `npx jest cloudfunctions/api`：10 个测试套件、156 个测试通过。
- 修改后 `npm test`：14 个测试套件、245 个测试通过。
- `git diff --check`：通过；IDE lint：`shared/repo.js` 及两份生成文件无错误。

### 必须在微信云控制台人工验证

1. 分别为四种过滤条件准备超过 1000 条匹配记录，确认跨页结果完整、无重复、无遗漏，且仍为普通数组。
2. 确认 `_id` 升序与各方法现有 `where` 条件的组合查询可执行；按控制台提示为 reminder hour、成员状态、家务归档/房间、到期时间查询补齐所需复合索引。
3. 用超过 1000 个同一提醒小时的家庭实际运行 reminder 云函数，确认第二页家庭收到提醒，并检查云函数时长、内存和数据库读取量。
4. 在 `chore_logs` 中分别删除存在和不存在的 `_id`，确认 CloudBase 服务端 SDK 的 `remove()` 返回 `stats.removed`，且 repository 分别返回 `true` / `false`。
5. 通过受控方式触发页上限，确认云函数日志中出现 `[repo-pagination]`、方法名、过滤条件、`pageSize` 和 `maxPages`，同时任务继续处理已读取记录。

### 关注事项

- 现有自动化测试不执行真实 CloudBase 查询；上述排序、索引、跨页行为及删除统计结构只能在云控制台联调确认。
- 基于 `skip` 的稳定排序分页可保证静态数据集顺序确定，但扫描期间若匹配集发生插入或删除，偏移量分页仍可能重复或遗漏；当前实现遵循本次 review 指定的 `skip` 推进方案。
