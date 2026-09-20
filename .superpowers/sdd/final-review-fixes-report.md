# Final whole-branch review fixes

## 结果

已完成 12 项审查修复，未引入数据库事务。共享仓储修改已通过同步脚本重新生成到两个云函数目录。

## 逐项说明

1. `initialLastDoneKey`
   - 创建和批量创建时把归一化后的 `initialLastDoneKey`（含 `null`）持久化到 chore。
   - 完成记录回推、撤销和周期编辑均从 chore 读取该字段，恢复
     `lastDoneAt → initialLastDoneKey → createdAt` 的既定优先级。
   - 在设计文档的 `chores` 数据模型中补充该字段。
   - 增加“完成后撤销仍保留回填基准”和“改周期仍按回填基准重算”的回归测试。
   - 决策：**支持在 `chore.update` 编辑 `initialLastDoneKey`**。输入校验本来已经覆盖该字段，
     且它直接决定无完成流水时的排期基准；因此字段变化被视为排期配置变化并触发重算，
     普通名称/备注编辑仍不会重算。

2. `subscribeQuota` 原子增减
   - 在真实仓储和 fake repo 同时增加
     `incrementSubscribeQuota(memberId, delta): Promise<number>`。
   - 真实仓储使用 `db.command.inc(delta)` 单文档原子增量，提醒成功后用 `-1` 扣减；
     fake repo 用当前存储值做相对调整，保持行为契约一致。
   - `member.addSubscribeQuota` 先原子增加；若结果超过 200，再以负的相对增量纠正超额，
     避免用绝对值写回覆盖并发扣减。`195 + 20` 仍返回并保存 `200`。
   - 发送失败时把额度绝对校正为 0 的逻辑保持不变。
   - 新测试在 sender 往返期间通过真实 `member.addSubscribeQuota` action 增加额度，
     验证提醒扣减不会覆盖该额度。

3. 部署记录
   - 新建 `docs/setup-notes.md`，列出待填写 AppID、云环境 ID、订阅模板 ID和字段表。
   - 记录 `REMINDER_TEMPLATE_ID` 应配置在 `reminder` 云函数，以及
     `message.js` 占位字段必须和真实模板核对。
   - 记录 `buildSummary.headline` 当前未接入模板，落地真实模板时必须接线。

4. Jest 时区
   - 新增 `jest.setup.js` 并通过 Jest `setupFiles` 设置 `process.env.TZ = 'UTC'`。

5. 未使用 import
   - 删除 `actions/log.js` 中未使用的 `toLocalDateKey`。

6. `avatarUrl: null`
   - 改为 `String(payload.avatarUrl || '')`，显式 `null` 保存为空字符串，并增加测试。

7. 枕套模板
   - `bed-pillow` 从 30 天改为 7 天；说明区分每周换洗枕套和按洗标清洗枕芯。
   - 未改动换季衣物条目。

8. fake repo 归档过滤
   - `listChores` 和 `listDueChores` 都改为 `archived` 精确匹配，缺字段文档不再被误收录。

9. 重复键识别器
   - API 和 reminder 两处均增加交叉引用，说明错误形态来自外部 CloudBase SDK，
     变更时必须同步两处。

10. 日志稳定排序
    - 真实仓储 `listLogs` 增加 `_id desc` 次级排序；fake repo 同步相同语义并测试分页。

11. reminder 入口错误处理
    - `main` 用 `try/catch` 包裹扫描，顶层失败记录 `[reminder] scan failed` 并返回失败结果。
    - 增加入口测试，覆盖 `listFamiliesByReminderHour` 失败。

12. 路由集成测试
    - 使用真实 `actions` 注册表、真实 router 和 fake repo，端到端执行
      `member.me` 与 `chore.list`，不导入依赖 `wx-server-sdk` 的 API 入口。

## 命令与结果

### 修改前基线

```text
npm test
Test Suites: 17 passed, 17 total
Tests:       285 passed, 285 total
Snapshots:   0 total
```

### 回归测试红灯

```text
npx jest cloudfunctions/api/test/chore.test.js cloudfunctions/api/test/log.test.js cloudfunctions/api/test/member.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/router.test.js cloudfunctions/reminder/test/scan.test.js miniprogram/data/chore-templates.test.js --runInBand
Test Suites: 6 failed, 1 passed, 7 total
Tests:       10 failed, 136 passed, 146 total
```

失败均对应待修行为：回填基准未持久化/重用、额度增量方法缺失、头像 null、
归档精确匹配、稳定排序及枕套周期。

### 核心修复绿灯

```text
npx jest cloudfunctions/api/test/chore.test.js cloudfunctions/api/test/log.test.js cloudfunctions/api/test/member.test.js cloudfunctions/api/test/fake-repo.test.js cloudfunctions/api/test/router.test.js cloudfunctions/reminder/test/scan.test.js miniprogram/data/chore-templates.test.js --runInBand
Test Suites: 7 passed, 7 total
Tests:       146 passed, 146 total
```

```text
npx jest cloudfunctions/reminder/test/index.test.js --runInBand
Test Suites: 1 passed, 1 total
Tests:       1 passed, 1 total
```

### 共享代码同步

```text
npm run sync:shared
synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared
```

### 修改后全量验证

```text
npm test
Test Suites: 18 passed, 18 total
Tests:       295 passed, 295 total
Snapshots:   0 total
```

补充检查：

```text
git diff --check
# 无输出，退出码 0
```

IDE 诊断：本次修改文件无 linter errors。
