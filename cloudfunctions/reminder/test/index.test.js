const mockQuery = {};
mockQuery.orderBy = jest.fn(() => mockQuery);
mockQuery.skip = jest.fn(() => mockQuery);
mockQuery.limit = jest.fn(() => mockQuery);
mockQuery.get = jest.fn(async () => {
  throw new Error('family storage unavailable');
});

const mockDb = {
  command: { lte: (value) => value, inc: (value) => value },
  collection: jest.fn(() => ({
    where: jest.fn(() => mockQuery),
  })),
};

jest.mock(
  'wx-server-sdk',
  () => ({
    DYNAMIC_CURRENT_ENV: 'test',
    init: jest.fn(),
    database: jest.fn(() => mockDb),
    openapi: { subscribeMessage: { send: jest.fn() } },
  }),
  { virtual: true }
);

describe('reminder cloud function entry', () => {
  test('扫描家庭失败时记录 reminder 前缀日志并返回失败', async () => {
    process.env.REMINDER_TEMPLATE_ID = 'template-id';
    jest.resetModules();
    const errorSpy = jest.spyOn(console, 'error').mockImplementation(() => {});
    try {
      const { main } = require('../index');
      await expect(main()).resolves.toEqual({ ok: false, reason: 'scan failed' });
      expect(errorSpy).toHaveBeenCalledWith(
        '[reminder] scan failed',
        expect.objectContaining({ message: 'family storage unavailable' })
      );
    } finally {
      errorSpy.mockRestore();
      delete process.env.REMINDER_TEMPLATE_ID;
    }
  });
});
