# 家务管家小程序 · 计划一：算法内核与云函数后端

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建家务管家小程序的算法内核与云函数后端，使家庭、家务、完成流水、周期计算与每日提醒推送全部可用并有单元测试覆盖。

**Architecture:** 日期换算、周期计算、紧急度分档写成不依赖微信 API 的纯函数放在 `shared/`，由同步脚本分发到各消费方。云函数 `api` 采用单入口 + action 路由，所有数据库访问收敛到一个 repository 层，使 action 层可以注入内存假实现做单元测试。云函数 `reminder` 由定时触发器驱动，按家庭聚合待办后发送一条订阅消息。

**Tech Stack:** Node.js 18、微信云开发（云数据库 + 云函数 + 定时触发器）、`wx-server-sdk`、Jest 29。

**上游设计文档：** `docs/superpowers/specs/2026-09-17-housework-miniprogram-design.md`

## Global Constraints

- 时区固定 `Asia/Shanghai`，偏移量恒为 UTC+8（中国无夏令时），常量写作 `TZ_OFFSET_MS = 8 * 60 * 60 * 1000`
- 本地日历日一律用 `YYYY-MM-DD` 字符串表示，变量与字段名统一用 `...Key` 或 `nextDueAt` 命名，比较和排序直接用字符串运算
- 「某个瞬间」语义的字段（`doneAt`、`createdAt`、`joinedAt`、`sentAt`、`inviteCodeExpireAt`）存毫秒时间戳（number）
- `shared/` 下的代码禁止 `require('wx-server-sdk')` 或直接调用任何微信 API，外部依赖一律通过参数注入
- `cloudfunctions/*/lib/` 与 `miniprogram/utils/shared/` 是同步脚本生成的目录，禁止手工编辑，但需提交到仓库
- 云函数 Node.js 运行时版本 18
- 紧急度四档取值固定为字符串 `'overdue'` / `'today'` / `'soon'` / `'normal'`
- 紧急度 `soon` 档阈值固定 3 天（`SOON_THRESHOLD_DAYS = 3`），与家务自身的 `reminderLeadDays` 是两个独立概念，不得混用
- 家庭提醒时段 `settings.reminderHour` 取值范围仅允许 `7`、`8`、`20`，默认 `8`
- `settings.defaultReminderLeadDays` 默认 `1`
- 邀请码为 6 位大写字母与数字，有效期 7 天
- 云函数返回结构统一为 `{ ok: true, data }` 或 `{ ok: false, code, message }`，`message` 用中文，可直接展示给用户
- 每个任务结束必须提交一次 git

---

### Task 0: 微信账号与云环境前置（人工操作）

这是唯一的非编码任务，需要项目所有者本人持身份证与银行卡操作。**可与 Task 1 至 Task 10 并行进行，但 Task 13 开工前必须完成。**

**产出物：** 记录在 `docs/setup-notes.md` 中的 AppID、云环境 ID、订阅消息模板 ID 与模板字段清单。

- [ ] **Step 1: 注册个人主体小程序账号**

访问 https://mp.weixin.qq.com/ ，选择「立即注册」→「小程序」。填写邮箱、设置密码，主体类型选「个人」，需身份证号与本人银行卡做身份验证，通常当天通过。

完成后在「开发管理」→「开发设置」中找到 **AppID**，记录下来。

- [ ] **Step 2: 填写服务类目**

在「设置」→「基本设置」→「服务类目」中添加类目。

选择 **「工具」→「效率」**。类目决定了后续能申请到哪些订阅消息模板，必须先完成这一步。

- [ ] **Step 3: 开通云开发环境**

在「开发」→「开发管理」→「云开发」中点击开通，选择免费的基础版套餐，创建环境。

在云开发控制台「设置」→「环境」中找到 **环境 ID**（形如 `housework-1a2b3c`），记录下来。

- [ ] **Step 4: 申请订阅消息模板**

在「功能」→「订阅消息」→「公共模板库」中搜索「事项提醒」或「待办」，选择一个包含「事项名称」与「提醒时间」类字段的模板并添加。

添加后在「我的模板」中查看，记录两项内容：
1. **模板 ID**（形如 `xxxxxxxxxxxxxxxxxxxxx`）
2. **字段名与类型清单**，例如 `thing1 事项名称`、`phrase2 状态`、`date3 时间`

字段编号由微信实际下发的模板决定，无法预先确定，Task 13 依赖这份清单。

- [ ] **Step 5: 记录并提交**

创建 `docs/setup-notes.md`：

```markdown
# 环境与账号信息

> 本文件不含密钥，仅记录公开标识符与模板结构，可提交到仓库。

## 小程序
- AppID: `填入实际值`
- 主体类型: 个人
- 服务类目: 工具 / 效率

## 云开发
- 环境 ID: `填入实际值`
- 套餐: 基础版（免费）

## 订阅消息模板
- 模板 ID: `填入实际值`
- 模板标题: `填入实际值`
- 字段清单:
  | 字段名 | 类型 | 含义 | 长度限制 |
  |---|---|---|---|
  | thing1 | thing | 事项名称 | 20 字符 |
  | phrase2 | phrase | 状态 | 5 个汉字 |
  | date3 | date | 时间 | 标准日期格式 |
```

把表格替换为后台显示的真实字段，长度限制以后台模板说明为准。

```bash
git add docs/setup-notes.md
git commit -m "docs: 记录小程序 AppID、云环境与订阅消息模板信息"
```

---

### Task 1: 仓库脚手架与日期工具

**Files:**
- Create: `package.json`
- Create: `.gitignore`
- Create: `shared/date.js`
- Test: `shared/date.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `shared/date.js` 导出
  - `TZ_OFFSET_MS: number`
  - `toLocalDateKey(timestamp: number): string` — 时间戳转本地日历日 `YYYY-MM-DD`
  - `todayKey(now?: number): string` — 默认取 `Date.now()`
  - `parseDateKey(key: string): { y: number, m: number, d: number }` — `m` 为 1–12
  - `makeDateKey(y: number, m: number, d: number): string`
  - `addDays(key: string, days: number): string`
  - `diffDays(fromKey: string, toKey: string): number` — 返回 `toKey - fromKey` 的天数，可为负
  - `weekdayOf(key: string): number` — 0 表示周日
  - `daysInMonth(y: number, m: number): number` — `m` 为 1–12

- [ ] **Step 1: 初始化 npm 工程**

创建 `package.json`：

```json
{
  "name": "house-work",
  "version": "1.0.0",
  "private": true,
  "description": "家务管家微信小程序",
  "scripts": {
    "test": "jest",
    "sync:shared": "node scripts/sync-shared.js"
  },
  "jest": {
    "testEnvironment": "node",
    "testPathIgnorePatterns": [
      "/node_modules/",
      "/cloudfunctions/.+/lib/",
      "/miniprogram/utils/shared/",
      "/miniprogram/miniprogram_npm/"
    ]
  },
  "devDependencies": {
    "jest": "^29.7.0"
  }
}
```

`testPathIgnorePatterns` 里的三条生成目录必须排除，否则同步脚本拷过去的副本会被 Jest 当成重复用例再跑一遍。

创建 `.gitignore`：

```
node_modules/
.DS_Store
*.log
```

- [ ] **Step 2: 安装依赖**

Run: `npm install`
Expected: 输出 `added N packages`，生成 `node_modules/` 与 `package-lock.json`

- [ ] **Step 3: 写失败的测试**

创建 `shared/date.test.js`：

```js
const {
  TZ_OFFSET_MS,
  toLocalDateKey,
  todayKey,
  parseDateKey,
  makeDateKey,
  addDays,
  diffDays,
  weekdayOf,
  daysInMonth,
} = require('./date');

describe('TZ_OFFSET_MS', () => {
  test('固定为 UTC+8', () => {
    expect(TZ_OFFSET_MS).toBe(8 * 60 * 60 * 1000);
  });
});

describe('toLocalDateKey', () => {
  test('北京时间 00:30 属于当天，不能算成前一天', () => {
    // UTC 2026-02-28 16:30 === 北京 2026-03-01 00:30
    const ts = Date.UTC(2026, 1, 28, 16, 30);
    expect(toLocalDateKey(ts)).toBe('2026-03-01');
  });

  test('北京时间 23:30 属于当天，不能算成后一天', () => {
    // UTC 2026-02-28 15:30 === 北京 2026-02-28 23:30
    const ts = Date.UTC(2026, 1, 28, 15, 30);
    expect(toLocalDateKey(ts)).toBe('2026-02-28');
  });

  test('北京时间正午', () => {
    const ts = Date.UTC(2026, 8, 17, 4, 0);
    expect(toLocalDateKey(ts)).toBe('2026-09-17');
  });
});

describe('todayKey', () => {
  test('接受注入的当前时间', () => {
    expect(todayKey(Date.UTC(2026, 0, 1, 16, 0))).toBe('2026-01-02');
  });

  test('不传参数时返回 10 位日期字符串', () => {
    expect(todayKey()).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });
});

describe('parseDateKey', () => {
  test('月份返回 1 到 12', () => {
    expect(parseDateKey('2026-09-17')).toEqual({ y: 2026, m: 9, d: 17 });
  });
});

describe('makeDateKey', () => {
  test('个位数月日补零', () => {
    expect(makeDateKey(2026, 1, 5)).toBe('2026-01-05');
  });
});

describe('addDays', () => {
  test('跨月', () => {
    expect(addDays('2026-01-31', 1)).toBe('2026-02-01');
  });

  test('跨年', () => {
    expect(addDays('2026-12-31', 1)).toBe('2027-01-01');
  });

  test('闰年 2 月', () => {
    expect(addDays('2028-02-28', 1)).toBe('2028-02-29');
  });

  test('非闰年 2 月', () => {
    expect(addDays('2026-02-28', 1)).toBe('2026-03-01');
  });

  test('负数天数往前推', () => {
    expect(addDays('2026-03-01', -1)).toBe('2026-02-28');
  });

  test('加 0 天返回原值', () => {
    expect(addDays('2026-09-17', 0)).toBe('2026-09-17');
  });
});

describe('diffDays', () => {
  test('未来日期返回正数', () => {
    expect(diffDays('2026-09-17', '2026-09-20')).toBe(3);
  });

  test('过去日期返回负数', () => {
    expect(diffDays('2026-09-17', '2026-09-15')).toBe(-2);
  });

  test('同一天返回 0', () => {
    expect(diffDays('2026-09-17', '2026-09-17')).toBe(0);
  });

  test('跨年计算', () => {
    expect(diffDays('2026-12-30', '2027-01-02')).toBe(3);
  });
});

describe('weekdayOf', () => {
  test('周日返回 0', () => {
    // 2026-09-20 是周日
    expect(weekdayOf('2026-09-20')).toBe(0);
  });

  test('周四返回 4', () => {
    // 2026-09-17 是周四
    expect(weekdayOf('2026-09-17')).toBe(4);
  });
});

describe('daysInMonth', () => {
  test('1 月 31 天', () => {
    expect(daysInMonth(2026, 1)).toBe(31);
  });

  test('非闰年 2 月 28 天', () => {
    expect(daysInMonth(2026, 2)).toBe(28);
  });

  test('闰年 2 月 29 天', () => {
    expect(daysInMonth(2028, 2)).toBe(29);
  });

  test('整百非闰年 2 月 28 天', () => {
    expect(daysInMonth(2100, 2)).toBe(28);
  });

  test('4 月 30 天', () => {
    expect(daysInMonth(2026, 4)).toBe(30);
  });
});
```

- [ ] **Step 4: 运行测试确认失败**

Run: `npx jest shared/date.test.js`
Expected: FAIL，报错 `Cannot find module './date'`

- [ ] **Step 5: 实现 date.js**

创建 `shared/date.js`：

```js
// 本地日历日工具。全部基于 UTC 构造 Date 做整日运算，结果与运行环境时区无关。
// 云函数运行环境是 UTC，若用本地时间 API 判断「今天」，
// 北京时间 00:00-08:00 会被算成前一天，导致提醒整体错一天。

const TZ_OFFSET_MS = 8 * 60 * 60 * 1000; // Asia/Shanghai，中国无夏令时

function toLocalDateKey(timestamp) {
  return new Date(timestamp + TZ_OFFSET_MS).toISOString().slice(0, 10);
}

function todayKey(now = Date.now()) {
  return toLocalDateKey(now);
}

function parseDateKey(key) {
  const [y, m, d] = key.split('-').map(Number);
  return { y, m, d };
}

