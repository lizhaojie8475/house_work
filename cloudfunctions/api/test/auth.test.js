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
