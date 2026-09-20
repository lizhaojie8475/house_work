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

const consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});

afterAll(() => {
  expect(consoleErrorSpy).toHaveBeenCalledTimes(2);
  consoleErrorSpy.mockRestore();
});

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

  test('跨家庭完成返回 NOT_FOUND，不泄露 id 存在性', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('log.complete', repo, 'openid-a', { choreId: 'c9' })
    ).rejects.toMatchObject({ code: CODES.NOT_FOUND });
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

  test('回填家务完成后撤销仍以上次完成日为基准', async () => {
    const repo = baseRepo({
      chores: [
        choreDoc({
          createdAt: Date.UTC(2026, 8, 20),
          initialLastDoneKey: '2026-08-01',
          intervalDays: 30,
          nextDueAt: '2026-08-31',
        }),
      ],
    });
    const doneAt = Date.now() - 1000;
    await call('log.complete', repo, 'openid-a', { choreId: 'c1', doneAt });
    const res = await call('log.undo', repo, 'openid-a', { choreId: 'c1' });

    expect(res.chore.lastDoneAt).toBeNull();
    expect(res.chore.nextDueAt).toBe('2026-08-31');
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

  test('跨家庭查询返回 NOT_FOUND，不泄露 id 存在性', async () => {
    const repo = baseRepo({ chores: [choreDoc({ _id: 'c9', familyId: 'f2' })] });
    await expect(
      call('log.list', repo, 'openid-a', { choreId: 'c9' })
    ).rejects.toMatchObject({ code: CODES.NOT_FOUND });
  });
});