function makeDateKey(y, m, d) {
  return `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

function keyToUtcMs(key) {
  const { y, m, d } = parseDateKey(key);
  return Date.UTC(y, m - 1, d);
}

function addDays(key, days) {
  return new Date(keyToUtcMs(key) + days * 86400000).toISOString().slice(0, 10);
}

function diffDays(fromKey, toKey) {
  return Math.round((keyToUtcMs(toKey) - keyToUtcMs(fromKey)) / 86400000);
}

function weekdayOf(key) {
  return new Date(keyToUtcMs(key)).getUTCDay();
}

function daysInMonth(y, m) {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

module.exports = {
  TZ_OFFSET_MS,
  toLocalDateKey,
  todayKey,
  parseDateKey,
  makeDateKey,
  addDays,
  diffDays,
  weekdayOf,
  daysInMonth,
};
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx jest shared/date.test.js`
Expected: PASS，`Tests: 25 passed`

- [ ] **Step 7: 提交**

```bash
git add package.json package-lock.json .gitignore shared/date.js shared/date.test.js
git commit -m "feat: 添加本地日历日工具与 Jest 工程脚手架"
```

---

### Task 2: 浮动周期计算与基准日期解析

**Files:**
- Create: `shared/schedule.js`
- Test: `shared/schedule.test.js`

**Interfaces:**
- Consumes: `shared/date.js` 的 `addDays`、`toLocalDateKey`
- Produces: `shared/schedule.js` 导出
  - `resolveBaseKey({ lastDoneAt, initialLastDoneKey, createdAt }): string` — 按 `lastDoneAt` → `initialLastDoneKey` → `createdAt` 的优先级返回基准日历日
  - `computeNextDueAt(chore: object, baseKey: string): string` — `chore` 需含 `scheduleType` 及对应参数
  - 本任务只实现 `scheduleType === 'floating'`，`'fixed'` 分支在 Task 3 补齐

- [ ] **Step 1: 写失败的测试**

创建 `shared/schedule.test.js`：

```js
const { resolveBaseKey, computeNextDueAt } = require('./schedule');

describe('resolveBaseKey', () => {
  test('优先取 lastDoneAt 对应的本地日历日', () => {
    const base = resolveBaseKey({
      lastDoneAt: Date.UTC(2026, 8, 16, 16, 30), // 北京 2026-09-17 00:30
      initialLastDoneKey: '2026-01-01',
      createdAt: Date.UTC(2026, 0, 1),
    });
    expect(base).toBe('2026-09-17');
  });

  test('没有 lastDoneAt 时取用户填写的上次完成日', () => {
    const base = resolveBaseKey({
      lastDoneAt: null,
      initialLastDoneKey: '2026-08-01',
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-08-01');
  });

  test('两者都没有时取创建当天', () => {
    const base = resolveBaseKey({
      lastDoneAt: null,
      initialLastDoneKey: null,
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-09-17');
  });

  test('lastDoneAt 为 0 视为没有完成过', () => {
    const base = resolveBaseKey({
      lastDoneAt: 0,
      initialLastDoneKey: '2026-08-01',
      createdAt: Date.UTC(2026, 8, 17, 4, 0),
    });
    expect(base).toBe('2026-08-01');
  });
});

describe('computeNextDueAt · 浮动周期', () => {
  test('基准日加上间隔天数', () => {
    const chore = { scheduleType: 'floating', intervalDays: 30 };
    expect(computeNextDueAt(chore, '2026-09-17')).toBe('2026-10-17');
  });

  test('晚做几天则整体顺延，不累积欠账', () => {
    const chore = { scheduleType: 'floating', intervalDays: 30 };
    // 原定 09-17 到期，实际 09-22 才做，下次是 10-22 而非 10-17
    expect(computeNextDueAt(chore, '2026-09-22')).toBe('2026-10-22');
  });

  test('间隔 1 天', () => {
    const chore = { scheduleType: 'floating', intervalDays: 1 };
    expect(computeNextDueAt(chore, '2026-12-31')).toBe('2027-01-01');
  });

  test('间隔跨越非闰年 2 月', () => {
    const chore = { scheduleType: 'floating', intervalDays: 7 };
    expect(computeNextDueAt(chore, '2026-02-25')).toBe('2026-03-04');
  });
});

describe('computeNextDueAt · 非法输入', () => {
  test('未知 scheduleType 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'weird' }, '2026-09-17')).toThrow(
      /unsupported scheduleType/
    );
  });

  test('浮动周期缺少 intervalDays 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'floating' }, '2026-09-17')).toThrow(
      /intervalDays/
    );
  });

  test('浮动周期 intervalDays 小于 1 抛错', () => {
    expect(() =>
      computeNextDueAt({ scheduleType: 'floating', intervalDays: 0 }, '2026-09-17')
    ).toThrow(/intervalDays/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest shared/schedule.test.js`
Expected: FAIL，报错 `Cannot find module './schedule'`

- [ ] **Step 3: 实现 schedule.js 的浮动周期分支**

创建 `shared/schedule.js`：

```js
// 下次到期日计算。输入输出均为本地日历日字符串 YYYY-MM-DD。
const { addDays, toLocalDateKey } = require('./date');

// 按优先级解析周期计算的基准日：
// 上次完成日 -> 新建时用户填写的「上次是什么时候做的」 -> 创建当天
function resolveBaseKey({ lastDoneAt, initialLastDoneKey, createdAt }) {
  if (lastDoneAt) return toLocalDateKey(lastDoneAt);
  if (initialLastDoneKey) return initialLastDoneKey;
  return toLocalDateKey(createdAt);
}

function nextFloating(baseKey, intervalDays) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error(`invalid intervalDays: ${intervalDays}`);
  }
  return addDays(baseKey, intervalDays);
}

function computeNextDueAt(chore, baseKey) {
  if (chore.scheduleType === 'floating') {
    return nextFloating(baseKey, chore.intervalDays);
  }
  throw new Error(`unsupported scheduleType: ${chore.scheduleType}`);
}

module.exports = { resolveBaseKey, computeNextDueAt };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest shared/schedule.test.js`
Expected: PASS，`Tests: 11 passed`

- [ ] **Step 5: 提交**

```bash
git add shared/schedule.js shared/schedule.test.js
git commit -m "feat: 实现浮动周期到期日计算与基准日期解析"
```

---

### Task 3: 固定日历周期计算

**Files:**
- Modify: `shared/schedule.js`
- Modify: `shared/schedule.test.js`

**Interfaces:**
- Consumes: `shared/date.js` 的 `weekdayOf`、`parseDateKey`、`makeDateKey`、`daysInMonth`、`addDays`
- Produces: `computeNextDueAt` 增加 `scheduleType === 'fixed'` 分支，读取 `chore.fixedRule`：
  - `{ type: 'weekly', weekdays: number[] }` — 0 表示周日，支持多选
  - `{ type: 'monthly', dayOfMonth: number }` — 1–31
  - `{ type: 'yearly', month: number, dayOfMonth: number }` — `month` 为 1–12
  - 语义：返回**严格晚于** `baseKey` 的最近一个符合规则的日期

- [ ] **Step 1: 追加失败的测试**

在 `shared/schedule.test.js` 末尾追加：

```js
describe('computeNextDueAt · 固定日历 weekly', () => {
  const weekly = (weekdays) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'weekly', weekdays },
  });

  test('每周日，基准是周四，返回本周日', () => {
    // 2026-09-17 是周四，2026-09-20 是周日
    expect(computeNextDueAt(weekly([0]), '2026-09-17')).toBe('2026-09-20');
  });

  test('基准正好是规则日时返回下一周，不返回当天', () => {
    // 2026-09-20 是周日
    expect(computeNextDueAt(weekly([0]), '2026-09-20')).toBe('2026-09-27');
  });

  test('跳过一次不累积：上次完成是上周日，今天周三，下次仍是本周日', () => {
    // 基准 2026-09-13（周日）-> 2026-09-20（周日）
    expect(computeNextDueAt(weekly([0]), '2026-09-13')).toBe('2026-09-20');
  });

  test('多选周二和周四，基准周四返回下周二', () => {
    // 2026-09-17 周四 -> 2026-09-22 周二
    expect(computeNextDueAt(weekly([2, 4]), '2026-09-17')).toBe('2026-09-22');
  });

  test('多选周二和周四，基准周一返回本周二', () => {
    // 2026-09-14 周一 -> 2026-09-15 周二
    expect(computeNextDueAt(weekly([2, 4]), '2026-09-14')).toBe('2026-09-15');
  });

  test('weekdays 顺序打乱不影响结果', () => {
    expect(computeNextDueAt(weekly([4, 2]), '2026-09-14')).toBe('2026-09-15');
  });

  test('weekdays 为空数组抛错', () => {
    expect(() => computeNextDueAt(weekly([]), '2026-09-17')).toThrow(/weekdays/);
  });

  test('weekdays 含越界值抛错', () => {
    expect(() => computeNextDueAt(weekly([7]), '2026-09-17')).toThrow(/weekdays/);
  });
});

describe('computeNextDueAt · 固定日历 monthly', () => {
  const monthly = (dayOfMonth) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'monthly', dayOfMonth },
  });

  test('每月 1 号，基准月中返回下月 1 号', () => {
    expect(computeNextDueAt(monthly(1), '2026-09-17')).toBe('2026-10-01');
  });

  test('每月 25 号，基准月初返回本月 25 号', () => {
    expect(computeNextDueAt(monthly(25), '2026-09-03')).toBe('2026-09-25');
  });

  test('基准正好是规则日时返回下个月', () => {
    expect(computeNextDueAt(monthly(25), '2026-09-25')).toBe('2026-10-25');
  });

  test('每月 31 号遇 2 月取该月最后一天', () => {
    expect(computeNextDueAt(monthly(31), '2026-01-31')).toBe('2026-02-28');
  });

  test('每月 31 号遇闰年 2 月取 29 号', () => {
    expect(computeNextDueAt(monthly(31), '2028-01-31')).toBe('2028-02-29');
  });

  test('每月 31 号遇 4 月取 30 号', () => {
    expect(computeNextDueAt(monthly(31), '2026-03-31')).toBe('2026-04-30');
  });

  test('跨年', () => {
    expect(computeNextDueAt(monthly(1), '2026-12-15')).toBe('2027-01-01');
  });

  test('dayOfMonth 越界抛错', () => {
    expect(() => computeNextDueAt(monthly(32), '2026-09-17')).toThrow(/dayOfMonth/);
    expect(() => computeNextDueAt(monthly(0), '2026-09-17')).toThrow(/dayOfMonth/);
  });
});

describe('computeNextDueAt · 固定日历 yearly', () => {
  const yearly = (month, dayOfMonth) => ({
    scheduleType: 'fixed',
    fixedRule: { type: 'yearly', month, dayOfMonth },
  });

  test('每年 4 月 15 日，基准 5 月返回次年', () => {
    expect(computeNextDueAt(yearly(4, 15), '2026-05-01')).toBe('2027-04-15');
  });

  test('每年 10 月 1 日，基准 9 月返回当年', () => {
    expect(computeNextDueAt(yearly(10, 1), '2026-09-17')).toBe('2026-10-01');
  });

  test('基准正好是规则日时返回次年', () => {
    expect(computeNextDueAt(yearly(10, 1), '2026-10-01')).toBe('2027-10-01');
  });

  test('每年 2 月 29 日在非闰年取 2 月 28 日', () => {
    expect(computeNextDueAt(yearly(2, 29), '2026-01-01')).toBe('2026-02-28');
  });

  test('每年 2 月 29 日在闰年取 2 月 29 日', () => {
    expect(computeNextDueAt(yearly(2, 29), '2028-01-01')).toBe('2028-02-29');
  });

  test('month 越界抛错', () => {
    expect(() => computeNextDueAt(yearly(13, 1), '2026-09-17')).toThrow(/month/);
  });
});

describe('computeNextDueAt · 固定日历非法规则', () => {
  test('缺少 fixedRule 抛错', () => {
    expect(() => computeNextDueAt({ scheduleType: 'fixed' }, '2026-09-17')).toThrow(
      /fixedRule/
    );
  });

  test('未知 fixedRule.type 抛错', () => {
    expect(() =>
      computeNextDueAt(
        { scheduleType: 'fixed', fixedRule: { type: 'hourly' } },
        '2026-09-17'
      )
    ).toThrow(/unsupported fixedRule type/);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest shared/schedule.test.js`
Expected: FAIL，多条用例报 `unsupported scheduleType: fixed`

- [ ] **Step 3: 实现固定日历分支**

替换 `shared/schedule.js` 全文：

```js
// 下次到期日计算。输入输出均为本地日历日字符串 YYYY-MM-DD。
const {
  addDays,
  toLocalDateKey,
  parseDateKey,
  makeDateKey,
  weekdayOf,
  daysInMonth,
} = require('./date');

// 按优先级解析周期计算的基准日：
// 上次完成日 -> 新建时用户填写的「上次是什么时候做的」 -> 创建当天
function resolveBaseKey({ lastDoneAt, initialLastDoneKey, createdAt }) {
  if (lastDoneAt) return toLocalDateKey(lastDoneAt);
  if (initialLastDoneKey) return initialLastDoneKey;
  return toLocalDateKey(createdAt);
}

function nextFloating(baseKey, intervalDays) {
  if (!Number.isInteger(intervalDays) || intervalDays < 1) {
    throw new Error(`invalid intervalDays: ${intervalDays}`);
  }
  return addDays(baseKey, intervalDays);
}

function nextWeekly(baseKey, weekdays) {
  if (!Array.isArray(weekdays) || weekdays.length === 0) {
    throw new Error(`invalid weekdays: ${JSON.stringify(weekdays)}`);
  }
  if (weekdays.some((w) => !Number.isInteger(w) || w < 0 || w > 6)) {
    throw new Error(`invalid weekdays: ${JSON.stringify(weekdays)}`);
  }
  const baseWeekday = weekdayOf(baseKey);
  // delta 为 0 表示基准日本身，按「严格晚于」的语义顺延整周
  const deltas = weekdays.map((w) => ((w - baseWeekday + 7) % 7) || 7);
  return addDays(baseKey, Math.min(...deltas));
}

function nextMonthly(baseKey, dayOfMonth) {
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`invalid dayOfMonth: ${dayOfMonth}`);
  }
  const { y, m } = parseDateKey(baseKey);
  // 最多两轮：本月的候选日若不晚于基准日，下月的候选日必然晚于基准日
  let cy = y;
  let cm = m;
  for (let i = 0; i < 2; i += 1) {
    const day = Math.min(dayOfMonth, daysInMonth(cy, cm));
    const candidate = makeDateKey(cy, cm, day);
    if (candidate > baseKey) return candidate;
    cm += 1;
    if (cm > 12) {
      cm = 1;
      cy += 1;
    }
  }
  throw new Error(`failed to resolve monthly rule from ${baseKey}`);
}

function nextYearly(baseKey, month, dayOfMonth) {
  if (!Number.isInteger(month) || month < 1 || month > 12) {
    throw new Error(`invalid month: ${month}`);
  }
  if (!Number.isInteger(dayOfMonth) || dayOfMonth < 1 || dayOfMonth > 31) {
    throw new Error(`invalid dayOfMonth: ${dayOfMonth}`);
  }
  const { y } = parseDateKey(baseKey);
  for (let cy = y; cy <= y + 1; cy += 1) {
    const day = Math.min(dayOfMonth, daysInMonth(cy, month));
    const candidate = makeDateKey(cy, month, day);
    if (candidate > baseKey) return candidate;
  }
  throw new Error(`failed to resolve yearly rule from ${baseKey}`);
}

function nextFixed(baseKey, rule) {
  if (!rule || typeof rule !== 'object') {
    throw new Error('missing fixedRule');
  }
  if (rule.type === 'weekly') return nextWeekly(baseKey, rule.weekdays);
  if (rule.type === 'monthly') return nextMonthly(baseKey, rule.dayOfMonth);
  if (rule.type === 'yearly') return nextYearly(baseKey, rule.month, rule.dayOfMonth);
  throw new Error(`unsupported fixedRule type: ${rule.type}`);
}

function computeNextDueAt(chore, baseKey) {
  if (chore.scheduleType === 'floating') {
    return nextFloating(baseKey, chore.intervalDays);
  }
  if (chore.scheduleType === 'fixed') {
    return nextFixed(baseKey, chore.fixedRule);
  }
  throw new Error(`unsupported scheduleType: ${chore.scheduleType}`);
}

module.exports = { resolveBaseKey, computeNextDueAt };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest shared/schedule.test.js`
Expected: PASS，`Tests: 35 passed`

- [ ] **Step 5: 全量回归**

Run: `npm test`
Expected: PASS，`Test Suites: 2 passed`

- [ ] **Step 6: 提交**

```bash
git add shared/schedule.js shared/schedule.test.js
git commit -m "feat: 实现固定日历周期（每周/每月/每年）到期日计算"
```

---

### Task 4: 紧急度分档、排序与到期文案

**Files:**
- Create: `shared/urgency.js`
- Test: `shared/urgency.test.js`

**Interfaces:**
- Consumes: `shared/date.js` 的 `diffDays`
- Produces: `shared/urgency.js` 导出
  - `SOON_THRESHOLD_DAYS: number` — 恒为 3
  - `LEVELS: { OVERDUE: 'overdue', TODAY: 'today', SOON: 'soon', NORMAL: 'normal' }`
  - `classify(nextDueAt: string, todayKey: string): { level: string, days: number }` — `days` 为 `nextDueAt - todayKey`，逾期为负
  - `formatDueText(urgency: { level: string, days: number }): string` — 如 `'已逾期 2 天'`、`'今天到期'`、`'还有 3 天'`
  - `sortChores(chores: object[], todayKey: string): object[]` — 返回新数组，每项附加 `urgency` 字段，原数组不被修改

- [ ] **Step 1: 写失败的测试**

创建 `shared/urgency.test.js`：

```js
const {
  SOON_THRESHOLD_DAYS,
  LEVELS,
  classify,
  formatDueText,
  sortChores,
} = require('./urgency');

describe('常量', () => {
  test('soon 阈值固定 3 天', () => {
    expect(SOON_THRESHOLD_DAYS).toBe(3);
  });

  test('四档取值', () => {
    expect(LEVELS).toEqual({
      OVERDUE: 'overdue',
      TODAY: 'today',
      SOON: 'soon',
      NORMAL: 'normal',
    });
  });
});

describe('classify', () => {
  const today = '2026-09-17';

  test('过期一天是 overdue', () => {
    expect(classify('2026-09-16', today)).toEqual({ level: 'overdue', days: -1 });
  });

  test('过期很久是 overdue', () => {
    expect(classify('2026-08-17', today)).toEqual({ level: 'overdue', days: -31 });
  });

  test('当天是 today', () => {
    expect(classify('2026-09-17', today)).toEqual({ level: 'today', days: 0 });
  });

  test('1 天后是 soon', () => {
    expect(classify('2026-09-18', today)).toEqual({ level: 'soon', days: 1 });
  });

  test('3 天后仍是 soon（边界包含）', () => {
    expect(classify('2026-09-20', today)).toEqual({ level: 'soon', days: 3 });
  });

  test('4 天后是 normal（边界之外）', () => {
    expect(classify('2026-09-21', today)).toEqual({ level: 'normal', days: 4 });
  });
});

describe('formatDueText', () => {
  test('逾期显示逾期天数的绝对值', () => {
    expect(formatDueText({ level: 'overdue', days: -2 })).toBe('已逾期 2 天');
  });

  test('逾期一天', () => {
    expect(formatDueText({ level: 'overdue', days: -1 })).toBe('已逾期 1 天');
  });

  test('今天到期', () => {
    expect(formatDueText({ level: 'today', days: 0 })).toBe('今天到期');
  });

  test('明天到期', () => {
    expect(formatDueText({ level: 'soon', days: 1 })).toBe('明天到期');
  });

  test('临近显示剩余天数', () => {
    expect(formatDueText({ level: 'soon', days: 3 })).toBe('还有 3 天');
  });

  test('正常显示剩余天数', () => {
    expect(formatDueText({ level: 'normal', days: 12 })).toBe('还有 12 天');
  });
});

describe('sortChores', () => {
  const today = '2026-09-17';

  test('按四档先后排序', () => {
    const input = [
      { name: '正常', nextDueAt: '2026-10-01' },
      { name: '今天', nextDueAt: '2026-09-17' },
      { name: '临近', nextDueAt: '2026-09-19' },
      { name: '逾期', nextDueAt: '2026-09-10' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '逾期',
      '今天',
      '临近',
      '正常',
    ]);
  });

  test('逾期档内拖得越久排越前', () => {
    const input = [
      { name: '逾期3天', nextDueAt: '2026-09-14' },
      { name: '逾期30天', nextDueAt: '2026-08-18' },
      { name: '逾期1天', nextDueAt: '2026-09-16' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '逾期30天',
      '逾期3天',
      '逾期1天',
    ]);
  });

  test('未逾期档内日期近的排越前', () => {
    const input = [
      { name: '20天后', nextDueAt: '2026-10-07' },
      { name: '5天后', nextDueAt: '2026-09-22' },
      { name: '10天后', nextDueAt: '2026-09-27' },
    ];
    expect(sortChores(input, today).map((c) => c.name)).toEqual([
      '5天后',
      '10天后',
      '20天后',
    ]);
  });

  test('同一天到期时按名称排序，保证顺序稳定', () => {
    const input = [
      { name: '刷马桶', nextDueAt: '2026-09-17' },
      { name: '擦玻璃', nextDueAt: '2026-09-17' },
    ];
    const names = sortChores(input, today).map((c) => c.name);
    expect(names).toEqual([...names].sort((a, b) => a.localeCompare(b, 'zh')));
  });

  test('每项附加 urgency 字段', () => {
    const result = sortChores([{ name: 'x', nextDueAt: '2026-09-16' }], today);
    expect(result[0].urgency).toEqual({ level: 'overdue', days: -1 });
  });

  test('不修改原数组', () => {
    const input = [{ name: 'x', nextDueAt: '2026-09-16' }];
    sortChores(input, today);
    expect(input[0].urgency).toBeUndefined();
    expect(input).toHaveLength(1);
  });

  test('空数组返回空数组', () => {
    expect(sortChores([], today)).toEqual([]);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest shared/urgency.test.js`
Expected: FAIL，报错 `Cannot find module './urgency'`

- [ ] **Step 3: 实现 urgency.js**

创建 `shared/urgency.js`：

```js
// 紧急度分档、排序与到期文案。
// 这里的阈值只影响展示分组，与家务自身的 reminderLeadDays（推送时机）无关。
const { diffDays } = require('./date');

const SOON_THRESHOLD_DAYS = 3;

const LEVELS = {
  OVERDUE: 'overdue',
  TODAY: 'today',
  SOON: 'soon',
  NORMAL: 'normal',
};

const LEVEL_ORDER = {
  [LEVELS.OVERDUE]: 0,
  [LEVELS.TODAY]: 1,
  [LEVELS.SOON]: 2,
  [LEVELS.NORMAL]: 3,
};

function classify(nextDueAt, todayKey) {
  const days = diffDays(todayKey, nextDueAt);
  if (days < 0) return { level: LEVELS.OVERDUE, days };
  if (days === 0) return { level: LEVELS.TODAY, days };
  if (days <= SOON_THRESHOLD_DAYS) return { level: LEVELS.SOON, days };
  return { level: LEVELS.NORMAL, days };
}

function formatDueText(urgency) {
  if (urgency.level === LEVELS.OVERDUE) return `已逾期 ${-urgency.days} 天`;
  if (urgency.level === LEVELS.TODAY) return '今天到期';
  if (urgency.days === 1) return '明天到期';
  return `还有 ${urgency.days} 天`;
}

// 逾期档要求拖得越久越靠前（days 越负），其余档要求日期越近越靠前（days 越小）。
// 两者都是 days 升序，因此同档内统一升序即可。
function sortChores(chores, todayKey) {
  return chores
    .map((chore) => ({ ...chore, urgency: classify(chore.nextDueAt, todayKey) }))
    .sort((a, b) => {
      const byLevel = LEVEL_ORDER[a.urgency.level] - LEVEL_ORDER[b.urgency.level];
      if (byLevel !== 0) return byLevel;
      if (a.urgency.days !== b.urgency.days) return a.urgency.days - b.urgency.days;
      return String(a.name).localeCompare(String(b.name), 'zh');
    });
}

module.exports = { SOON_THRESHOLD_DAYS, LEVELS, classify, formatDueText, sortChores };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest shared/urgency.test.js`
Expected: PASS，`Tests: 21 passed`

- [ ] **Step 5: 提交**

```bash
git add shared/urgency.js shared/urgency.test.js
git commit -m "feat: 实现紧急度分档、首屏排序与到期文案"
```

---

### Task 5: 共享代码同步脚本

云函数无法跨目录引用代码，小程序也只能引用 `miniprogram/` 根目录内的文件。`shared/` 是唯一真源，本脚本把它分发到各消费方。

**Files:**
- Create: `scripts/sync-shared.js`
- Test: `scripts/sync-shared.test.js`

**Interfaces:**
- Consumes: 无
- Produces: `scripts/sync-shared.js` 导出
  - `TARGETS: { dir: string, files: string[] }[]` — 分发清单
  - `syncShared({ rootDir?: string, targets?: object[] }): { dir: string, files: string[] }[]` — 执行拷贝并返回实际写入清单
  - 直接 `node scripts/sync-shared.js` 时以仓库根为 `rootDir` 执行

- [ ] **Step 1: 写失败的测试**

创建 `scripts/sync-shared.test.js`：

```js
const fs = require('fs');
const os = require('os');
const path = require('path');
const { TARGETS, syncShared } = require('./sync-shared');

describe('TARGETS 分发清单', () => {
  test('覆盖两个云函数与小程序三个消费方', () => {
    expect(TARGETS.map((t) => t.dir)).toEqual([
      'cloudfunctions/api/lib',
      'cloudfunctions/reminder/lib',
      'miniprogram/utils/shared',
    ]);
  });

  test('云函数拿到完整三个文件', () => {
    expect(TARGETS[0].files).toEqual(['date.js', 'schedule.js', 'urgency.js']);
    expect(TARGETS[1].files).toEqual(['date.js', 'schedule.js', 'urgency.js']);
  });

  test('小程序不同步 schedule.js，周期计算只在云函数执行', () => {
    expect(TARGETS[2].files).toEqual(['date.js', 'urgency.js']);
    expect(TARGETS[2].files).not.toContain('schedule.js');
  });
});

describe('syncShared', () => {
  let rootDir;

  beforeEach(() => {
    rootDir = fs.mkdtempSync(path.join(os.tmpdir(), 'sync-shared-'));
    fs.mkdirSync(path.join(rootDir, 'shared'));
    fs.writeFileSync(path.join(rootDir, 'shared', 'date.js'), '// date');
    fs.writeFileSync(path.join(rootDir, 'shared', 'urgency.js'), '// urgency');
  });

  afterEach(() => {
    fs.rmSync(rootDir, { recursive: true, force: true });
  });

  test('拷贝文件并自动创建目标目录', () => {
    syncShared({
      rootDir,
      targets: [{ dir: 'cloudfunctions/api/lib', files: ['date.js'] }],
    });
    const written = path.join(rootDir, 'cloudfunctions/api/lib/date.js');
    expect(fs.readFileSync(written, 'utf8')).toBe('// date');
  });

  test('返回实际写入清单', () => {
    const result = syncShared({
      rootDir,
      targets: [{ dir: 'a/lib', files: ['date.js', 'urgency.js'] }],
    });
    expect(result).toEqual([{ dir: 'a/lib', files: ['date.js', 'urgency.js'] }]);
  });

  test('重复执行覆盖旧内容', () => {
    const targets = [{ dir: 'a/lib', files: ['date.js'] }];
    syncShared({ rootDir, targets });
    fs.writeFileSync(path.join(rootDir, 'shared', 'date.js'), '// updated');
    syncShared({ rootDir, targets });
    expect(fs.readFileSync(path.join(rootDir, 'a/lib/date.js'), 'utf8')).toBe('// updated');
  });

  test('源文件缺失时抛错而非静默跳过', () => {
    expect(() =>
      syncShared({ rootDir, targets: [{ dir: 'a/lib', files: ['missing.js'] }] })
    ).toThrow(/missing.js/);
  });

  test('写入文件带有禁止手工编辑的头注释', () => {
    syncShared({ rootDir, targets: [{ dir: 'a/lib', files: ['date.js'] }] });
    const content = fs.readFileSync(path.join(rootDir, 'a/lib/date.js'), 'utf8');
    expect(content).toContain('自动生成');
    expect(content).toContain('shared/date.js');
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest scripts/sync-shared.test.js`
Expected: FAIL，报错 `Cannot find module './sync-shared'`

- [ ] **Step 3: 实现同步脚本**

创建 `scripts/sync-shared.js`：

```js
#!/usr/bin/env node
// 把 shared/ 下的纯函数分发到各消费方。
// 云函数无法跨目录 require，小程序只能引用 miniprogram/ 内的文件，
// 因此用拷贝而非软链接或 npm workspace。
const fs = require('fs');
const path = require('path');

const ALL_FILES = ['date.js', 'schedule.js', 'urgency.js'];

const TARGETS = [
  { dir: 'cloudfunctions/api/lib', files: ALL_FILES },
  { dir: 'cloudfunctions/reminder/lib', files: ALL_FILES },
  // 小程序不拿 schedule.js：到期日由云函数算好并持久化，前端只读 nextDueAt。
  { dir: 'miniprogram/utils/shared', files: ['date.js', 'urgency.js'] },
];

function banner(fileName) {
  return [
    '// 此文件由 scripts/sync-shared.js 自动生成，请勿手工编辑。',
    `// 源文件：shared/${fileName}`,
    '',
  ].join('\n');
}

