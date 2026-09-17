const { createFakeRepo } = require('./fake-repo');

describe('createFakeRepo', () => {
  test('createFamily 拒绝重复邀请码并模拟 CloudBase 错误', async () => {
    const repo = createFakeRepo({
      families: [{ _id: 'f1', inviteCode: 'ABC123' }],
    });

    await expect(repo.createFamily({ inviteCode: 'ABC123' })).rejects.toMatchObject({
      errCode: -502001,
      message: expect.stringContaining('duplicate key error'),
    });
  });

  test('createMember 拒绝重复 openid 并模拟 CloudBase 错误', async () => {
    const repo = createFakeRepo({
      members: [{ _id: 'm1', openid: 'openid-a' }],
    });

    await expect(repo.createMember({ openid: 'openid-a' })).rejects.toMatchObject({
      errCode: -502001,
      message: expect.stringContaining('duplicate key error'),
    });
  });

  test('claimInactiveMember 只认领仍为非活跃状态的成员', async () => {
    const repo = createFakeRepo({
      members: [
        { _id: 'm1', openid: 'openid-a', familyId: 'f1', active: false },
        { _id: 'm2', openid: 'openid-b', familyId: 'f2', active: true },
      ],
    });
    const { claimInactiveMember } = repo;

    const claimed = await claimInactiveMember('m1', { familyId: 'f3', active: true });
    expect(claimed).toMatchObject({ _id: 'm1', familyId: 'f3', active: true });
    claimed.familyId = 'mutated-clone';
    expect(repo._state.members[0].familyId).toBe('f3');
    await expect(claimInactiveMember('m2', { familyId: 'f3' })).resolves.toBeNull();
    await expect(claimInactiveMember('missing', { active: true })).resolves.toBeNull();
  });

  test('deleteFamily 返回是否实际删除了家庭', async () => {
    const repo = createFakeRepo({
      families: [{ _id: 'f1', inviteCode: 'ABC123' }],
    });

    await expect(repo.deleteFamily('f1')).resolves.toBe(true);
    await expect(repo.deleteFamily('f1')).resolves.toBe(false);
    expect(repo._state.families).toEqual([]);
  });

  test('createChores 解构后仍可批量创建', async () => {
    const repo = createFakeRepo();
    const { createChores } = repo;

    const created = await createChores([
      { familyId: 'family-a', title: '扫地' },
      { familyId: 'family-a', title: '拖地' },
    ]);

    expect(created).toHaveLength(2);
    expect(created.map((chore) => chore.title)).toEqual(['扫地', '拖地']);
    expect(repo._state.chores).toHaveLength(2);
  });
});
