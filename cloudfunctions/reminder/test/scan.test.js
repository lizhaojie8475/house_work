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