function syncShared({ rootDir = path.resolve(__dirname, '..'), targets = TARGETS } = {}) {
  return targets.map(({ dir, files }) => {
    const destDir = path.join(rootDir, dir);
    fs.mkdirSync(destDir, { recursive: true });
    files.forEach((fileName) => {
      const src = path.join(rootDir, 'shared', fileName);
      if (!fs.existsSync(src)) {
        throw new Error(`shared source not found: ${fileName}`);
      }
      const body = fs.readFileSync(src, 'utf8');
      fs.writeFileSync(path.join(destDir, fileName), banner(fileName) + body);
    });
    return { dir, files };
  });
}

if (require.main === module) {
  syncShared().forEach(({ dir, files }) => {
    console.log(`synced ${files.length} file(s) -> ${dir}`);
  });
}

module.exports = { TARGETS, syncShared };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest scripts/sync-shared.test.js`
Expected: PASS，`Tests: 8 passed`

- [ ] **Step 5: 首次执行同步**

Run: `npm run sync:shared`
Expected: 输出三行，分别是
```
synced 3 file(s) -> cloudfunctions/api/lib
synced 3 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared
```

- [ ] **Step 6: 确认生成文件未被 Jest 重复收集**

Run: `npm test`
Expected: PASS，`Test Suites: 4 passed`（`date`、`schedule`、`urgency`、`sync-shared`，生成目录里没有测试文件，数量不应变多）

- [ ] **Step 7: 提交**

```bash
git add scripts/sync-shared.js scripts/sync-shared.test.js cloudfunctions miniprogram
git commit -m "feat: 添加共享代码同步脚本并生成首份分发副本"
```

---

### Task 6: api 云函数骨架与鉴权

本任务建立 action 路由、错误约定、鉴权校验与内存假 repo。后续所有 action 任务都依赖这套基础设施。

**Files:**
- Create: `cloudfunctions/api/package.json`
- Create: `cloudfunctions/api/lib/errors.js`
- Create: `cloudfunctions/api/lib/router.js`
- Create: `cloudfunctions/api/lib/auth.js`
- Create: `cloudfunctions/api/actions/index.js`
- Create: `cloudfunctions/api/test/fake-repo.js`
- Test: `cloudfunctions/api/test/router.test.js`
- Test: `cloudfunctions/api/test/auth.test.js`

注意：`lib/errors.js`、`lib/router.js`、`lib/auth.js` 是手写文件，与同步脚本生成的 `lib/date.js`、`lib/schedule.js`、`lib/urgency.js` 同处一个目录。同步脚本按文件名精确拷贝，不会删除同目录的其他文件。

**Interfaces:**
- Consumes: 无
- Produces:
  - `lib/errors.js`：`appError(code: string, message: string): Error` — 返回带 `code` 属性的 Error；`CODES: { UNKNOWN_ACTION, NO_IDENTITY, FORBIDDEN, NOT_FOUND, INVALID_ARGUMENT, CONFLICT, INTERNAL }`（值与键名同名字符串）
  - `lib/router.js`：`createRouter({ actions, getOpenid, getRepo, logger? }): (event) => Promise<{ ok, data } | { ok, code, message }>`
  - `lib/auth.js`：`requireMember(repo, openid): Promise<member>` — 找不到或 `active` 为 false 时抛 `FORBIDDEN`；`requireOwner(repo, openid): Promise<member>` — 非 `owner` 角色抛 `FORBIDDEN`
  - `test/fake-repo.js`：`createFakeRepo(seed?): repo` — 内存实现，额外暴露 `_state` 便于断言。repo 完整方法清单见下方 Step 3。
  - `actions/index.js`：一个 `{ [actionName]: handler }` 映射，handler 签名为 `({ openid, payload, repo }) => Promise<any>`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/api/test/router.test.js`：

```js
const { createRouter } = require('../lib/router');
const { appError, CODES } = require('../lib/errors');

const noopLogger = { error: () => {} };

function build(actions, openid = 'openid-a') {
  return createRouter({
    actions,
    getOpenid: () => openid,
    getRepo: () => ({}),
    logger: noopLogger,
  });
}

describe('createRouter', () => {
  test('成功时返回 ok 与 data', async () => {
    const handle = build({ 'ping.do': async () => ({ pong: 1 }) });
    await expect(handle({ action: 'ping.do' })).resolves.toEqual({
      ok: true,
      data: { pong: 1 },
    });
  });

  test('未知 action 返回 UNKNOWN_ACTION', async () => {
    const handle = build({});
    const res = await handle({ action: 'nope' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe(CODES.UNKNOWN_ACTION);
  });

  test('缺少 action 返回 UNKNOWN_ACTION', async () => {
    const handle = build({});
    expect((await handle({})).code).toBe(CODES.UNKNOWN_ACTION);
  });

  test('拿不到 openid 返回 NO_IDENTITY', async () => {
    const handle = createRouter({
      actions: { 'ping.do': async () => 1 },
      getOpenid: () => undefined,
      getRepo: () => ({}),
      logger: noopLogger,
    });
    expect((await handle({ action: 'ping.do' })).code).toBe(CODES.NO_IDENTITY);
  });

  test('payload 缺省时传空对象给 handler', async () => {
    let seen;
    const handle = build({
      'ping.do': async ({ payload }) => {
        seen = payload;
        return null;
      },
    });
    await handle({ action: 'ping.do' });
    expect(seen).toEqual({});
  });

  test('handler 收到 openid', async () => {
    let seen;
    const handle = build({
      'ping.do': async ({ openid }) => {
        seen = openid;
        return null;
      },
    });
    await handle({ action: 'ping.do' });
    expect(seen).toBe('openid-a');
  });

  test('已知错误码原样透出，含中文 message', async () => {
    const handle = build({
      'ping.do': async () => {
        throw appError(CODES.FORBIDDEN, '你不在这个家庭中');
      },
    });
    expect(await handle({ action: 'ping.do' })).toEqual({
      ok: false,
      code: CODES.FORBIDDEN,
      message: '你不在这个家庭中',
    });
  });

  test('未预期异常统一收敛为 INTERNAL 且不泄露堆栈', async () => {
    const handle = build({
      'ping.do': async () => {
        throw new Error('db exploded at line 42');
      },
    });
    const res = await handle({ action: 'ping.do' });
    expect(res).toEqual({ ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' });
  });

  test('未预期异常会记录日志', async () => {
    const logger = { error: jest.fn() };
    const handle = createRouter({
      actions: {
        'ping.do': async () => {
          throw new Error('boom');
        },
      },
      getOpenid: () => 'openid-a',
      getRepo: () => ({}),
      logger,
    });
    await handle({ action: 'ping.do' });
    expect(logger.error).toHaveBeenCalled();
  });
});
```

创建 `cloudfunctions/api/test/auth.test.js`：

```js
const { requireMember, requireOwner } = require('../lib/auth');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');

describe('requireMember', () => {
  test('返回在册成员', async () => {
    const repo = createFakeRepo({
      members: [
        { _id: 'm1', familyId: 'f1', openid: 'openid-a', role: 'owner', active: true },
      ],
    });
    const member = await requireMember(repo, 'openid-a');
    expect(member._id).toBe('m1');
    expect(member.familyId).toBe('f1');
  });

  test('未加入任何家庭时抛 FORBIDDEN', async () => {
    const repo = createFakeRepo();
    await expect(requireMember(repo, 'openid-x')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });

  test('已退出家庭（active 为 false）时抛 FORBIDDEN', async () => {
    const repo = createFakeRepo({
      members: [
        { _id: 'm1', familyId: 'f1', openid: 'openid-a', role: 'member', active: false },
      ],
    });
    await expect(requireMember(repo, 'openid-a')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });
});

describe('requireOwner', () => {
  test('owner 通过', async () => {
    const repo = createFakeRepo({
      members: [
        { _id: 'm1', familyId: 'f1', openid: 'openid-a', role: 'owner', active: true },
      ],
    });
    await expect(requireOwner(repo, 'openid-a')).resolves.toMatchObject({ _id: 'm1' });
  });

  test('普通成员抛 FORBIDDEN', async () => {
    const repo = createFakeRepo({
      members: [
        { _id: 'm2', familyId: 'f1', openid: 'openid-b', role: 'member', active: true },
      ],
    });
    await expect(requireOwner(repo, 'openid-b')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api`
Expected: FAIL，报错 `Cannot find module '../lib/router'`

- [ ] **Step 3: 实现骨架与假 repo**

创建 `cloudfunctions/api/package.json`：

```json
{
  "name": "housework-api",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

创建 `cloudfunctions/api/lib/errors.js`：

```js
const CODES = {
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  NO_IDENTITY: 'NO_IDENTITY',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
};

// message 会直接展示给用户，必须是中文且可读。
function appError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

module.exports = { CODES, appError };
```

创建 `cloudfunctions/api/lib/router.js`：

```js
const { CODES } = require('./errors');

