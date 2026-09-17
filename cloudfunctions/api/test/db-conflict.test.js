const { isDuplicateKeyError } = require('../lib/db-conflict');

describe('isDuplicateKeyError', () => {
  test('仅有 CloudBase 重复键 errCode 时可识别', () => {
    expect(isDuplicateKeyError({ errCode: -502001 })).toBe(true);
  });

  test('仅有 duplicate key error 消息时可识别', () => {
    expect(isDuplicateKeyError(new Error('E11000 duplicate key error collection'))).toBe(true);
  });

  test('不把无关错误识别为重复键冲突', () => {
    expect(isDuplicateKeyError(new Error('network timeout'))).toBe(false);
  });
});
