const { createFakeRepo } = require('./fake-repo');

describe('createFakeRepo', () => {
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