// 单入口 + action 路由。所有依赖通过参数注入，便于单元测试替换。
function createRouter({ actions, getOpenid, getRepo, logger = console }) {
  return async function handle(event = {}) {
    const { action, payload = {} } = event;
    const handler = actions[action];
    if (!handler) {
      return { ok: false, code: CODES.UNKNOWN_ACTION, message: `未知操作：${action}` };
    }
    const openid = getOpenid();
    if (!openid) {
      return { ok: false, code: CODES.NO_IDENTITY, message: '无法获取微信身份，请重新进入小程序' };
    }
    try {
      const data = await handler({ openid, payload, repo: getRepo() });
      return { ok: true, data };
    } catch (err) {
      if (err && err.code && CODES[err.code]) {
        return { ok: false, code: err.code, message: err.message };
      }
      logger.error(`[api] action=${action} failed`, err);
      return { ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' };
    }
  };
}

module.exports = { createRouter };
```

创建 `cloudfunctions/api/lib/auth.js`：

```js
const { appError, CODES } = require('./errors');

// 身份来自 cloud.getWXContext().OPENID，由微信侧注入，客户端无法伪造。
// 所有涉及家庭数据的 action 都必须先过这一关。
async function requireMember(repo, openid) {
  const member = await repo.findMemberByOpenid(openid);
  if (!member || !member.active) {
    throw appError(CODES.FORBIDDEN, '你还没有加入任何家庭');
  }
  return member;
}

async function requireOwner(repo, openid) {
  const member = await requireMember(repo, openid);
  if (member.role !== 'owner') {
    throw appError(CODES.FORBIDDEN, '只有家庭创建者可以进行此操作');
  }
  return member;
}

module.exports = { requireMember, requireOwner };
```

创建 `cloudfunctions/api/actions/index.js`：

```js
// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
module.exports = {};
```

创建 `cloudfunctions/api/test/fake-repo.js`：

```js
// repository 的内存实现，供 action 单元测试使用。
// 方法签名必须与 cloudfunctions/api/lib/repo.js（Task 11）严格一致。
let seq = 0;
function nextId(prefix) {
  seq += 1;
  return `${prefix}${seq}`;
}

function createFakeRepo(seed = {}) {
  const state = {
    families: [...(seed.families || [])],
    members: [...(seed.members || [])],
    chores: [...(seed.chores || [])],
    logs: [...(seed.logs || [])],
    reminderSends: [...(seed.reminderSends || [])],
  };

  const clone = (doc) => (doc ? JSON.parse(JSON.stringify(doc)) : doc);
  const patchDoc = (doc, patch) => Object.assign(doc, patch);

  return {
    _state: state,

    // families
    async createFamily(doc) {
      const created = { _id: nextId('f'), ...doc };
      state.families.push(created);
      return clone(created);
    },
    async getFamily(id) {
      return clone(state.families.find((f) => f._id === id) || null);
    },
    async updateFamily(id, patch) {
      const doc = state.families.find((f) => f._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },
    async findFamilyByInviteCode(code) {
      return clone(state.families.find((f) => f.inviteCode === code) || null);
    },
    async listFamiliesByReminderHour(hour) {
      return state.families
        .filter((f) => f.settings && f.settings.reminderHour === hour)
        .map(clone);
    },

    // members
    async createMember(doc) {
      const created = { _id: nextId('m'), ...doc };
      state.members.push(created);
      return clone(created);
    },
    async findMemberByOpenid(openid) {
      return clone(state.members.find((m) => m.openid === openid) || null);
    },
    async listMembers(familyId) {
      return state.members
        .filter((m) => m.familyId === familyId && m.active)
        .map(clone);
    },
    async updateMember(id, patch) {
      const doc = state.members.find((m) => m._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },

    // chores
    async createChore(doc) {
      const created = { _id: nextId('c'), ...doc };
      state.chores.push(created);
      return clone(created);
    },
    async createChores(docs) {
      return Promise.all(docs.map((d) => this.createChore(d)));
    },
    async getChore(id) {
      return clone(state.chores.find((c) => c._id === id) || null);
    },
    async listChores(familyId, { archived = false, room = null } = {}) {
      return state.chores
        .filter((c) => c.familyId === familyId)
        .filter((c) => Boolean(c.archived) === archived)
        .filter((c) => (room ? c.room === room : true))
        .map(clone);
    },
    async updateChore(id, patch) {
      const doc = state.chores.find((c) => c._id === id);
      if (!doc) return null;
      return clone(patchDoc(doc, patch));
    },
    async listDueChores(familyId, maxDueKey) {
      return state.chores
        .filter((c) => c.familyId === familyId && !c.archived && c.nextDueAt <= maxDueKey)
        .map(clone);
    },

    // chore_logs
    async createLog(doc) {
      const created = { _id: nextId('l'), ...doc };
      state.logs.push(created);
      return clone(created);
    },
    async listLogs(choreId, { limit = 20, skip = 0 } = {}) {
      return state.logs
        .filter((l) => l.choreId === choreId)
        .sort((a, b) => b.doneAt - a.doneAt)
        .slice(skip, skip + limit)
        .map(clone);
    },
    async listRecentDoneLogs(choreId, limit) {
      return state.logs
        .filter((l) => l.choreId === choreId && l.type === 'done')
        .sort((a, b) => b.doneAt - a.doneAt)
        .slice(0, limit)
        .map(clone);
    },
    async deleteLog(id) {
      const idx = state.logs.findIndex((l) => l._id === id);
      if (idx === -1) return false;
      state.logs.splice(idx, 1);
      return true;
    },

    // reminder_sends
    async hasSentReminder(openid, dateKey) {
      return state.reminderSends.some((r) => r.openid === openid && r.dateKey === dateKey);
    },
    async recordReminderSent(doc) {
      const created = { _id: nextId('r'), ...doc };
      state.reminderSends.push(created);
      return clone(created);
    },
  };
}

module.exports = { createFakeRepo };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 14 passed`

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 添加 api 云函数路由、错误约定、鉴权与内存假 repo"
```

---

### Task 7: 家庭相关 action

**Files:**
- Create: `cloudfunctions/api/actions/family.js`
- Modify: `cloudfunctions/api/actions/index.js`
- Create: `cloudfunctions/api/lib/invite.js`
- Test: `cloudfunctions/api/test/family.test.js`
- Test: `cloudfunctions/api/test/invite.test.js`

**Interfaces:**
- Consumes: `lib/errors.js` 的 `appError`/`CODES`、`lib/auth.js` 的 `requireMember`/`requireOwner`、`test/fake-repo.js` 的 `createFakeRepo`
- Produces:
  - `lib/invite.js`：`INVITE_CODE_TTL_MS: number`（7 天）、`generateInviteCode(random?): string`（6 位大写字母数字）、`isInviteCodeValid(family, now): boolean`
  - `actions/family.js` 导出 handler 映射，注册到 `actions/index.js` 的键为：
    - `family.createOrGet` — payload `{ name?: string }`，返回 `{ family, member, members }`
    - `family.join` — payload `{ inviteCode: string }`，返回 `{ family, member }`
    - `family.refreshInviteCode` — 无 payload，返回 `{ inviteCode, inviteCodeExpireAt }`
    - `family.listMembers` — 无 payload，返回 `{ members }`
    - `family.updateSettings` — payload `{ reminderHour?: 7|8|20, defaultReminderLeadDays?: number }`，返回 `{ settings }`
  - 默认家庭名为 `'我的家'`，默认 `settings` 为 `{ reminderHour: 8, defaultReminderLeadDays: 1 }`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/api/test/invite.test.js`：

```js
const {
  INVITE_CODE_TTL_MS,
  generateInviteCode,
  isInviteCodeValid,
} = require('../lib/invite');

describe('INVITE_CODE_TTL_MS', () => {
  test('有效期 7 天', () => {
    expect(INVITE_CODE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('generateInviteCode', () => {
  test('返回 6 位大写字母或数字', () => {
    expect(generateInviteCode()).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('接受注入的随机源以便确定性测试', () => {
    expect(generateInviteCode(() => 0)).toMatch(/^[A-Z0-9]{6}$/);
    expect(generateInviteCode(() => 0)).toBe(generateInviteCode(() => 0));
  });

  test('多次生成不应总是相同', () => {
    const codes = new Set(Array.from({ length: 50 }, () => generateInviteCode()));
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('isInviteCodeValid', () => {
  const now = Date.UTC(2026, 8, 17, 4, 0);

  test('未过期返回 true', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now + 1000 }, now)).toBe(true);
  });

  test('已过期返回 false', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now - 1000 }, now)).toBe(false);
  });

  test('正好到期返回 false', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now }, now)).toBe(false);
  });

  test('缺少过期时间返回 false', () => {
    expect(isInviteCodeValid({}, now)).toBe(false);
  });
});
```

创建 `cloudfunctions/api/test/family.test.js`：

```js
const actions = require('../actions');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');

const call = (name, repo, openid, payload = {}) =>
  actions[name]({ openid, payload, repo });

const seededFamily = (overrides = {}) => ({
  _id: 'f1',
  name: '我的家',
  ownerOpenid: 'openid-a',
  inviteCode: 'ABC123',
  inviteCodeExpireAt: Date.now() + 86400000,
  settings: { reminderHour: 8, defaultReminderLeadDays: 1 },
  createdAt: Date.now(),
  ...overrides,
});

const ownerMember = () => ({
  _id: 'm1',
  familyId: 'f1',
  openid: 'openid-a',
  nickname: '我',
  avatarUrl: '',
  role: 'owner',
  subscribeQuota: 0,
  joinedAt: Date.now(),
  active: true,
});

describe('family.createOrGet', () => {
  test('首次调用创建家庭并把调用者设为 owner', async () => {
    const repo = createFakeRepo();
    const res = await call('family.createOrGet', repo, 'openid-a');
    expect(res.family.name).toBe('我的家');
    expect(res.family.ownerOpenid).toBe('openid-a');
    expect(res.member.role).toBe('owner');
    expect(res.member.active).toBe(true);
    expect(res.members).toHaveLength(1);
  });

  test('创建时带上默认设置', async () => {
    const repo = createFakeRepo();
    const res = await call('family.createOrGet', repo, 'openid-a');
    expect(res.family.settings).toEqual({ reminderHour: 8, defaultReminderLeadDays: 1 });
  });

  test('创建时生成 6 位邀请码与 7 天有效期', async () => {
    const repo = createFakeRepo();
    const res = await call('family.createOrGet', repo, 'openid-a');
    expect(res.family.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(res.family.inviteCodeExpireAt).toBeGreaterThan(Date.now());
  });

  test('可自定义家庭名', async () => {
    const repo = createFakeRepo();
    const res = await call('family.createOrGet', repo, 'openid-a', { name: '张家' });
    expect(res.family.name).toBe('张家');
  });

  test('已有家庭时幂等返回，不重复创建', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.createOrGet', repo, 'openid-a');
    expect(res.family._id).toBe('f1');
    expect(repo._state.families).toHaveLength(1);
    expect(repo._state.members).toHaveLength(1);
  });
});

describe('family.join', () => {
  test('凭有效邀请码加入并成为 member', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.join', repo, 'openid-b', { inviteCode: 'ABC123' });
    expect(res.family._id).toBe('f1');
    expect(res.member.role).toBe('member');
    expect(res.member.familyId).toBe('f1');
    expect(res.member.subscribeQuota).toBe(0);
  });

  test('邀请码大小写不敏感', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.join', repo, 'openid-b', { inviteCode: 'abc123' });
    expect(res.family._id).toBe('f1');
  });

  test('邀请码不存在抛 NOT_FOUND', async () => {
    const repo = createFakeRepo({ families: [seededFamily()] });
    await expect(
      call('family.join', repo, 'openid-b', { inviteCode: 'ZZZZZZ' })
    ).rejects.toMatchObject({ code: CODES.NOT_FOUND });
  });

  test('邀请码已过期抛 INVALID_ARGUMENT', async () => {
    const repo = createFakeRepo({
      families: [seededFamily({ inviteCodeExpireAt: Date.now() - 1000 })],
    });
    await expect(
      call('family.join', repo, 'openid-b', { inviteCode: 'ABC123' })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('已属于某个家庭时抛 CONFLICT', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    await expect(
      call('family.join', repo, 'openid-a', { inviteCode: 'ABC123' })
    ).rejects.toMatchObject({ code: CODES.CONFLICT });
  });

  test('缺少邀请码抛 INVALID_ARGUMENT', async () => {
    const repo = createFakeRepo({ families: [seededFamily()] });
    await expect(call('family.join', repo, 'openid-b', {})).rejects.toMatchObject({
      code: CODES.INVALID_ARGUMENT,
    });
  });
});

describe('family.refreshInviteCode', () => {
  test('owner 可重新生成，旧码立即失效', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.refreshInviteCode', repo, 'openid-a');
    expect(res.inviteCode).toMatch(/^[A-Z0-9]{6}$/);
    expect(repo._state.families[0].inviteCode).toBe(res.inviteCode);
    await expect(
      call('family.join', repo, 'openid-b', { inviteCode: 'ABC123' })
    ).rejects.toMatchObject({ code: CODES.NOT_FOUND });
  });

  test('普通成员不可重新生成', async () => {
    const repo = createFakeRepo({
      families: [seededFamily()],
      members: [
        { ...ownerMember(), _id: 'm2', openid: 'openid-b', role: 'member' },
      ],
    });
    await expect(call('family.refreshInviteCode', repo, 'openid-b')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });
});

describe('family.listMembers', () => {
  test('只返回在册成员', async () => {
    const repo = createFakeRepo({
      families: [seededFamily()],
      members: [
        ownerMember(),
        { ...ownerMember(), _id: 'm2', openid: 'openid-b', role: 'member' },
        { ...ownerMember(), _id: 'm3', openid: 'openid-c', role: 'member', active: false },
      ],
    });
    const res = await call('family.listMembers', repo, 'openid-a');
    expect(res.members.map((m) => m._id)).toEqual(['m1', 'm2']);
  });

  test('非成员调用抛 FORBIDDEN', async () => {
    const repo = createFakeRepo({ families: [seededFamily()] });
    await expect(call('family.listMembers', repo, 'openid-x')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });
});

describe('family.updateSettings', () => {
  test('修改提醒时段', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.updateSettings', repo, 'openid-a', { reminderHour: 20 });
    expect(res.settings.reminderHour).toBe(20);
    expect(res.settings.defaultReminderLeadDays).toBe(1);
  });

  test('修改默认提前提醒天数', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    const res = await call('family.updateSettings', repo, 'openid-a', {
      defaultReminderLeadDays: 3,
    });
    expect(res.settings.defaultReminderLeadDays).toBe(3);
  });

  test('非法提醒时段抛 INVALID_ARGUMENT', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    await expect(
      call('family.updateSettings', repo, 'openid-a', { reminderHour: 13 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('提前提醒天数越界抛 INVALID_ARGUMENT', async () => {
    const repo = createFakeRepo({ families: [seededFamily()], members: [ownerMember()] });
    await expect(
      call('family.updateSettings', repo, 'openid-a', { defaultReminderLeadDays: 31 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('普通成员也可修改（家庭级设置对全员开放）', async () => {
    const repo = createFakeRepo({
      families: [seededFamily()],
      members: [{ ...ownerMember(), _id: 'm2', openid: 'openid-b', role: 'member' }],
    });
    const res = await call('family.updateSettings', repo, 'openid-b', { reminderHour: 7 });
    expect(res.settings.reminderHour).toBe(7);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api/test/family.test.js cloudfunctions/api/test/invite.test.js`
Expected: FAIL，报错 `Cannot find module '../lib/invite'`

- [ ] **Step 3: 实现邀请码工具**

创建 `cloudfunctions/api/lib/invite.js`：

```js
const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 去掉容易混淆的 0/O/1/I，减少口头转述时的输入错误
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

function isInviteCodeValid(family, now) {
  return Boolean(family && family.inviteCodeExpireAt && family.inviteCodeExpireAt > now);
}

module.exports = { INVITE_CODE_TTL_MS, generateInviteCode, isInviteCodeValid };
```

- [ ] **Step 4: 实现家庭 action**

创建 `cloudfunctions/api/actions/family.js`：

```js
const { appError, CODES } = require('../lib/errors');
const { requireMember, requireOwner } = require('../lib/auth');
const {
  INVITE_CODE_TTL_MS,
  generateInviteCode,
  isInviteCodeValid,
} = require('../lib/invite');

const DEFAULT_FAMILY_NAME = '我的家';
const ALLOWED_REMINDER_HOURS = [7, 8, 20];
const DEFAULT_SETTINGS = { reminderHour: 8, defaultReminderLeadDays: 1 };

function freshInvite(now) {
  return {
    inviteCode: generateInviteCode(),
    inviteCodeExpireAt: now + INVITE_CODE_TTL_MS,
  };
}

async function createOrGet({ openid, payload, repo }) {
  const existing = await repo.findMemberByOpenid(openid);
  if (existing && existing.active) {
    const family = await repo.getFamily(existing.familyId);
    const members = await repo.listMembers(existing.familyId);
    return { family, member: existing, members };
  }

  const now = Date.now();
  const family = await repo.createFamily({
    name: payload.name || DEFAULT_FAMILY_NAME,
    ownerOpenid: openid,
    ...freshInvite(now),
    settings: { ...DEFAULT_SETTINGS },
    createdAt: now,
  });
  const member = await repo.createMember({
    familyId: family._id,
    openid,
    nickname: payload.nickname || '我',
    avatarUrl: payload.avatarUrl || '',
    role: 'owner',
    subscribeQuota: 0,
    joinedAt: now,
    active: true,
  });
  return { family, member, members: [member] };
}

async function join({ openid, payload, repo }) {
  const code = String(payload.inviteCode || '').trim().toUpperCase();
  if (!code) {
    throw appError(CODES.INVALID_ARGUMENT, '请输入邀请码');
  }

  const existing = await repo.findMemberByOpenid(openid);
  if (existing && existing.active) {
    throw appError(CODES.CONFLICT, '你已经在一个家庭中了');
  }

  const family = await repo.findFamilyByInviteCode(code);
  if (!family) {
    throw appError(CODES.NOT_FOUND, '邀请码不存在或已被重新生成');
  }
  if (!isInviteCodeValid(family, Date.now())) {
    throw appError(CODES.INVALID_ARGUMENT, '邀请码已过期，请让家人重新生成');
  }

  const now = Date.now();
  const member = existing
    ? await repo.updateMember(existing._id, {
        familyId: family._id,
        role: 'member',
        active: true,
        joinedAt: now,
      })
    : await repo.createMember({
        familyId: family._id,
        openid,
        nickname: payload.nickname || '家人',
        avatarUrl: payload.avatarUrl || '',
        role: 'member',
        subscribeQuota: 0,
        joinedAt: now,
        active: true,
      });
  return { family, member };
}

async function refreshInviteCode({ openid, repo }) {
  const member = await requireOwner(repo, openid);
  const invite = freshInvite(Date.now());
  await repo.updateFamily(member.familyId, invite);
  return invite;
}

async function listMembers({ openid, repo }) {
  const member = await requireMember(repo, openid);
  const members = await repo.listMembers(member.familyId);
  return { members };
}

async function updateSettings({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  const settings = { ...DEFAULT_SETTINGS, ...(family.settings || {}) };

  if (payload.reminderHour !== undefined) {
    if (!ALLOWED_REMINDER_HOURS.includes(payload.reminderHour)) {
      throw appError(CODES.INVALID_ARGUMENT, '提醒时段只能选择 7 点、8 点或 20 点');
    }
    settings.reminderHour = payload.reminderHour;
  }
  if (payload.defaultReminderLeadDays !== undefined) {
    const days = payload.defaultReminderLeadDays;
    if (!Number.isInteger(days) || days < 0 || days > 30) {
      throw appError(CODES.INVALID_ARGUMENT, '提前提醒天数需为 0 到 30 之间的整数');
    }
    settings.defaultReminderLeadDays = days;
  }

  await repo.updateFamily(member.familyId, { settings });
  return { settings };
}

module.exports = {
  'family.createOrGet': createOrGet,
  'family.join': join,
  'family.refreshInviteCode': refreshInviteCode,
  'family.listMembers': listMembers,
  'family.updateSettings': updateSettings,
  DEFAULT_SETTINGS,
  ALLOWED_REMINDER_HOURS,
};
```

注册到 `cloudfunctions/api/actions/index.js`，替换全文：

```js
// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 42 passed`

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 实现家庭创建、邀请码加入、成员列表与家庭设置 action"
```

---

### Task 8: 家务相关 action

**Files:**
- Create: `cloudfunctions/api/actions/chore.js`
- Create: `cloudfunctions/api/lib/chore-input.js`
- Modify: `cloudfunctions/api/actions/index.js`
- Test: `cloudfunctions/api/test/chore.test.js`

**Interfaces:**
- Consumes: `lib/schedule.js`（同步生成）的 `resolveBaseKey`/`computeNextDueAt`、`lib/urgency.js` 的 `sortChores`、`lib/date.js` 的 `todayKey`
- Produces:
  - `lib/chore-input.js`：`normalizeChoreInput(raw: object, defaults: { defaultReminderLeadDays: number }): object` — 校验并归一化用户输入，非法时抛 `INVALID_ARGUMENT`；返回字段为 `{ name, icon, room, scheduleType, intervalDays, fixedRule, estimatedMinutes, notes, reminderLeadDays, initialLastDoneKey }`
  - `actions/chore.js` 注册键：
    - `chore.list` — payload `{ archived?: boolean, room?: string }`，返回 `{ chores, todayKey }`，`chores` 已排序且带 `urgency`
    - `chore.get` — payload `{ choreId }`，返回 `{ chore, urgency }`
    - `chore.create` — payload 为 `normalizeChoreInput` 接受的结构，返回 `{ chore }`
    - `chore.batchCreate` — payload `{ items: object[] }`，返回 `{ chores }`
    - `chore.update` — payload `{ choreId, ...patch }`，返回 `{ chore }`
    - `chore.setArchived` — payload `{ choreId, archived: boolean }`，返回 `{ chore }`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/api/test/chore.test.js`：

```js
const actions = require('../actions');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');
const { todayKey, addDays } = require('../lib/date');

const call = (name, repo, openid, payload = {}) =>
  actions[name]({ openid, payload, repo });

const FAMILY = {
  _id: 'f1',
  name: '我的家',
  ownerOpenid: 'openid-a',
  inviteCode: 'ABC123',
  inviteCodeExpireAt: Date.now() + 86400000,
  settings: { reminderHour: 8, defaultReminderLeadDays: 1 },
  createdAt: Date.now(),
};

const MEMBER = {
  _id: 'm1',
  familyId: 'f1',
  openid: 'openid-a',
  nickname: '我',
  avatarUrl: '',
  role: 'owner',
  subscribeQuota: 0,
  joinedAt: Date.now(),
  active: true,
};

const baseRepo = (extra = {}) =>
  createFakeRepo({ families: [FAMILY], members: [MEMBER], ...extra });

const choreDoc = (overrides = {}) => ({
  _id: 'c1',
  familyId: 'f1',
  name: '刷马桶',
  icon: '🚽',
  room: '卫生间',
  scheduleType: 'floating',
  intervalDays: 7,
  fixedRule: null,
  estimatedMinutes: 10,
  notes: '',
  reminderLeadDays: 1,
  lastDoneAt: null,
  lastDoneBy: null,
  nextDueAt: '2026-09-20',
  archived: false,
  createdAt: Date.now(),
  createdBy: 'openid-a',
  ...overrides,
});

describe('chore.create', () => {
  test('创建浮动周期家务并算出到期日', async () => {
    const repo = baseRepo();
    const res = await call('chore.create', repo, 'openid-a', {
      name: '洗衣机自清洁',
      icon: '🧺',
      room: '阳台',
      scheduleType: 'floating',
      intervalDays: 30,
      estimatedMinutes: 90,
      notes: '筒自洁模式，投 1 包清洁剂',
      initialLastDoneKey: '2026-09-01',
    });
    expect(res.chore.name).toBe('洗衣机自清洁');
    expect(res.chore.nextDueAt).toBe('2026-10-01');
    expect(res.chore.familyId).toBe('f1');
    expect(res.chore.createdBy).toBe('openid-a');
    expect(res.chore.archived).toBe(false);
    expect(res.chore.lastDoneAt).toBeNull();
  });

  test('创建固定日历家务', async () => {
    const repo = baseRepo();
    const res = await call('chore.create', repo, 'openid-a', {
      name: '换床单',
      scheduleType: 'fixed',
      fixedRule: { type: 'weekly', weekdays: [0] },
      initialLastDoneKey: '2026-09-13',
    });
    expect(res.chore.nextDueAt).toBe('2026-09-20');
    expect(res.chore.intervalDays).toBeNull();
  });

  test('未填上次完成日时以创建当天为基准', async () => {
    const repo = baseRepo();
    const res = await call('chore.create', repo, 'openid-a', {
      name: '浇花',
      scheduleType: 'floating',
      intervalDays: 3,
    });
    expect(res.chore.nextDueAt).toBe(addDays(todayKey(), 3));
  });

  test('未指定提前提醒天数时取家庭默认值', async () => {
    const repo = baseRepo();
    const res = await call('chore.create', repo, 'openid-a', {
      name: '浇花',
      scheduleType: 'floating',
      intervalDays: 3,
    });
    expect(res.chore.reminderLeadDays).toBe(1);
  });

  test('缺少名称抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.create', repo, 'openid-a', { scheduleType: 'floating', intervalDays: 3 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('非法周期类型抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.create', repo, 'openid-a', { name: 'x', scheduleType: 'daily' })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('上次完成日格式非法抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.create', repo, 'openid-a', {
        name: 'x',
        scheduleType: 'floating',
        intervalDays: 3,
        initialLastDoneKey: '2026/09/01',
      })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('非成员抛 FORBIDDEN', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.create', repo, 'openid-x', {
        name: 'x',
        scheduleType: 'floating',
        intervalDays: 3,
      })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});

describe('chore.batchCreate', () => {
  test('一次创建多条并各自算出到期日', async () => {
    const repo = baseRepo();
    const res = await call('chore.batchCreate', repo, 'openid-a', {
      items: [
        { name: '刷马桶', scheduleType: 'floating', intervalDays: 7, initialLastDoneKey: '2026-09-10' },
        { name: '擦玻璃', scheduleType: 'floating', intervalDays: 90, initialLastDoneKey: '2026-09-01' },
      ],
    });
    expect(res.chores).toHaveLength(2);
    expect(res.chores[0].nextDueAt).toBe('2026-09-17');
    expect(res.chores[1].nextDueAt).toBe('2026-11-30');
  });

  test('items 为空数组抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.batchCreate', repo, 'openid-a', { items: [] })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('任一条非法则整批失败，不留下部分数据', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.batchCreate', repo, 'openid-a', {
        items: [
          { name: '合法', scheduleType: 'floating', intervalDays: 7 },
          { name: '', scheduleType: 'floating', intervalDays: 7 },
        ],
      })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
    expect(repo._state.chores).toHaveLength(0);
  });

  test('超过 50 条抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    const items = Array.from({ length: 51 }, (_, i) => ({
      name: `家务${i}`,
      scheduleType: 'floating',
      intervalDays: 7,
    }));
    await expect(
      call('chore.batchCreate', repo, 'openid-a', { items })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });
});

describe('chore.list', () => {
  test('返回本家庭未归档家务，按紧急度排序并带 urgency', async () => {
    const repo = baseRepo({
      chores: [
        choreDoc({ _id: 'c1', name: '正常', nextDueAt: '2099-01-01' }),
        choreDoc({ _id: 'c2', name: '逾期', nextDueAt: '2000-01-01' }),
      ],
    });
    const res = await call('chore.list', repo, 'openid-a');
    expect(res.chores.map((c) => c._id)).toEqual(['c2', 'c1']);
    expect(res.chores[0].urgency.level).toBe('overdue');
    expect(res.todayKey).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  test('默认不含归档项', async () => {
    const repo = baseRepo({
      chores: [choreDoc({ _id: 'c1' }), choreDoc({ _id: 'c2', archived: true })],
    });
    const res = await call('chore.list', repo, 'openid-a');
    expect(res.chores.map((c) => c._id)).toEqual(['c1']);
  });

  test('archived 为 true 时只返回归档项', async () => {
    const repo = baseRepo({
      chores: [choreDoc({ _id: 'c1' }), choreDoc({ _id: 'c2', archived: true })],
    });
    const res = await call('chore.list', repo, 'openid-a', { archived: true });
    expect(res.chores.map((c) => c._id)).toEqual(['c2']);
  });

  test('可按房间筛选', async () => {
    const repo = baseRepo({
      chores: [
        choreDoc({ _id: 'c1', room: '卫生间' }),
        choreDoc({ _id: 'c2', room: '厨房' }),
      ],
    });
    const res = await call('chore.list', repo, 'openid-a', { room: '厨房' });
    expect(res.chores.map((c) => c._id)).toEqual(['c2']);
  });

  test('不返回其他家庭的家务', async () => {
    const repo = baseRepo({
      chores: [choreDoc({ _id: 'c1' }), choreDoc({ _id: 'c9', familyId: 'f2' })],
    });
    const res = await call('chore.list', repo, 'openid-a');
    expect(res.chores.map((c) => c._id)).toEqual(['c1']);
  });
});

describe('chore.get', () => {
  test('返回详情与紧急度', async () => {
    const repo = baseRepo({ chores: [choreDoc({ nextDueAt: '2000-01-01' })] });
    const res = await call('chore.get', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore._id).toBe('c1');
    expect(res.urgency.level).toBe('overdue');
  });

  test('不存在抛 NOT_FOUND', async () => {
    const repo = baseRepo();
    await expect(
      call('chore.get', repo, 'openid-a', { choreId: 'nope' })
    ).rejects.toMatchObject({ code: CODES.NOT_FOUND });
  });

  test('跨家庭访问抛 FORBIDDEN', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('chore.get', repo, 'openid-a', { choreId: 'c9' })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});

describe('chore.update', () => {
  test('改名不动到期日', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('chore.update', repo, 'openid-a', {
      choreId: 'c1',
      name: '刷马桶（含地面）',
    });
    expect(res.chore.name).toBe('刷马桶（含地面）');
    expect(res.chore.nextDueAt).toBe('2026-09-20');
  });

  test('改周期天数会重算到期日', async () => {
    const repo = baseRepo({
      chores: [choreDoc({ lastDoneAt: Date.UTC(2026, 8, 13, 4, 0), intervalDays: 7 })],
    });
    const res = await call('chore.update', repo, 'openid-a', {
      choreId: 'c1',
      intervalDays: 14,
    });
    expect(res.chore.nextDueAt).toBe('2026-09-27');
  });

  test('切换周期类型会重算到期日', async () => {
    const repo = baseRepo({
      chores: [choreDoc({ lastDoneAt: Date.UTC(2026, 8, 13, 4, 0) })],
    });
    const res = await call('chore.update', repo, 'openid-a', {
      choreId: 'c1',
      scheduleType: 'fixed',
      fixedRule: { type: 'weekly', weekdays: [0] },
    });
    expect(res.chore.nextDueAt).toBe('2026-09-20');
    expect(res.chore.intervalDays).toBeNull();
  });

  test('跨家庭修改抛 FORBIDDEN', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('chore.update', repo, 'openid-a', { choreId: 'c9', name: 'x' })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});

describe('chore.setArchived', () => {
  test('归档', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('chore.setArchived', repo, 'openid-a', {
      choreId: 'c1',
      archived: true,
    });
    expect(res.chore.archived).toBe(true);
  });

  test('取消归档', async () => {
    const repo = baseRepo({ chores: [choreDoc({ archived: true })] });
    const res = await call('chore.setArchived', repo, 'openid-a', {
      choreId: 'c1',
      archived: false,
    });
    expect(res.chore.archived).toBe(false);
  });

  test('archived 非布尔值抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await expect(
      call('chore.setArchived', repo, 'openid-a', { choreId: 'c1', archived: 'yes' })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api/test/chore.test.js`
Expected: FAIL，报错 `actions['chore.create'] is not a function`

- [ ] **Step 3: 实现输入归一化**

创建 `cloudfunctions/api/lib/chore-input.js`：

```js
const { appError, CODES } = require('./errors');
const { computeNextDueAt } = require('./schedule');

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

function requireText(value, field, maxLength) {
  const text = String(value === undefined || value === null ? '' : value).trim();
  if (!text) throw appError(CODES.INVALID_ARGUMENT, `${field}不能为空`);
  if (text.length > maxLength) {
    throw appError(CODES.INVALID_ARGUMENT, `${field}不能超过 ${maxLength} 个字`);
  }
  return text;
}

function optionalInt(value, field, min, max, fallback) {
  if (value === undefined || value === null || value === '') return fallback;
  if (!Number.isInteger(value) || value < min || value > max) {
    throw appError(CODES.INVALID_ARGUMENT, `${field}需为 ${min} 到 ${max} 之间的整数`);
  }
  return value;
}

// 归一化并校验家务输入。校验通过意味着 computeNextDueAt 一定不会抛错。
function normalizeChoreInput(raw, { defaultReminderLeadDays }) {
  const scheduleType = raw.scheduleType;
  if (scheduleType !== 'floating' && scheduleType !== 'fixed') {
    throw appError(CODES.INVALID_ARGUMENT, '周期类型只能是浮动周期或固定日历');
  }

  const normalized = {
    name: requireText(raw.name, '家务名称', 30),
    icon: String(raw.icon || '🧹').slice(0, 4),
    room: String(raw.room || '全屋').trim().slice(0, 12) || '全屋',
    scheduleType,
    intervalDays: null,
    fixedRule: null,
    estimatedMinutes: optionalInt(raw.estimatedMinutes, '预估耗时', 1, 600, 15),
    notes: String(raw.notes || '').slice(0, 500),
    reminderLeadDays: optionalInt(
      raw.reminderLeadDays,
      '提前提醒天数',
      0,
      30,
      defaultReminderLeadDays
    ),
    initialLastDoneKey: null,
  };

  if (scheduleType === 'floating') {
    const days = raw.intervalDays;
    if (!Number.isInteger(days) || days < 1 || days > 3650) {
      throw appError(CODES.INVALID_ARGUMENT, '周期天数需为 1 到 3650 之间的整数');
    }
    normalized.intervalDays = days;
  } else {
    normalized.fixedRule = raw.fixedRule || null;
  }

  if (raw.initialLastDoneKey) {
    const key = String(raw.initialLastDoneKey);
    if (!DATE_KEY_RE.test(key)) {
      throw appError(CODES.INVALID_ARGUMENT, '上次完成日格式应为 2026-09-17');
    }
    normalized.initialLastDoneKey = key;
  }

  // 用一次实际计算兜住 fixedRule 的所有细节校验，避免把规则校验写两遍
  try {
    computeNextDueAt(normalized, '2026-01-01');
  } catch (err) {
    throw appError(CODES.INVALID_ARGUMENT, `周期设置有误：${err.message}`);
  }

  return normalized;
}

module.exports = { normalizeChoreInput, DATE_KEY_RE };
```

- [ ] **Step 4: 实现家务 action**

创建 `cloudfunctions/api/actions/chore.js`：

```js
const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');
const { normalizeChoreInput } = require('../lib/chore-input');
const { resolveBaseKey, computeNextDueAt } = require('../lib/schedule');
const { classify, sortChores } = require('../lib/urgency');
const { todayKey } = require('../lib/date');

const MAX_BATCH_SIZE = 50;

async function loadOwnChore(repo, familyId, choreId) {
  const chore = await repo.getChore(choreId);
  if (!chore) throw appError(CODES.NOT_FOUND, '这件家务不存在或已被删除');
  if (chore.familyId !== familyId) {
    throw appError(CODES.FORBIDDEN, '无权操作其他家庭的家务');
  }
  return chore;
}

function buildChoreDoc(input, { familyId, openid, now }) {
  const baseKey = resolveBaseKey({
    lastDoneAt: null,
    initialLastDoneKey: input.initialLastDoneKey,
    createdAt: now,
  });
  const { initialLastDoneKey, ...fields } = input;
  return {
    ...fields,
    familyId,
    lastDoneAt: null,
    lastDoneBy: null,
    nextDueAt: computeNextDueAt(fields, baseKey),
    archived: false,
    createdAt: now,
    createdBy: openid,
  };
}

async function create({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  const input = normalizeChoreInput(payload, {
    defaultReminderLeadDays: family.settings.defaultReminderLeadDays,
  });
  const chore = await repo.createChore(
    buildChoreDoc(input, { familyId: member.familyId, openid, now: Date.now() })
  );
  return { chore };
}

async function batchCreate({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const items = Array.isArray(payload.items) ? payload.items : [];
  if (items.length === 0) {
    throw appError(CODES.INVALID_ARGUMENT, '请至少选择一件家务');
  }
  if (items.length > MAX_BATCH_SIZE) {
    throw appError(CODES.INVALID_ARGUMENT, `一次最多创建 ${MAX_BATCH_SIZE} 件家务`);
  }
  const family = await repo.getFamily(member.familyId);
  const now = Date.now();
  // 先全部校验再统一写入，避免部分成功留下脏数据
  const docs = items.map((item) =>
    buildChoreDoc(
      normalizeChoreInput(item, {
        defaultReminderLeadDays: family.settings.defaultReminderLeadDays,
      }),
      { familyId: member.familyId, openid, now }
    )
  );
  const chores = await repo.createChores(docs);
  return { chores };
}

async function list({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chores = await repo.listChores(member.familyId, {
    archived: Boolean(payload.archived),
    room: payload.room || null,
  });
  const today = todayKey();
  return { chores: sortChores(chores, today), todayKey: today };
}

async function get({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  return { chore, urgency: classify(chore.nextDueAt, todayKey()) };
}

async function update({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  const family = await repo.getFamily(member.familyId);

  const { choreId, ...patch } = payload;
  const merged = normalizeChoreInput(
    {
      name: chore.name,
      icon: chore.icon,
      room: chore.room,
      scheduleType: chore.scheduleType,
      intervalDays: chore.intervalDays,
      fixedRule: chore.fixedRule,
      estimatedMinutes: chore.estimatedMinutes,
      notes: chore.notes,
      reminderLeadDays: chore.reminderLeadDays,
      ...patch,
    },
    { defaultReminderLeadDays: family.settings.defaultReminderLeadDays }
  );

  const { initialLastDoneKey, ...fields } = merged;
  const baseKey = resolveBaseKey({
    lastDoneAt: chore.lastDoneAt,
    initialLastDoneKey: null,
    createdAt: chore.createdAt,
  });
  const updated = await repo.updateChore(chore._id, {
    ...fields,
    nextDueAt: computeNextDueAt(fields, baseKey),
  });
  return { chore: updated };
}

async function setArchived({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);
  if (typeof payload.archived !== 'boolean') {
    throw appError(CODES.INVALID_ARGUMENT, '归档状态必须是布尔值');
  }
  const updated = await repo.updateChore(chore._id, { archived: payload.archived });
  return { chore: updated };
}

module.exports = {
  'chore.create': create,
  'chore.batchCreate': batchCreate,
  'chore.list': list,
  'chore.get': get,
  'chore.update': update,
  'chore.setArchived': setArchived,
  loadOwnChore,
};
```

在 `cloudfunctions/api/actions/index.js` 中注册，替换全文：

```js
// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');
const chore = require('./chore');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],

  'chore.create': chore['chore.create'],
  'chore.batchCreate': chore['chore.batchCreate'],
  'chore.list': chore['chore.list'],
  'chore.get': chore['chore.get'],
  'chore.update': chore['chore.update'],
  'chore.setArchived': chore['chore.setArchived'],
};
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 69 passed`

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 实现家务增删改查、批量创建与输入校验 action"
```

---

### Task 9: 完成流水 action（完成、补录、撤销、跳过、历史）

这是第一期业务规则最密集的任务，三种写入操作对冗余字段的影响各不相同。

**Files:**
- Create: `cloudfunctions/api/actions/log.js`
- Modify: `cloudfunctions/api/actions/index.js`
- Test: `cloudfunctions/api/test/log.test.js`

**Interfaces:**
- Consumes: `actions/chore.js` 的 `loadOwnChore`、`lib/schedule.js` 的 `resolveBaseKey`/`computeNextDueAt`、`lib/date.js` 的 `toLocalDateKey`/`addDays`/`todayKey`、`lib/chore-input.js` 的 `DATE_KEY_RE`
- Produces: `actions/log.js` 注册键
  - `log.complete` — payload `{ choreId, doneAt?: number, note?: string }`，`doneAt` 缺省为当前，不得晚于当前；返回 `{ chore, log }`
  - `log.undo` — payload `{ choreId }`，撤销最近一条 `done` 流水；返回 `{ chore }`
  - `log.skip` — payload `{ choreId }`，不更新 `lastDoneAt`；返回 `{ chore, log }`
  - `log.list` — payload `{ choreId, limit?: number, skip?: number }`，默认 `limit` 20、上限 100；返回 `{ logs }`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/api/test/log.test.js`：

```js
const actions = require('../actions');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');
const { todayKey, addDays } = require('../lib/date');

const call = (name, repo, openid, payload = {}) =>
  actions[name]({ openid, payload, repo });

const FAMILY = {
  _id: 'f1',
  name: '我的家',
  ownerOpenid: 'openid-a',
  inviteCode: 'ABC123',
  inviteCodeExpireAt: Date.now() + 86400000,
  settings: { reminderHour: 8, defaultReminderLeadDays: 1 },
  createdAt: Date.UTC(2026, 0, 1),
};

const MEMBERS = [
  {
    _id: 'm1',
    familyId: 'f1',
    openid: 'openid-a',
    nickname: '我',
    avatarUrl: '',
    role: 'owner',
    subscribeQuota: 0,
    joinedAt: Date.now(),
    active: true,
  },
  {
    _id: 'm2',
    familyId: 'f1',
    openid: 'openid-b',
    nickname: '家人',
    avatarUrl: '',
    role: 'member',
    subscribeQuota: 0,
    joinedAt: Date.now(),
    active: true,
  },
];

const choreDoc = (overrides = {}) => ({
  _id: 'c1',
  familyId: 'f1',
  name: '刷马桶',
  icon: '🚽',
  room: '卫生间',
  scheduleType: 'floating',
  intervalDays: 7,
  fixedRule: null,
  estimatedMinutes: 10,
  notes: '',
  reminderLeadDays: 1,
  lastDoneAt: null,
  lastDoneBy: null,
  nextDueAt: '2026-09-17',
  archived: false,
  createdAt: Date.UTC(2026, 0, 1),
  createdBy: 'openid-a',
  ...overrides,
});

const baseRepo = (extra = {}) =>
  createFakeRepo({ families: [FAMILY], members: MEMBERS, ...extra });

describe('log.complete', () => {
  test('写入流水、更新冗余字段并重算到期日', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const doneAt = Date.UTC(2026, 8, 17, 4, 0); // 北京 2026-09-17 12:00
    const res = await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt });

    expect(res.log.type).toBe('done');
    expect(res.log.doneAt).toBe(doneAt);
    expect(res.log.doneBy).toBe('openid-a');
    expect(res.log.familyId).toBe('f1');
    expect(res.chore.lastDoneAt).toBe(doneAt);
    expect(res.chore.lastDoneBy).toBe('openid-a');
    expect(res.chore.nextDueAt).toBe('2026-09-24');
  });

  test('不传 doneAt 时用当前时间，到期日基于今天', async () => {
    const repo = baseRepo({ chores: [choreDoc({ intervalDays: 30 })] });
    const res = await call('log.complete', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore.nextDueAt).toBe(addDays(todayKey(), 30));
  });

  test('记录完成人为实际调用者', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('log.complete', repo, 'openid-b', { choreId: 'c1' });
    expect(res.chore.lastDoneBy).toBe('openid-b');
  });

  test('补录过去日期，按该日期重算到期日', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const doneAt = Date.UTC(2026, 8, 10, 4, 0); // 北京 2026-09-10
    const res = await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt });
    expect(res.chore.nextDueAt).toBe('2026-09-17');
  });

  test('补录早于已有 lastDoneAt 的日期时，lastDoneAt 仍取最大值', async () => {
    const later = Date.UTC(2026, 8, 20, 4, 0);
    const repo = baseRepo({
      chores: [choreDoc({ lastDoneAt: later, lastDoneBy: 'openid-b' })],
      logs: [
        { _id: 'l1', familyId: 'f1', choreId: 'c1', type: 'done', doneAt: later, doneBy: 'openid-b', note: '', createdAt: later },
      ],
    });
    const earlier = Date.UTC(2026, 8, 10, 4, 0);
    const res = await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt: earlier });
    expect(res.chore.lastDoneAt).toBe(later);
    expect(res.chore.lastDoneBy).toBe('openid-b');
    expect(res.chore.nextDueAt).toBe('2026-09-27');
  });

  test('doneAt 晚于当前时间抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await expect(
      call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt: Date.now() + 86400000 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('固定日历家务完成后取下一个规则日', async () => {
    const repo = baseRepo({
      chores: [
        choreDoc({
          scheduleType: 'fixed',
          intervalDays: null,
          fixedRule: { type: 'weekly', weekdays: [0] },
        }),
      ],
    });
    const doneAt = Date.UTC(2026, 8, 17, 4, 0); // 北京 2026-09-17 周四
    const res = await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt });
    expect(res.chore.nextDueAt).toBe('2026-09-20');
  });

  test('备注写入流水', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('log.complete', repo, 'openid-a', {
      choreId: 'c1',
      note: '顺手换了刷头',
    });
    expect(res.log.note).toBe('顺手换了刷头');
  });

  test('跨家庭完成抛 FORBIDDEN', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('log.complete', repo, 'openid-a', { choreId: 'c9' })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});

describe('log.undo', () => {
  test('撤销唯一一次完成后回到从未完成状态', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const doneAt = Date.UTC(2026, 8, 17, 4, 0);
    await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt });
    const res = await call('log.undo', repo, 'openid-a', { choreId: 'c1' });

    expect(res.chore.lastDoneAt).toBeNull();
    expect(res.chore.lastDoneBy).toBeNull();
    // 基准回退到创建日 2026-01-01，加 7 天
    expect(res.chore.nextDueAt).toBe('2026-01-08');
    expect(repo._state.logs).toHaveLength(0);
  });

  test('撤销后回滚到上一条完成记录', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const first = Date.UTC(2026, 8, 3, 4, 0);  // 北京 09-03
    const second = Date.UTC(2026, 8, 17, 4, 0); // 北京 09-17
    await call('log.complete', repo, 'openid-b', { choreId: 'c1', doneAt: first });
    await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt: second });

    const res = await call('log.undo', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore.lastDoneAt).toBe(first);
    expect(res.chore.lastDoneBy).toBe('openid-b');
    expect(res.chore.nextDueAt).toBe('2026-09-10');
    expect(repo._state.logs).toHaveLength(1);
  });

  test('同家庭其他成员也可撤销', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await call('log.complete', repo, 'openid-a', { choreId: 'c1' });
    await expect(call('log.undo', repo, 'openid-b', { choreId: 'c1' })).resolves.toBeTruthy();
  });

  test('没有完成记录时抛 NOT_FOUND', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await expect(call('log.undo', repo, 'openid-a', { choreId: 'c1' })).rejects.toMatchObject({
      code: CODES.NOT_FOUND,
    });
  });

  test('只有跳过记录时抛 NOT_FOUND，不误删跳过流水', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await call('log.skip', repo, 'openid-a', { choreId: 'c1' });
    await expect(call('log.undo', repo, 'openid-a', { choreId: 'c1' })).rejects.toMatchObject({
      code: CODES.NOT_FOUND,
    });
    expect(repo._state.logs).toHaveLength(1);
  });
});

describe('log.skip', () => {
  test('浮动周期跳过后从今天起顺延一个周期', async () => {
    const repo = baseRepo({ chores: [choreDoc({ intervalDays: 30 })] });
    const res = await call('log.skip', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore.nextDueAt).toBe(addDays(todayKey(), 30));
  });

  test('跳过不更新 lastDoneAt', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('log.skip', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore.lastDoneAt).toBeNull();
    expect(res.chore.lastDoneBy).toBeNull();
  });

  test('写入 type 为 skip 的流水', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('log.skip', repo, 'openid-a', { choreId: 'c1' });
    expect(res.log.type).toBe('skip');
    expect(res.log.doneBy).toBe('openid-a');
  });

  test('固定日历跳过后取严格晚于原到期日的下一个规则日', async () => {
    const repo = baseRepo({
      chores: [
        choreDoc({
          scheduleType: 'fixed',
          intervalDays: null,
          fixedRule: { type: 'weekly', weekdays: [0] },
          nextDueAt: '2026-09-20',
        }),
      ],
    });
    const res = await call('log.skip', repo, 'openid-a', { choreId: 'c1' });
    expect(res.chore.nextDueAt).toBe('2026-09-27');
  });
});

describe('log.list', () => {
  const logsFor = (count) =>
    Array.from({ length: count }, (_, i) => ({
      _id: `l${i}`,
      familyId: 'f1',
      choreId: 'c1',
      type: 'done',
      doneAt: Date.UTC(2026, 0, i + 1),
      doneBy: 'openid-a',
      note: '',
      createdAt: Date.UTC(2026, 0, i + 1),
    }));

  test('按完成时间倒序返回', async () => {
    const repo = baseRepo({ chores: [choreDoc()], logs: logsFor(3) });
    const res = await call('log.list', repo, 'openid-a', { choreId: 'c1' });
    expect(res.logs.map((l) => l._id)).toEqual(['l2', 'l1', 'l0']);
  });

  test('默认返回 20 条', async () => {
    const repo = baseRepo({ chores: [choreDoc()], logs: logsFor(25) });
    const res = await call('log.list', repo, 'openid-a', { choreId: 'c1' });
    expect(res.logs).toHaveLength(20);
  });

  test('支持分页', async () => {
    const repo = baseRepo({ chores: [choreDoc()], logs: logsFor(25) });
    const res = await call('log.list', repo, 'openid-a', {
      choreId: 'c1',
      limit: 5,
      skip: 20,
    });
    expect(res.logs).toHaveLength(5);
  });

  test('limit 超过 100 抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    await expect(
      call('log.list', repo, 'openid-a', { choreId: 'c1', limit: 101 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('跨家庭查询抛 FORBIDDEN', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('log.list', repo, 'openid-a', { choreId: 'c9' })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api/test/log.test.js`
Expected: FAIL，报错 `actions['log.complete'] is not a function`

- [ ] **Step 3: 实现流水 action**

创建 `cloudfunctions/api/actions/log.js`：

```js
const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');
const { loadOwnChore } = require('./chore');
const { resolveBaseKey, computeNextDueAt } = require('../lib/schedule');
const { toLocalDateKey, todayKey } = require('../lib/date');

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

// 从流水重算冗余字段。lastDoneAt 取所有 done 流水中最大的 doneAt，
// 因此补录一个更早的日期不会把「上次完成」倒退。
function deriveFromLogs(chore, doneLogs) {
  const latest = doneLogs.length > 0 ? doneLogs[0] : null;
  const lastDoneAt = latest ? latest.doneAt : null;
  const lastDoneBy = latest ? latest.doneBy : null;
  const baseKey = resolveBaseKey({
    lastDoneAt,
    initialLastDoneKey: null,
    createdAt: chore.createdAt,
  });
  return { lastDoneAt, lastDoneBy, nextDueAt: computeNextDueAt(chore, baseKey) };
}

async function complete({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const now = Date.now();
  const doneAt = payload.doneAt === undefined ? now : payload.doneAt;
  if (!Number.isFinite(doneAt) || doneAt > now) {
    throw appError(CODES.INVALID_ARGUMENT, '完成时间不能晚于当前时间');
  }

  const log = await repo.createLog({
    familyId: member.familyId,
    choreId: chore._id,
    type: 'done',
    doneAt,
    doneBy: openid,
    note: String(payload.note || '').slice(0, 200),
    createdAt: now,
  });

  const doneLogs = await repo.listRecentDoneLogs(chore._id, 1);
  const updated = await repo.updateChore(chore._id, deriveFromLogs(chore, doneLogs));
  return { chore: updated, log };
}

async function undo({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  // 取两条：第一条待删除，第二条是回滚目标
  const doneLogs = await repo.listRecentDoneLogs(chore._id, 2);
  if (doneLogs.length === 0) {
    throw appError(CODES.NOT_FOUND, '这件家务还没有完成记录，无法撤销');
  }

  await repo.deleteLog(doneLogs[0]._id);
  const updated = await repo.updateChore(chore._id, deriveFromLogs(chore, doneLogs.slice(1)));
  return { chore: updated };
}

async function skip({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const now = Date.now();
  const log = await repo.createLog({
    familyId: member.familyId,
    choreId: chore._id,
    type: 'skip',
    doneAt: now,
    doneBy: openid,
    note: String(payload.note || '').slice(0, 200),
    createdAt: now,
  });

  // 浮动周期从今天重新起算；固定日历顺延到原到期日之后的下一个规则日。
  const baseKey = chore.scheduleType === 'floating' ? todayKey(now) : chore.nextDueAt;
  const updated = await repo.updateChore(chore._id, {
    nextDueAt: computeNextDueAt(chore, baseKey),
  });
  return { chore: updated, log };
}

async function list({ openid, payload, repo }) {
  const member = await requireMember(repo, openid);
  const chore = await loadOwnChore(repo, member.familyId, payload.choreId);

  const limit = payload.limit === undefined ? DEFAULT_LIMIT : payload.limit;
  if (!Number.isInteger(limit) || limit < 1 || limit > MAX_LIMIT) {
    throw appError(CODES.INVALID_ARGUMENT, `每页条数需为 1 到 ${MAX_LIMIT} 之间的整数`);
  }
  const skipCount = payload.skip === undefined ? 0 : payload.skip;
  if (!Number.isInteger(skipCount) || skipCount < 0) {
    throw appError(CODES.INVALID_ARGUMENT, '分页偏移必须是非负整数');
  }

  const logs = await repo.listLogs(chore._id, { limit, skip: skipCount });
  return { logs };
}

module.exports = {
  'log.complete': complete,
  'log.undo': undo,
  'log.skip': skip,
  'log.list': list,
};
```

在 `cloudfunctions/api/actions/index.js` 中追加注册，替换全文：

```js
// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');
const chore = require('./chore');
const log = require('./log');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],

  'chore.create': chore['chore.create'],
  'chore.batchCreate': chore['chore.batchCreate'],
  'chore.list': chore['chore.list'],
  'chore.get': chore['chore.get'],
  'chore.update': chore['chore.update'],
  'chore.setArchived': chore['chore.setArchived'],

  'log.complete': log['log.complete'],
  'log.undo': log['log.undo'],
  'log.skip': log['log.skip'],
  'log.list': log['log.list'],
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 92 passed`

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 实现完成打卡、补录、撤销、跳过与历史时间线 action"
```

---

### Task 10: 成员资料与订阅额度 action

**Files:**
- Create: `cloudfunctions/api/actions/member.js`
- Modify: `cloudfunctions/api/actions/index.js`
- Test: `cloudfunctions/api/test/member.test.js`

**Interfaces:**
- Consumes: `lib/auth.js` 的 `requireMember`
- Produces: `actions/member.js` 注册键
  - `member.updateProfile` — payload `{ nickname?: string, avatarUrl?: string }`，返回 `{ member }`
  - `member.addSubscribeQuota` — payload `{ count: number }`，1–20，累加后上限 200；返回 `{ subscribeQuota }`
  - `member.me` — 无 payload，返回 `{ member, family }`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/api/test/member.test.js`：

```js
const actions = require('../actions');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');

const call = (name, repo, openid, payload = {}) =>
  actions[name]({ openid, payload, repo });

const FAMILY = {
  _id: 'f1',
  name: '我的家',
  ownerOpenid: 'openid-a',
  inviteCode: 'ABC123',
  inviteCodeExpireAt: Date.now() + 86400000,
  settings: { reminderHour: 8, defaultReminderLeadDays: 1 },
  createdAt: Date.now(),
};

const member = (overrides = {}) => ({
  _id: 'm1',
  familyId: 'f1',
  openid: 'openid-a',
  nickname: '我',
  avatarUrl: '',
  role: 'owner',
  subscribeQuota: 0,
  joinedAt: Date.now(),
  active: true,
  ...overrides,
});

const baseRepo = (m = member()) => createFakeRepo({ families: [FAMILY], members: [m] });

describe('member.updateProfile', () => {
  test('更新昵称与头像', async () => {
    const repo = baseRepo();
    const res = await call('member.updateProfile', repo, 'openid-a', {
      nickname: '妈妈',
      avatarUrl: 'https://example.com/a.png',
    });
    expect(res.member.nickname).toBe('妈妈');
    expect(res.member.avatarUrl).toBe('https://example.com/a.png');
  });

  test('只传昵称时不清空头像', async () => {
    const repo = baseRepo(member({ avatarUrl: 'https://example.com/old.png' }));
    const res = await call('member.updateProfile', repo, 'openid-a', { nickname: '爸爸' });
    expect(res.member.avatarUrl).toBe('https://example.com/old.png');
  });

  test('昵称为空白抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('member.updateProfile', repo, 'openid-a', { nickname: '   ' })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('昵称超长抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('member.updateProfile', repo, 'openid-a', { nickname: 'x'.repeat(21) })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('非成员抛 FORBIDDEN', async () => {
    const repo = baseRepo();
    await expect(
      call('member.updateProfile', repo, 'openid-x', { nickname: '陌生人' })
    ).rejects.toMatchObject({ code: CODES.FORBIDDEN });
  });
});

describe('member.addSubscribeQuota', () => {
  test('累加额度', async () => {
    const repo = baseRepo(member({ subscribeQuota: 5 }));
    const res = await call('member.addSubscribeQuota', repo, 'openid-a', { count: 3 });
    expect(res.subscribeQuota).toBe(8);
  });

  test('累加后不超过 200 上限', async () => {
    const repo = baseRepo(member({ subscribeQuota: 195 }));
    const res = await call('member.addSubscribeQuota', repo, 'openid-a', { count: 20 });
    expect(res.subscribeQuota).toBe(200);
  });

  test('count 为 0 抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('member.addSubscribeQuota', repo, 'openid-a', { count: 0 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('count 超过 20 抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('member.addSubscribeQuota', repo, 'openid-a', { count: 21 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });

  test('count 非整数抛 INVALID_ARGUMENT', async () => {
    const repo = baseRepo();
    await expect(
      call('member.addSubscribeQuota', repo, 'openid-a', { count: 1.5 })
    ).rejects.toMatchObject({ code: CODES.INVALID_ARGUMENT });
  });
});

describe('member.me', () => {
  test('返回自己与所属家庭', async () => {
    const repo = baseRepo();
    const res = await call('member.me', repo, 'openid-a');
    expect(res.member._id).toBe('m1');
    expect(res.family._id).toBe('f1');
  });

  test('未加入家庭抛 FORBIDDEN', async () => {
    const repo = createFakeRepo({ families: [FAMILY] });
    await expect(call('member.me', repo, 'openid-x')).rejects.toMatchObject({
      code: CODES.FORBIDDEN,
    });
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api/test/member.test.js`
Expected: FAIL，报错 `actions['member.updateProfile'] is not a function`

- [ ] **Step 3: 实现成员 action**

创建 `cloudfunctions/api/actions/member.js`：

```js
const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');

const MAX_QUOTA = 200;
const MAX_QUOTA_INCREMENT = 20;

async function updateProfile({ openid, payload, repo }) {
  const me = await requireMember(repo, openid);
  const patch = {};

  if (payload.nickname !== undefined) {
    const nickname = String(payload.nickname).trim();
    if (!nickname) throw appError(CODES.INVALID_ARGUMENT, '昵称不能为空');
    if (nickname.length > 20) throw appError(CODES.INVALID_ARGUMENT, '昵称不能超过 20 个字');
    patch.nickname = nickname;
  }
  if (payload.avatarUrl !== undefined) {
    patch.avatarUrl = String(payload.avatarUrl).slice(0, 500);
  }

  const updated = Object.keys(patch).length > 0
    ? await repo.updateMember(me._id, patch)
    : me;
  return { member: updated };
}

// 用户每次点击订阅授权后由小程序端上报累加。
// 上限用于防止异常上报把额度刷到不合理的数值。
async function addSubscribeQuota({ openid, payload, repo }) {
  const me = await requireMember(repo, openid);
  const count = payload.count;
  if (!Number.isInteger(count) || count < 1 || count > MAX_QUOTA_INCREMENT) {
    throw appError(
      CODES.INVALID_ARGUMENT,
      `单次上报额度需为 1 到 ${MAX_QUOTA_INCREMENT} 之间的整数`
    );
  }
  const subscribeQuota = Math.min(MAX_QUOTA, (me.subscribeQuota || 0) + count);
  await repo.updateMember(me._id, { subscribeQuota });
  return { subscribeQuota };
}

async function me({ openid, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  return { member, family };
}

module.exports = {
  'member.updateProfile': updateProfile,
  'member.addSubscribeQuota': addSubscribeQuota,
  'member.me': me,
  MAX_QUOTA,
};
```

在 `cloudfunctions/api/actions/index.js` 中追加注册，替换全文：

```js
// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');
const chore = require('./chore');
const log = require('./log');
const member = require('./member');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],

  'chore.create': chore['chore.create'],
  'chore.batchCreate': chore['chore.batchCreate'],
  'chore.list': chore['chore.list'],
  'chore.get': chore['chore.get'],
  'chore.update': chore['chore.update'],
  'chore.setArchived': chore['chore.setArchived'],

  'log.complete': log['log.complete'],
  'log.undo': log['log.undo'],
  'log.skip': log['log.skip'],
  'log.list': log['log.list'],

  'member.updateProfile': member['member.updateProfile'],
  'member.addSubscribeQuota': member['member.addSubscribeQuota'],
  'member.me': member['member.me'],
};
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 104 passed`

- [ ] **Step 5: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 实现成员资料更新、订阅额度上报与个人信息 action"
```

---

### Task 11: repository 的云数据库实现与云函数入口接线

本任务把前面全部用假 repo 测过的 action 接到真实云数据库上。repo 的每个方法签名必须与 `test/fake-repo.js` 严格一致，否则单元测试的保障会失效。

**Files:**
- Create: `cloudfunctions/api/lib/repo.js`
- Create: `cloudfunctions/api/index.js`
- Test: `cloudfunctions/api/test/repo-contract.test.js`

**Interfaces:**
- Consumes: `test/fake-repo.js` 的 `createFakeRepo`（仅用于契约对比）
- Produces:
  - `lib/repo.js`：`COLLECTIONS: { FAMILIES: 'families', MEMBERS: 'members', CHORES: 'chores', LOGS: 'chore_logs', REMINDER_SENDS: 'reminder_sends' }`、`createRepo(db, command): repo`
  - `index.js`：`exports.main`，用 `wx-server-sdk` 装配 `createRouter`

- [ ] **Step 1: 写失败的契约测试**

契约测试确保真实实现与假实现的方法集合完全一致。方法集合一旦漂移，action 的单元测试就会失去意义。

创建 `cloudfunctions/api/test/repo-contract.test.js`：

```js
const { createRepo, COLLECTIONS } = require('../lib/repo');
const { createFakeRepo } = require('./fake-repo');

// 极简 db 桩，只需让 createRepo 能构造出对象，不执行任何查询
const stubDb = {
  collection: () => ({
    doc: () => ({ get: async () => ({}), update: async () => ({}) }),
    where: () => ({
      orderBy: () => ({ skip: () => ({ limit: () => ({ get: async () => ({ data: [] }) }) }) }),
      limit: () => ({ get: async () => ({ data: [] }) }),
      count: async () => ({ total: 0 }),
      get: async () => ({ data: [] }),
    }),
    add: async () => ({ _id: 'x' }),
  }),
};
const stubCommand = { lte: (v) => v, and: (...v) => v };

describe('集合名', () => {
  test('与设计文档一致', () => {
    expect(COLLECTIONS).toEqual({
      FAMILIES: 'families',
      MEMBERS: 'members',
      CHORES: 'chores',
      LOGS: 'chore_logs',
      REMINDER_SENDS: 'reminder_sends',
    });
  });
});

describe('repo 契约', () => {
  const methodNames = (repo) =>
    Object.keys(repo)
      .filter((k) => !k.startsWith('_') && typeof repo[k] === 'function')
      .sort();

  test('真实实现与假实现的方法集合完全一致', () => {
    expect(methodNames(createRepo(stubDb, stubCommand))).toEqual(
      methodNames(createFakeRepo())
    );
  });

  test('假实现暴露 _state 供测试断言，真实实现不暴露', () => {
    expect(createFakeRepo()._state).toBeDefined();
    expect(createRepo(stubDb, stubCommand)._state).toBeUndefined();
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest cloudfunctions/api/test/repo-contract.test.js`
Expected: FAIL，报错 `Cannot find module '../lib/repo'`

- [ ] **Step 3: 实现云数据库 repo**

创建 `cloudfunctions/api/lib/repo.js`：

```js
// repository 层。所有云数据库访问都收敛在这里，
// action 只依赖下面这组方法签名，因此可以用内存假实现做单元测试。
// 修改任何方法签名时必须同步修改 test/fake-repo.js，否则 repo-contract 测试会失败。

const COLLECTIONS = {
  FAMILIES: 'families',
  MEMBERS: 'members',
  CHORES: 'chores',
  LOGS: 'chore_logs',
  REMINDER_SENDS: 'reminder_sends',
};

function createRepo(db, command) {
  const col = (name) => db.collection(name);

  const firstOrNull = (res) => (res.data && res.data.length > 0 ? res.data[0] : null);

  return {
    // families
    async createFamily(doc) {
      const { _id } = await col(COLLECTIONS.FAMILIES).add({ data: doc });
      return { _id, ...doc };
    },
    async getFamily(id) {
      const res = await col(COLLECTIONS.FAMILIES).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async updateFamily(id, patch) {
      await col(COLLECTIONS.FAMILIES).doc(id).update({ data: patch });
      return this.getFamily(id);
    },
    async findFamilyByInviteCode(code) {
      const res = await col(COLLECTIONS.FAMILIES).where({ inviteCode: code }).limit(1).get();
      return firstOrNull(res);
    },
    async listFamiliesByReminderHour(hour) {
      const res = await col(COLLECTIONS.FAMILIES)
        .where({ 'settings.reminderHour': hour })
        .limit(1000)
        .get();
      return res.data;
    },

    // members
    async createMember(doc) {
      const { _id } = await col(COLLECTIONS.MEMBERS).add({ data: doc });
      return { _id, ...doc };
    },
    async findMemberByOpenid(openid) {
      const res = await col(COLLECTIONS.MEMBERS).where({ openid }).limit(1).get();
      return firstOrNull(res);
    },
    async listMembers(familyId) {
      const res = await col(COLLECTIONS.MEMBERS)
        .where({ familyId, active: true })
        .limit(50)
        .get();
      return res.data;
    },
    async updateMember(id, patch) {
      await col(COLLECTIONS.MEMBERS).doc(id).update({ data: patch });
      const res = await col(COLLECTIONS.MEMBERS).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },

    // chores
    async createChore(doc) {
      const { _id } = await col(COLLECTIONS.CHORES).add({ data: doc });
      return { _id, ...doc };
    },
    async createChores(docs) {
      const results = [];
      for (const doc of docs) {
        results.push(await this.createChore(doc));
      }
      return results;
    },
    async getChore(id) {
      const res = await col(COLLECTIONS.CHORES).where({ _id: id }).limit(1).get();
      return firstOrNull(res);
    },
    async listChores(familyId, { archived = false, room = null } = {}) {
      const where = { familyId, archived };
      if (room) where.room = room;
      const res = await col(COLLECTIONS.CHORES).where(where).limit(500).get();
      return res.data;
    },
    async updateChore(id, patch) {
      await col(COLLECTIONS.CHORES).doc(id).update({ data: patch });
      return this.getChore(id);
    },
    async listDueChores(familyId, maxDueKey) {
      const res = await col(COLLECTIONS.CHORES)
        .where({ familyId, archived: false, nextDueAt: command.lte(maxDueKey) })
        .limit(500)
        .get();
      return res.data;
    },

    // chore_logs
    async createLog(doc) {
      const { _id } = await col(COLLECTIONS.LOGS).add({ data: doc });
      return { _id, ...doc };
    },
    async listLogs(choreId, { limit = 20, skip = 0 } = {}) {
      const res = await col(COLLECTIONS.LOGS)
        .where({ choreId })
        .orderBy('doneAt', 'desc')
        .skip(skip)
        .limit(limit)
        .get();
      return res.data;
    },
    async listRecentDoneLogs(choreId, limit) {
      const res = await col(COLLECTIONS.LOGS)
        .where({ choreId, type: 'done' })
        .orderBy('doneAt', 'desc')
        .skip(0)
        .limit(limit)
        .get();
      return res.data;
    },
    async deleteLog(id) {
      await col(COLLECTIONS.LOGS).doc(id).remove();
      return true;
    },

    // reminder_sends
    async hasSentReminder(openid, dateKey) {
      const res = await col(COLLECTIONS.REMINDER_SENDS)
        .where({ openid, dateKey })
        .limit(1)
        .get();
      return res.data.length > 0;
    },
    async recordReminderSent(doc) {
      const { _id } = await col(COLLECTIONS.REMINDER_SENDS).add({ data: doc });
      return { _id, ...doc };
    },
  };
}

module.exports = { COLLECTIONS, createRepo };
```

`stubDb` 的 `collection()` 未提供 `remove`，而 `deleteLog` 会用到。契约测试只比较方法集合、不调用方法，因此不受影响。

创建 `cloudfunctions/api/index.js`：

```js
const cloud = require('wx-server-sdk');
const { createRouter } = require('./lib/router');
const { createRepo } = require('./lib/repo');
const actions = require('./actions');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const repo = createRepo(db, db.command);

const handle = createRouter({
  actions,
  // OPENID 由微信侧注入，客户端无法伪造，是整套鉴权的信任根。
  getOpenid: () => cloud.getWXContext().OPENID,
  getRepo: () => repo,
  logger: console,
});

exports.main = (event) => handle(event);
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest cloudfunctions/api`
Expected: PASS，`Tests: 107 passed`

- [ ] **Step 5: 全量回归**

Run: `npm test`
Expected: PASS，所有测试套件通过

- [ ] **Step 6: 提交**

```bash
git add cloudfunctions/api
git commit -m "feat: 实现云数据库 repository 与 api 云函数入口"
```

---

### Task 12: 家务模板库

**Files:**
- Create: `miniprogram/data/chore-templates.js`
- Test: `miniprogram/data/chore-templates.test.js`

**Interfaces:**
- Consumes: `cloudfunctions/api/lib/chore-input.js` 的 `normalizeChoreInput`（测试中用于验证每条模板都能通过后端校验）
- Produces: `miniprogram/data/chore-templates.js` 导出
  - `ROOMS: string[]` — `['厨房', '卫生间', '卧室', '客厅', '阳台', '全屋']`
  - `CHORE_TEMPLATES: object[]` — 每项含 `id`、`name`、`icon`、`room`、`scheduleType`、`intervalDays` 或 `fixedRule`、`estimatedMinutes`、`notes`
  - `templatesByRoom(): { [room: string]: object[] }`

- [ ] **Step 1: 写失败的测试**

创建 `miniprogram/data/chore-templates.test.js`：

```js
const { ROOMS, CHORE_TEMPLATES, templatesByRoom } = require('./chore-templates');
const { normalizeChoreInput } = require('../../cloudfunctions/api/lib/chore-input');

// 用户在需求中明确点名的家务，必须全部覆盖
const REQUIRED_NAMES = [
  '洗衣机自清洁',
  '刷马桶',
  '换床单',
  '洗油烟机',
  '清洗扫地机器人',
  '浇花',
  '擦玻璃',
];

describe('ROOMS', () => {
  test('六个分区', () => {
    expect(ROOMS).toEqual(['厨房', '卫生间', '卧室', '客厅', '阳台', '全屋']);
  });
});

describe('CHORE_TEMPLATES', () => {
  test('至少 30 条', () => {
    expect(CHORE_TEMPLATES.length).toBeGreaterThanOrEqual(30);
  });

  test('覆盖用户明确点名的所有家务', () => {
    const names = CHORE_TEMPLATES.map((t) => t.name);
    REQUIRED_NAMES.forEach((name) => expect(names).toContain(name));
  });

  test('id 唯一', () => {
    const ids = CHORE_TEMPLATES.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  test('名称唯一', () => {
    const names = CHORE_TEMPLATES.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('每条的 room 都在 ROOMS 之内', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(ROOMS).toContain(t.room);
    });
  });

  test('每条都有非空图标与预估耗时', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(t.icon).toBeTruthy();
      expect(Number.isInteger(t.estimatedMinutes)).toBe(true);
      expect(t.estimatedMinutes).toBeGreaterThan(0);
    });
  });

  test('每条都能通过后端输入校验', () => {
    CHORE_TEMPLATES.forEach((t) => {
      expect(() =>
        normalizeChoreInput(t, { defaultReminderLeadDays: 1 })
      ).not.toThrow();
    });
  });

  test('六个分区各至少有一条模板', () => {
    const grouped = templatesByRoom();
    ROOMS.forEach((room) => {
      expect(grouped[room].length).toBeGreaterThan(0);
    });
  });

  test('至少有一条固定日历模板，验证两种周期都被覆盖', () => {
    expect(CHORE_TEMPLATES.some((t) => t.scheduleType === 'fixed')).toBe(true);
    expect(CHORE_TEMPLATES.some((t) => t.scheduleType === 'floating')).toBe(true);
  });
});

describe('templatesByRoom', () => {
  test('分组后总数不变', () => {
    const grouped = templatesByRoom();
    const total = Object.values(grouped).reduce((sum, list) => sum + list.length, 0);
    expect(total).toBe(CHORE_TEMPLATES.length);
  });

  test('键顺序与 ROOMS 一致', () => {
    expect(Object.keys(templatesByRoom())).toEqual(ROOMS);
  });
});
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest miniprogram/data/chore-templates.test.js`
Expected: FAIL，报错 `Cannot find module './chore-templates'`

- [ ] **Step 3: 实现模板库**

创建 `miniprogram/data/chore-templates.js`：

```js
// 内置家务模板库。前端本地静态数据，不占数据库、不需联网。
// 周期为推荐值，用户导入后可自行调整。
const ROOMS = ['厨房', '卫生间', '卧室', '客厅', '阳台', '全屋'];

const CHORE_TEMPLATES = [
  // 厨房
  { id: 'kitchen-hood', name: '洗油烟机', icon: '🔥', room: '厨房', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 60, notes: '先拆滤网泡热水加洗涤剂，扇叶用专用清洁剂喷后静置 10 分钟' },
  { id: 'kitchen-sink-drain', name: '疏通厨房下水道', icon: '🚰', room: '厨房', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 20, notes: '倒管道疏通剂后静置 30 分钟再冲热水' },
  { id: 'kitchen-fridge', name: '清理冰箱', icon: '🧊', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 40, notes: '清过期食品，隔板取出用小苏打水擦' },
  { id: 'kitchen-microwave', name: '清洁微波炉', icon: '📻', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '一碗水加柠檬片高火 3 分钟，蒸汽软化油污后擦拭' },
  { id: 'kitchen-dishwasher', name: '洗碗机自清洁', icon: '🍽️', room: '厨房', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 10, notes: '清滤网残渣，放专用清洁剂跑一次空载高温程序' },
  { id: 'kitchen-cabinet', name: '整理橱柜与调料', icon: '🧂', room: '厨房', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 45, notes: '查看调料保质期，擦拭柜内层板' },
  { id: 'kitchen-trash', name: '刷洗垃圾桶', icon: '🗑️', room: '厨房', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '' },
  { id: 'kitchen-kettle', name: '除水垢（热水壶）', icon: '🫖', room: '厨房', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 20, notes: '白醋加水煮开静置 1 小时后冲洗' },

  // 卫生间
  { id: 'bath-toilet', name: '刷马桶', icon: '🚽', room: '卫生间', scheduleType: 'floating', intervalDays: 7, estimatedMinutes: 10, notes: '洁厕剂沿内壁一圈，静置 5 分钟再刷' },
  { id: 'bath-floor-drain', name: '清理地漏', icon: '🕳️', room: '卫生间', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 10, notes: '取出内芯清头发，回装前检查密封' },
  { id: 'bath-shower-head', name: '除垢花洒', icon: '🚿', room: '卫生间', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 30, notes: '拆下泡白醋 1 小时，用牙刷刷出水孔' },
  { id: 'bath-mirror', name: '擦浴室镜与玻璃隔断', icon: '🪞', room: '卫生间', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '用刮水器从上往下，减少水痕' },
  { id: 'bath-towel', name: '换洗浴巾毛巾', icon: '🧻', room: '卫生间', scheduleType: 'fixed', fixedRule: { type: 'weekly', weekdays: [6] }, estimatedMinutes: 10, notes: '' },
  { id: 'bath-grout', name: '清洁瓷砖缝霉斑', icon: '🧽', room: '卫生间', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 40, notes: '除霉喷剂静置 15 分钟，开排风扇' },
  { id: 'bath-washer-clean', name: '洗衣机自清洁', icon: '🧺', room: '卫生间', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 90, notes: '用筒自洁模式，投 1 包洗衣机清洁剂，结束后擦干门封圈' },
  { id: 'bath-washer-filter', name: '清洗洗衣机过滤网', icon: '🧷', room: '卫生间', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '' },

  // 卧室
  { id: 'bed-sheets', name: '换床单', icon: '🛏️', room: '卧室', scheduleType: 'fixed', fixedRule: { type: 'weekly', weekdays: [0] }, estimatedMinutes: 20, notes: '' },
  { id: 'bed-pillow', name: '洗枕套与枕芯', icon: '🛌', room: '卧室', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 30, notes: '枕芯查看洗标，多数可低温机洗后彻底晾干' },
  { id: 'bed-quilt-sun', name: '晒被子', icon: '☀️', room: '卧室', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 20, notes: '选晴天上午 10 点到下午 3 点' },
  { id: 'bed-mattress', name: '翻转除螨床垫', icon: '🧹', room: '卧室', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 40, notes: '吸尘后撒小苏打静置 1 小时再吸走' },
  { id: 'bed-wardrobe', name: '整理换季衣物', icon: '👕', room: '卧室', scheduleType: 'fixed', fixedRule: { type: 'yearly', month: 4, dayOfMonth: 15 }, estimatedMinutes: 120, notes: '收纳前彻底晾干，放防虫片' },

  // 客厅
  { id: 'living-robot-vacuum', name: '清洗扫地机器人', icon: '🤖', room: '客厅', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 25, notes: '清空尘盒、刷主刷毛发、洗拖布、擦传感器与滚轮' },
  { id: 'living-robot-filter', name: '更换扫地机滤网', icon: '🌀', room: '客厅', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 10, notes: '' },
  { id: 'living-sofa', name: '吸尘沙发与坐垫', icon: '🛋️', room: '客厅', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 25, notes: '掀起坐垫吸缝隙' },
  { id: 'living-ac-filter', name: '清洗空调滤网', icon: '❄️', room: '客厅', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 30, notes: '断电后取滤网冲洗，彻底阴干再装回' },
  { id: 'living-tv', name: '擦电视与电器除尘', icon: '📺', room: '客厅', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 15, notes: '屏幕用干燥超细纤维布，不可喷水' },
  { id: 'living-plants', name: '浇花', icon: '🪴', room: '客厅', scheduleType: 'floating', intervalDays: 3, estimatedMinutes: 10, notes: '指插土面 2 厘米，干了再浇，浇透至底部出水' },
  { id: 'living-plant-fertilize', name: '给植物施肥', icon: '🌱', room: '客厅', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 15, notes: '生长期施薄肥，休眠期停' },

  // 阳台
  { id: 'balcony-windows', name: '擦玻璃', icon: '🪟', room: '阳台', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 60, notes: '先洗后刮，阴天擦不易留印' },
  { id: 'balcony-screen', name: '洗纱窗', icon: '🕸️', room: '阳台', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 45, notes: '可用海绵夹住双面擦，无需拆卸' },
  { id: 'balcony-drain', name: '清理阳台地漏与排水', icon: '💧', room: '阳台', scheduleType: 'floating', intervalDays: 90, estimatedMinutes: 15, notes: '雨季前务必检查' },
  { id: 'balcony-dryer', name: '擦晾衣架与晾衣杆', icon: '🧷', room: '阳台', scheduleType: 'floating', intervalDays: 60, estimatedMinutes: 15, notes: '' },

  // 全屋
  { id: 'home-mop', name: '拖地', icon: '🧹', room: '全屋', scheduleType: 'floating', intervalDays: 3, estimatedMinutes: 30, notes: '' },
  { id: 'home-dust', name: '全屋除尘（灯具、踢脚线）', icon: '🪶', room: '全屋', scheduleType: 'floating', intervalDays: 30, estimatedMinutes: 45, notes: '从高到低，先掸后拖' },
  { id: 'home-door-handle', name: '消毒门把手与开关', icon: '🚪', room: '全屋', scheduleType: 'floating', intervalDays: 14, estimatedMinutes: 10, notes: '' },
  { id: 'home-water-filter', name: '更换净水器滤芯', icon: '🚱', room: '全屋', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 30, notes: '记录滤芯型号，换后冲洗 10 分钟再饮用' },
  { id: 'home-smoke-alarm', name: '检查烟感与燃气报警器', icon: '🚨', room: '全屋', scheduleType: 'fixed', fixedRule: { type: 'monthly', dayOfMonth: 1 }, estimatedMinutes: 10, notes: '按测试键听是否报警，电池低电及时换' },
  { id: 'home-medicine', name: '清理过期药品', icon: '💊', room: '全屋', scheduleType: 'floating', intervalDays: 180, estimatedMinutes: 20, notes: '过期药按有害垃圾投放' },
  { id: 'home-deep-clean', name: '大扫除', icon: '✨', room: '全屋', scheduleType: 'fixed', fixedRule: { type: 'yearly', month: 1, dayOfMonth: 20 }, estimatedMinutes: 240, notes: '' },
];

function templatesByRoom() {
  const grouped = {};
  ROOMS.forEach((room) => {
    grouped[room] = CHORE_TEMPLATES.filter((t) => t.room === room);
  });
  return grouped;
}

module.exports = { ROOMS, CHORE_TEMPLATES, templatesByRoom };
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest miniprogram/data/chore-templates.test.js`
Expected: PASS，`Tests: 12 passed`

- [ ] **Step 5: 提交**

```bash
git add miniprogram/data
git commit -m "feat: 添加 39 条内置家务模板库与结构校验测试"
```

---

### Task 13: 提醒云函数

**前置依赖：Task 0 必须已完成**，本任务需要真实的订阅消息模板 ID 与字段名。

**Files:**
- Create: `cloudfunctions/reminder/package.json`
- Create: `cloudfunctions/reminder/config.json`
- Create: `cloudfunctions/reminder/lib/message.js`
- Create: `cloudfunctions/reminder/lib/scan.js`
- Create: `cloudfunctions/reminder/index.js`
- Test: `cloudfunctions/reminder/test/message.test.js`
- Test: `cloudfunctions/reminder/test/scan.test.js`

**Interfaces:**
- Consumes: `cloudfunctions/reminder/lib/date.js` 与 `lib/urgency.js`（同步生成）、`cloudfunctions/api/test/fake-repo.js` 的 `createFakeRepo`（测试复用）
- Produces:
  - `lib/message.js`：`TEMPLATE_ID: string`（从环境变量 `REMINDER_TEMPLATE_ID` 读取）、`buildSummary(chores: object[], todayKey: string): { count: number, headline: string, topChore: object }`、`buildTemplateData(summary: object, todayKey: string): object`
  - `lib/scan.js`：`runReminderScan({ repo, sender, now, logger }): Promise<{ scannedFamilies: number, sent: number, skipped: number, failed: number }>`，`sender` 签名为 `({ openid, data }) => Promise<void>`
  - `index.js`：`exports.main`

- [ ] **Step 1: 写失败的测试**

创建 `cloudfunctions/reminder/test/message.test.js`：

```js
const { buildSummary, buildTemplateData } = require('../lib/message');

const chore = (name, nextDueAt) => ({ name, nextDueAt });

describe('buildSummary', () => {
  const today = '2026-09-17';

  test('统计条数并以最紧急的一件作为摘要', () => {
    const summary = buildSummary(
      [chore('浇花', '2026-09-18'), chore('刷马桶', '2026-09-15'), chore('拖地', '2026-09-17')],
      today
    );
    expect(summary.count).toBe(3);
    expect(summary.topChore.name).toBe('刷马桶');
    expect(summary.headline).toBe('刷马桶已逾期 2 天');
  });

  test('今天到期的摘要文案', () => {
    const summary = buildSummary([chore('拖地', '2026-09-17')], today);
    expect(summary.headline).toBe('拖地今天到期');
  });

  test('明天到期的摘要文案', () => {
    const summary = buildSummary([chore('浇花', '2026-09-18')], today);
    expect(summary.headline).toBe('浇花明天到期');
  });

  test('多天后到期的摘要文案', () => {
    const summary = buildSummary([chore('擦玻璃', '2026-09-20')], today);
    expect(summary.headline).toBe('擦玻璃还有 3 天');
  });

  test('空列表返回 count 为 0 且无 topChore', () => {
    const summary = buildSummary([], today);
    expect(summary.count).toBe(0);
    expect(summary.topChore).toBeNull();
    expect(summary.headline).toBe('');
  });
});

describe('buildTemplateData', () => {
  const today = '2026-09-17';

  test('输出订阅消息模板所需的字段结构', () => {
    const summary = buildSummary([chore('刷马桶', '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    Object.values(data).forEach((field) => {
      expect(field).toHaveProperty('value');
      expect(typeof field.value).toBe('string');
    });
  });

  test('事项名称字段截断到 20 字符以内，满足模板长度限制', () => {
    const summary = buildSummary([chore('名'.repeat(50), '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    Object.values(data).forEach((field) => {
      expect(field.value.length).toBeLessThanOrEqual(20);
    });
  });

  test('包含待办条数信息', () => {
    const summary = buildSummary(
      [chore('a', '2026-09-15'), chore('b', '2026-09-17')],
      today
    );
    const data = buildTemplateData(summary, today);
    const joined = Object.values(data).map((f) => f.value).join(' ');
    expect(joined).toContain('2');
  });

  test('包含今天的日期', () => {
    const summary = buildSummary([chore('a', '2026-09-15')], today);
    const data = buildTemplateData(summary, today);
    const joined = Object.values(data).map((f) => f.value).join(' ');
    expect(joined).toContain('2026-09-17');
  });
});
```

创建 `cloudfunctions/reminder/test/scan.test.js`：

```js
const { runReminderScan } = require('../lib/scan');
const { createFakeRepo } = require('../../api/test/fake-repo');

const noopLogger = { info: () => {}, error: () => {} };
// 北京 2026-09-17 08:30，本地小时为 8
const NOW = Date.UTC(2026, 8, 17, 0, 30);

const family = (overrides = {}) => ({
  _id: 'f1',
  name: '我的家',
  ownerOpenid: 'openid-a',
  inviteCode: 'ABC123',
  inviteCodeExpireAt: NOW + 86400000,
  settings: { reminderHour: 8, defaultReminderLeadDays: 1 },
  createdAt: NOW,
  ...overrides,
});

const member = (overrides = {}) => ({
  _id: 'm1',
  familyId: 'f1',
  openid: 'openid-a',
  nickname: '我',
  avatarUrl: '',
  role: 'owner',
  subscribeQuota: 5,
  joinedAt: NOW,
  active: true,
  ...overrides,
});

const chore = (overrides = {}) => ({
  _id: 'c1',
  familyId: 'f1',
  name: '刷马桶',
  icon: '🚽',
  room: '卫生间',
  scheduleType: 'floating',
  intervalDays: 7,
  fixedRule: null,
  estimatedMinutes: 10,
  notes: '',
  reminderLeadDays: 1,
  lastDoneAt: null,
  lastDoneBy: null,
  nextDueAt: '2026-09-17',
  archived: false,
  createdAt: NOW,
  createdBy: 'openid-a',
  ...overrides,
});

function createSender() {
  const calls = [];
  const sender = async (args) => {
    calls.push(args);
  };
  sender.calls = calls;
  return sender;
}

describe('runReminderScan', () => {
  test('给到期家务的家庭成员发送一条汇总消息', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [chore()],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });

    expect(stats).toEqual({ scannedFamilies: 1, sent: 1, skipped: 0, failed: 0 });
    expect(sender.calls).toHaveLength(1);
    expect(sender.calls[0].openid).toBe('openid-a');
  });

  test('多件家务只发一条消息，节省订阅额度', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [
        chore({ _id: 'c1', nextDueAt: '2026-09-10' }),
        chore({ _id: 'c2', nextDueAt: '2026-09-17' }),
        chore({ _id: 'c3', nextDueAt: '2026-09-18' }),
      ],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(stats.sent).toBe(1);
    expect(sender.calls).toHaveLength(1);
  });

  test('发送成功后扣减额度并写入去重记录', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member({ subscribeQuota: 5 })],
      chores: [chore()],
    });
    await runReminderScan({ repo, sender: createSender(), now: NOW, logger: noopLogger });
    expect(repo._state.members[0].subscribeQuota).toBe(4);
    expect(repo._state.reminderSends).toHaveLength(1);
    expect(repo._state.reminderSends[0].dateKey).toBe('2026-09-17');
  });

  test('同一天重复运行不会重复发送', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [chore()],
    });
    const sender = createSender();
    await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(sender.calls).toHaveLength(1);
    expect(stats.skipped).toBe(1);
    expect(stats.sent).toBe(0);
  });

  test('只处理提醒时段匹配当前小时的家庭', async () => {
    const repo = createFakeRepo({
      families: [family({ settings: { reminderHour: 20, defaultReminderLeadDays: 1 } })],
      members: [member()],
      chores: [chore()],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(stats.scannedFamilies).toBe(0);
    expect(sender.calls).toHaveLength(0);
  });

  test('没有到期家务时不发送', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [chore({ nextDueAt: '2026-12-31' })],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(stats.sent).toBe(0);
    expect(sender.calls).toHaveLength(0);
  });

  test('按每件家务自己的提前提醒天数判断是否纳入', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [
        // 提前 1 天，5 天后到期，不该纳入
        chore({ _id: 'c1', nextDueAt: '2026-09-22', reminderLeadDays: 1 }),
        // 提前 7 天，5 天后到期，应该纳入
        chore({ _id: 'c2', nextDueAt: '2026-09-22', reminderLeadDays: 7 }),
      ],
    });
    const sender = createSender();
    await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(sender.calls).toHaveLength(1);
  });

  test('额度为 0 的成员跳过', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member({ subscribeQuota: 0 })],
      chores: [chore()],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(sender.calls).toHaveLength(0);
    expect(stats.skipped).toBe(1);
  });

  test('已退出家庭的成员不收消息', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member({ active: false })],
      chores: [chore()],
    });
    const sender = createSender();
    await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(sender.calls).toHaveLength(0);
  });

  test('家庭内每个有额度的成员各收一条', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member(), member({ _id: 'm2', openid: 'openid-b' })],
      chores: [chore()],
    });
    const sender = createSender();
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(stats.sent).toBe(2);
    expect(sender.calls.map((c) => c.openid).sort()).toEqual(['openid-a', 'openid-b']);
  });

  test('发送失败时不扣额度、不写去重记录，并把本地额度校正为 0', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member({ subscribeQuota: 5 })],
      chores: [chore()],
    });
    const failing = async () => {
      throw new Error('43101 user refuse to accept the msg');
    };
    const stats = await runReminderScan({
      repo,
      sender: failing,
      now: NOW,
      logger: noopLogger,
    });
    expect(stats.failed).toBe(1);
    expect(stats.sent).toBe(0);
    expect(repo._state.members[0].subscribeQuota).toBe(0);
    expect(repo._state.reminderSends).toHaveLength(0);
  });

  test('单个成员失败不影响其他成员', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member(), member({ _id: 'm2', openid: 'openid-b' })],
      chores: [chore()],
    });
    const sender = async ({ openid }) => {
      if (openid === 'openid-a') throw new Error('boom');
    };
    const stats = await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(stats.sent).toBe(1);
    expect(stats.failed).toBe(1);
  });

  test('归档家务不参与提醒', async () => {
    const repo = createFakeRepo({
      families: [family()],
      members: [member()],
      chores: [chore({ archived: true })],
    });
    const sender = createSender();
    await runReminderScan({ repo, sender, now: NOW, logger: noopLogger });
    expect(sender.calls).toHaveLength(0);
  });
});
```

- [ ] **Step 2: 同步共享代码到 reminder 云函数**

Run: `npm run sync:shared`
Expected: 输出包含 `synced 3 file(s) -> cloudfunctions/reminder/lib`

- [ ] **Step 3: 运行测试确认失败**

Run: `npx jest cloudfunctions/reminder`
Expected: FAIL，报错 `Cannot find module '../lib/message'`

- [ ] **Step 4: 实现消息组装**

创建 `cloudfunctions/reminder/lib/message.js`：

```js
// 订阅消息组装。
// 模板字段名（thing1 / phrase2 / date3 等编号）由微信后台实际下发的模板决定，
// 见 docs/setup-notes.md。落地新模板时只需改本文件。
const { sortChores, classify, formatDueText } = require('./urgency');

