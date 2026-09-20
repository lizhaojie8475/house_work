const { createRepo, COLLECTIONS } = require('../../../shared/repo');
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
