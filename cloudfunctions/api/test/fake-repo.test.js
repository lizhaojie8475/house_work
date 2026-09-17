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