const TEMPLATE_ID = process.env.REMINDER_TEMPLATE_ID || '';

// thing 类型字段限 20 个字符，超出会导致发送失败
const THING_MAX_LENGTH = 20;

function truncate(text, max = THING_MAX_LENGTH) {
  return text.length <= max ? text : `${text.slice(0, max - 1)}…`;
}

function buildSummary(chores, todayKey) {
  if (chores.length === 0) {
    return { count: 0, headline: '', topChore: null };
  }
  const sorted = sortChores(chores, todayKey);
  const top = sorted[0];
  return {
    count: chores.length,
    topChore: top,
    headline: `${top.name}${formatDueText(classify(top.nextDueAt, todayKey))}`,
  };
}

// 字段名对应 docs/setup-notes.md 中记录的模板结构。
function buildTemplateData(summary, todayKey) {
  return {
    thing1: { value: truncate(summary.topChore ? summary.topChore.name : '家务待办') },
    phrase2: { value: truncate(`${summary.count} 项待完成`, 5) },
    date3: { value: todayKey },
  };
}

module.exports = { TEMPLATE_ID, THING_MAX_LENGTH, buildSummary, buildTemplateData, truncate };
```

`phrase` 类型限 5 个汉字，因此这里单独传了更短的上限。若 Task 0 拿到的模板字段与此处不同，改这三个键名即可，测试只断言结构与长度，不绑定具体键名。

- [ ] **Step 5: 实现扫描逻辑**

创建 `cloudfunctions/reminder/lib/scan.js`：

```js
const { todayKey, addDays, TZ_OFFSET_MS } = require('./date');
const { buildSummary, buildTemplateData } = require('./message');

