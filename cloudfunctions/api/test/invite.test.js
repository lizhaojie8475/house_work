const crypto = require('crypto');
const {
  INVITE_CODE_TTL_MS,
  generateInviteCode,
  isInviteCodeValid,
} = require('../lib/invite');

describe('INVITE_CODE_TTL_MS', () => {
  test('有效期 7 天', () => {
    expect(INVITE_CODE_TTL_MS).toBe(7 * 24 * 60 * 60 * 1000);
  });
});

describe('generateInviteCode', () => {
  test('返回 6 位大写字母或数字', () => {
    expect(generateInviteCode()).toMatch(/^[A-Z0-9]{6}$/);
  });

  test('接受注入的随机源以便确定性测试', () => {
    expect(generateInviteCode(() => 0)).toMatch(/^[A-Z0-9]{6}$/);
    expect(generateInviteCode(() => 0)).toBe(generateInviteCode(() => 0));
  });

  test('默认使用 crypto.randomInt 生成随机索引', () => {
    const randomInt = jest.spyOn(crypto, 'randomInt').mockReturnValue(0);

    expect(generateInviteCode()).toBe('AAAAAA');
    expect(randomInt).toHaveBeenCalledTimes(6);

    randomInt.mockRestore();
  });

  test('多次生成不应总是相同', () => {
    const values = [...Array(6).fill(0), ...Array(6).fill(0.5)];
    const random = () => values.shift();
    const codes = new Set([generateInviteCode(random), generateInviteCode(random)]);
    expect(codes.size).toBeGreaterThan(1);
  });
});

describe('isInviteCodeValid', () => {
  const now = Date.UTC(2026, 8, 17, 4, 0);

  test('未过期返回 true', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now + 1000 }, now)).toBe(true);
  });

  test('已过期返回 false', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now - 1000 }, now)).toBe(false);
  });

  test('正好到期返回 false', () => {
    expect(isInviteCodeValid({ inviteCodeExpireAt: now }, now)).toBe(false);
  });

  test('缺少过期时间返回 false', () => {
    expect(isInviteCodeValid({}, now)).toBe(false);
  });
});
