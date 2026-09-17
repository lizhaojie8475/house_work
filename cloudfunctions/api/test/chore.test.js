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

  test('改备忘与预估耗时不动到期日', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('chore.update', repo, 'openid-a', {
      choreId: 'c1',
      notes: '先倒洁厕剂静置 5 分钟',
      estimatedMinutes: 20,
    });
    expect(res.chore.notes).toBe('先倒洁厕剂静置 5 分钟');
    expect(res.chore.nextDueAt).toBe('2026-09-20');
  });

  test('重复提交相同的周期值不视为变更，不重算', async () => {
    const repo = baseRepo({ chores: [choreDoc()] });
    const res = await call('chore.update', repo, 'openid-a', {
      choreId: 'c1',
      scheduleType: 'floating',
      intervalDays: 7,
    });
    expect(res.chore.nextDueAt).toBe('2026-09-20');
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