function localHourOf(now) {
  return new Date(now + TZ_OFFSET_MS).getUTCHours();
}

// 每小时运行一次，只处理提醒时段等于当前小时的家庭。
// 这样家庭可自选提醒时段，却只需维护一个定时触发器。
async function runReminderScan({ repo, sender, now = Date.now(), logger = console }) {
  const hour = localHourOf(now);
  const today = todayKey(now);
  const stats = { scannedFamilies: 0, sent: 0, skipped: 0, failed: 0 };

  const families = await repo.listFamiliesByReminderHour(hour);
  stats.scannedFamilies = families.length;

  for (const family of families) {
    // 先按最宽松的阈值捞一批，再按每件家务自己的 reminderLeadDays 精筛
    const maxLeadDays = 30;
    const candidates = await repo.listDueChores(family._id, addDays(today, maxLeadDays));
    const due = candidates.filter(
      (chore) => chore.nextDueAt <= addDays(today, chore.reminderLeadDays)
    );
    if (due.length === 0) continue;

    const summary = buildSummary(due, today);
    const data = buildTemplateData(summary, today);
    const members = await repo.listMembers(family._id);

    for (const member of members) {
      if (!member.subscribeQuota || member.subscribeQuota <= 0) {
        stats.skipped += 1;
        continue;
      }
      if (await repo.hasSentReminder(member.openid, today)) {
        stats.skipped += 1;
        continue;
      }
      try {
        await sender({ openid: member.openid, data });
        await repo.updateMember(member._id, { subscribeQuota: member.subscribeQuota - 1 });
        await repo.recordReminderSent({
          openid: member.openid,
          dateKey: today,
          choreCount: due.length,
          sentAt: now,
        });
        stats.sent += 1;
      } catch (err) {
        // 失败多因用户撤回授权或额度耗尽。不扣额度、不写去重记录，
        // 把本地额度校正为 0，用户下次进入小程序会看到续订提示。
        logger.error(`[reminder] send failed openid=${member.openid}`, err);
        await repo.updateMember(member._id, { subscribeQuota: 0 });
        stats.failed += 1;
      }
    }
  }

  return stats;
}

