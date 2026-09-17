const actions = require('../actions');
const { CODES } = require('../lib/errors');
const { createFakeRepo } = require('./fake-repo');

const call = (name, repo, openid, payload = {}, context = {}) =>
  actions[name]({ openid, payload, repo, ...context });

const sequenceRandom = (...values) => {
  let index = 0;
  return () => values[index++] ?? values[values.length - 1];
};

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

  test('已退出用户重新创建家庭时复用并激活原成员记录', async () => {
    const inactiveMember = { ...ownerMember(), active: false, role: 'member' };
    const repo = createFakeRepo({
      families: [seededFamily()],
      members: [inactiveMember],
    });

    const res = await call('family.createOrGet', repo, 'openid-a');

    expect(repo._state.members).toHaveLength(1);
    expect(res.member).toMatchObject({
      _id: inactiveMember._id,
      familyId: res.family._id,
      role: 'owner',
      active: true,
    });
    await expect(call('family.listMembers', repo, 'openid-a')).resolves.toMatchObject({
      members: [{ _id: inactiveMember._id, familyId: res.family._id, role: 'owner' }],
    });
  });

  test('新建家庭的邀请码碰撞时重新生成', async () => {
    const repo = createFakeRepo({
      families: [seededFamily({ inviteCode: 'AAAAAA' })],
    });
    const random = sequenceRandom(...Array(6).fill(0), ...Array(6).fill(1 / 32));

    const res = await call('family.createOrGet', repo, 'openid-b', {}, { random });

    expect(res.family.inviteCode).toBe('BBBBBB');
    expect(repo._state.families.map((family) => family.inviteCode)).toEqual([
      'AAAAAA',
      'BBBBBB',
    ]);
  });

  test('并发创建导致成员写入重复时抛中文 CONFLICT', async () => {
    const repo = createFakeRepo({
      members: [{ ...ownerMember(), familyId: 'concurrent-family' }],
    });
    repo.findMemberByOpenid = jest.fn().mockResolvedValueOnce(null);

    await expect(call('family.createOrGet', repo, 'openid-a')).rejects.toMatchObject({
      code: CODES.CONFLICT,
      message: expect.stringMatching(/[\u4e00-\u9fff]/),
    });
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

  test('并发加入导致成员写入重复时抛中文 CONFLICT', async () => {
    const repo = createFakeRepo({
      families: [seededFamily()],
      members: [{ ...ownerMember(), openid: 'openid-b' }],
    });
    repo.findMemberByOpenid = jest.fn().mockResolvedValueOnce(null);

    await expect(
      call('family.join', repo, 'openid-b', { inviteCode: 'ABC123' })
    ).rejects.toMatchObject({
      code: CODES.CONFLICT,
      message: expect.stringMatching(/[\u4e00-\u9fff]/),
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

  test('重新生成时不会返回当前邀请码', async () => {
    const repo = createFakeRepo({
      families: [seededFamily({ inviteCode: 'AAAAAA' })],
      members: [ownerMember()],
    });
    const random = sequenceRandom(...Array(6).fill(0), ...Array(6).fill(1 / 32));

    const res = await call(
      'family.refreshInviteCode',
      repo,
      'openid-a',
      {},
      { random }
    );

    expect(res.inviteCode).toBe('BBBBBB');
    expect(repo._state.families[0].inviteCode).toBe('BBBBBB');
  });

  test('邀请码连续碰撞时抛 INTERNAL 业务错误', async () => {
    const repo = createFakeRepo({
      families: [seededFamily({ inviteCode: 'AAAAAA' })],
      members: [ownerMember()],
    });

    await expect(
      call('family.refreshInviteCode', repo, 'openid-a', {}, { random: () => 0 })
    ).rejects.toMatchObject({
      code: CODES.INTERNAL,
      message: expect.stringMatching(/[\u4e00-\u9fff]/),
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
