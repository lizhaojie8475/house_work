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

  test('头像显式传 null 时保存为空字符串', async () => {
    const repo = baseRepo(member({ avatarUrl: 'https://example.com/old.png' }));
    const res = await call('member.updateProfile', repo, 'openid-a', { avatarUrl: null });
    expect(res.member.avatarUrl).toBe('');
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