module.exports = { runReminderScan, localHourOf };
```

- [ ] **Step 6: 运行测试确认通过**

Run: `npx jest cloudfunctions/reminder`
Expected: PASS，`Tests: 22 passed`

- [ ] **Step 7: 实现云函数入口与触发器配置**

创建 `cloudfunctions/reminder/package.json`：

```json
{
  "name": "housework-reminder",
  "version": "1.0.0",
  "private": true,
  "main": "index.js",
  "dependencies": {
    "wx-server-sdk": "~2.6.3"
  }
}
```

创建 `cloudfunctions/reminder/config.json`：

```json
{
  "triggers": [
    {
      "name": "hourlyReminderScan",
      "type": "timer",
      "config": "0 0 * * * * *"
    }
  ]
}
```

cron 为七位（秒 分 时 日 月 周 年），`0 0 * * * * *` 表示每小时整点运行。

创建 `cloudfunctions/reminder/index.js`：

```js
const cloud = require('wx-server-sdk');
const { createRepo } = require('../api/lib/repo');
const { runReminderScan } = require('./lib/scan');
const { TEMPLATE_ID } = require('./lib/message');

cloud.init({ env: cloud.DYNAMIC_CURRENT_ENV });

const db = cloud.database();
const repo = createRepo(db, db.command);

async function sender({ openid, data }) {
  const res = await cloud.openapi.subscribeMessage.send({
    touser: openid,
    templateId: TEMPLATE_ID,
    page: 'pages/todo/todo',
    data,
    miniprogramState: 'formal',
    lang: 'zh_CN',
  });
  if (res.errCode && res.errCode !== 0) {
    throw new Error(`subscribeMessage.send failed: ${res.errCode} ${res.errMsg}`);
  }
}

exports.main = async () => {
  if (!TEMPLATE_ID) {
    console.error('[reminder] REMINDER_TEMPLATE_ID 未配置，跳过本次扫描');
    return { ok: false, reason: 'missing template id' };
  }
  const stats = await runReminderScan({ repo, sender, now: Date.now(), logger: console });
  console.log('[reminder] scan finished', stats);
  return { ok: true, stats };
};
```

`index.js` 用相对路径 `require('../api/lib/repo')` 只是为了在本地保持单一实现；云函数上传时不会带上同级目录。**部署前必须执行 Step 8 的复制步骤。**

- [ ] **Step 8: 把 repo 实现纳入同步清单**

repo 实现同时被两个云函数使用，因此它也必须走同步机制而不是相对路径引用。

先把文件移到共享目录：

```bash
git mv cloudfunctions/api/lib/repo.js shared/repo.js
```

修改 `scripts/sync-shared.js`，把 `ALL_FILES` 一行替换为：

```js
const ALL_FILES = ['date.js', 'schedule.js', 'urgency.js', 'repo.js'];
```

修改 `scripts/sync-shared.test.js` 中两条断言，把云函数的期望文件列表改为：

```js
  test('云函数拿到完整四个文件', () => {
    expect(TARGETS[0].files).toEqual(['date.js', 'schedule.js', 'urgency.js', 'repo.js']);
    expect(TARGETS[1].files).toEqual(['date.js', 'schedule.js', 'urgency.js', 'repo.js']);
  });
```

修改 `cloudfunctions/reminder/index.js` 第二行，改为从本目录引用：

```js
const { createRepo } = require('./lib/repo');
```

修改 `cloudfunctions/api/test/repo-contract.test.js` 首行，改为：

```js
const { createRepo, COLLECTIONS } = require('../../../shared/repo');
```

Run: `npm run sync:shared`
Expected: 输出
```
synced 4 file(s) -> cloudfunctions/api/lib
synced 4 file(s) -> cloudfunctions/reminder/lib
synced 2 file(s) -> miniprogram/utils/shared
```

- [ ] **Step 9: 全量回归**

Run: `npm test`
Expected: PASS，所有测试套件通过，`Tests: 230 passed`

- [ ] **Step 10: 提交**

```bash
git add -A
git commit -m "feat: 实现每日提醒扫描、订阅消息组装与定时触发器"
```

---

### Task 14: 云环境部署与真机验证

本任务把后端部署到 Task 0 创建的云环境并做一次端到端验证。需要在微信开发者工具中操作。

**Files:**
- Create: `project.config.json`
- Create: `docs/db-setup.md`

**Interfaces:**
- Consumes: `docs/setup-notes.md` 中的 AppID、环境 ID、模板 ID
- Produces: 可在云开发控制台调用成功的 `api` 云函数

- [ ] **Step 1: 创建小程序项目配置**

创建 `project.config.json`，把 `appid` 替换为 `docs/setup-notes.md` 中的真实值：

```json
{
  "appid": "填入实际 AppID",
  "projectname": "house-work",
  "miniprogramRoot": "miniprogram/",
  "cloudfunctionRoot": "cloudfunctions/",
  "compileType": "miniprogram",
  "libVersion": "3.5.0",
  "setting": {
    "urlCheck": false,
    "es6": true,
    "enhance": true,
    "postcss": true,
    "minified": true,
    "nodeModules": true
  },
  "cloudfunctionTemplateRoot": ""
}
```

- [ ] **Step 2: 在开发者工具中打开项目**

下载并安装微信开发者工具（https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html），用小程序账号扫码登录，选择「导入项目」，目录选仓库根目录，AppID 填实际值。

Expected: 项目成功打开，左侧目录树可见 `cloudfunctions` 与 `miniprogram`

此时 `miniprogram/` 下还没有页面，控制台会报缺少 `app.json`，属于预期现象，计划二会补齐。

- [ ] **Step 3: 创建数据库集合与索引**

在开发者工具的「云开发」控制台 →「数据库」中，依次创建 5 个集合：`families`、`members`、`chores`、`chore_logs`、`reminder_sends`。

每个集合创建后，点击「权限设置」，选择 **「仅管理端可读写」**。

这一步是安全模型的关键：小程序端因此无法直连数据库，所有读写都必须经过云函数鉴权。

然后在「索引管理」中添加索引：

| 集合 | 索引名 | 字段（顺序） | 唯一 |
|---|---|---|---|
| `chores` | `family_active_due` | `familyId` 升序、`archived` 升序、`nextDueAt` 升序 | 否 |
| `members` | `openid` | `openid` 升序 | 是 |
| `members` | `family_active` | `familyId` 升序、`active` 升序 | 否 |
| `chore_logs` | `chore_done` | `choreId` 升序、`doneAt` 降序 | 否 |
| `families` | `invite_code` | `inviteCode` 升序 | 否 |
| `reminder_sends` | `openid_date` | `openid` 升序、`dateKey` 升序 | 是 |

把这份表格连同操作说明写入 `docs/db-setup.md`，内容如下：

```markdown
# 数据库集合与索引配置

## 集合与权限

需创建 5 个集合，全部设为「仅管理端可读写」：
`families`、`members`、`chores`、`chore_logs`、`reminder_sends`

权限设为仅管理端是安全模型的前提。云开发的数据库安全规则无法表达
「同一家庭的成员可互相读写」这类关联条件，因此小程序端不直连数据库，
所有读写经由云函数用 cloud.getWXContext().OPENID 鉴权后代理。

## 索引

| 集合 | 索引名 | 字段（顺序） | 唯一 |
|---|---|---|---|
| chores | family_active_due | familyId 升序、archived 升序、nextDueAt 升序 | 否 |
| members | openid | openid 升序 | 是 |
| members | family_active | familyId 升序、active 升序 | 否 |
| chore_logs | chore_done | choreId 升序、doneAt 降序 | 否 |
| families | invite_code | inviteCode 升序 | 否 |
| reminder_sends | openid_date | openid 升序、dateKey 升序 | 是 |

`members.openid` 唯一索引保证一个微信用户只属于一个家庭。
`reminder_sends.openid_date` 唯一索引在应用层去重之外再兜一层，保证同一天只发一次。
```

- [ ] **Step 4: 配置 reminder 云函数环境变量**

在云开发控制台「云函数」中，reminder 函数上传后进入其「版本与配置」→「环境变量」，添加：

| 变量名 | 值 |
|---|---|
| `REMINDER_TEMPLATE_ID` | `docs/setup-notes.md` 中记录的模板 ID |

- [ ] **Step 5: 上传两个云函数**

先确保共享代码是最新的：

Run: `npm run sync:shared`
Expected: 输出三行 synced

在开发者工具中右键 `cloudfunctions/api` →「上传并部署：云端安装依赖」，等待完成。对 `cloudfunctions/reminder` 重复同样操作。

Expected: 控制台显示「上传成功」，云开发控制台的云函数列表中出现 `api` 与 `reminder`

- [ ] **Step 6: 端到端验证家庭与家务链路**

在云开发控制台「云函数」→ `api` →「云端测试」中，依次执行下列测试模板。

创建家庭：
```json
{ "action": "family.createOrGet", "payload": { "name": "测试家庭" } }
```
Expected: 返回 `ok: true`，`data.family.inviteCode` 为 6 位字符，`data.member.role` 为 `"owner"`

创建一件家务：
```json
{ "action": "chore.create", "payload": { "name": "洗衣机自清洁", "scheduleType": "floating", "intervalDays": 30, "initialLastDoneKey": "2026-09-01" } }
```
Expected: `data.chore.nextDueAt` 为 `"2026-10-01"`

查询列表：
```json
{ "action": "chore.list", "payload": {} }
```
Expected: 返回一条家务，带 `urgency` 字段，`todayKey` 为今天的北京日期

完成打卡（把 `choreId` 换成上一步返回的实际 ID）：
```json
{ "action": "log.complete", "payload": { "choreId": "填入实际 ID" } }
```
Expected: `data.chore.lastDoneAt` 有值，`nextDueAt` 为今天往后 30 天

撤销：
```json
{ "action": "log.undo", "payload": { "choreId": "填入实际 ID" } }
```
Expected: `data.chore.lastDoneAt` 为 `null`，`nextDueAt` 回到 `"2026-10-01"`

鉴权验证：
```json
{ "action": "chore.get", "payload": { "choreId": "不存在的ID" } }
```
Expected: 返回 `ok: false`，`code` 为 `"NOT_FOUND"`，`message` 为中文

- [ ] **Step 7: 验证提醒函数**

先把测试家务的到期日改成今天，并给自己加额度。在 `api` 云端测试中执行：

```json
{ "action": "member.addSubscribeQuota", "payload": { "count": 5 } }
```
Expected: `data.subscribeQuota` 为 5

在数据库控制台把该家务的 `nextDueAt` 手动改为今天的日期，把家庭的 `settings.reminderHour` 改为当前北京时间的小时数。

然后在 `reminder` 云函数的「云端测试」中用空参数 `{}` 触发。

Expected: 返回 `ok: true`，`stats.scannedFamilies` 为 1。由于尚未在真机上点击过订阅授权，`stats.failed` 很可能为 1 并在日志中看到 `43101` 错误，这是预期结果——它证明扫描与发送链路已经打通，只差用户端授权。计划二完成订阅授权后会再验一次真实推送。

- [ ] **Step 8: 提交**

```bash
git add project.config.json docs/db-setup.md
git commit -m "chore: 添加小程序项目配置与数据库集合索引文档"
```

---

## 完成标准

全部任务完成后应满足：

- [ ] `npm test` 全绿，测试数不少于 230
- [ ] 云开发控制台中 `api` 云函数的 18 个 action 均可调用成功
- [ ] 数据库 5 个集合权限均为「仅管理端可读写」，6 个索引已建
- [ ] `reminder` 云函数可手动触发并正确扫描出到期家务
- [ ] `docs/setup-notes.md` 记录了真实的 AppID、环境 ID 与模板字段
- [ ] 每个任务各有一次 git 提交

## 后续

计划一完成后编写计划二：小程序前端页面（待办首屏、家务列表、家务详情、新建编辑、模板多选、我的、邀请落地页）、订阅消息授权与额度上报、以及提交审核与发布。
