const { createRouter } = require('../lib/router');
const { appError, CODES } = require('../lib/errors');

const noopLogger = { error: () => {} };

function build(actions, openid = 'openid-a') {
  return createRouter({
    actions,
    getOpenid: () => openid,
    getRepo: () => ({}),
    logger: noopLogger,
  });
}

describe('createRouter', () => {
  test('成功时返回 ok 与 data', async () => {
    const handle = build({ 'ping.do': async () => ({ pong: 1 }) });
    await expect(handle({ action: 'ping.do' })).resolves.toEqual({
      ok: true,
      data: { pong: 1 },
    });
  });

  test('未知 action 返回 UNKNOWN_ACTION', async () => {
    const handle = build({});
    const res = await handle({ action: 'nope' });
    expect(res.ok).toBe(false);
    expect(res.code).toBe(CODES.UNKNOWN_ACTION);
  });

  test.each([null, undefined])('event 为 %p 时返回 UNKNOWN_ACTION 且不抛错', async (event) => {
    const handle = build({});
    const res = await handle(event);
    expect(res).toEqual({
      ok: false,
      code: CODES.UNKNOWN_ACTION,
      message: '未知操作：undefined',
    });
  });

  test.each(['toString', 'constructor', '__proto__'])('原型链 action %s 返回 UNKNOWN_ACTION', async (action) => {
    const handle = build({});
    const res = await handle({ action });
    expect(res.ok).toBe(false);
    expect(res.code).toBe(CODES.UNKNOWN_ACTION);
  });

  test('缺少 action 返回 UNKNOWN_ACTION', async () => {
    const handle = build({});
    expect((await handle({})).code).toBe(CODES.UNKNOWN_ACTION);
  });

  test('拿不到 openid 返回 NO_IDENTITY', async () => {
    const handle = createRouter({
      actions: { 'ping.do': async () => 1 },
      getOpenid: () => undefined,
      getRepo: () => ({}),
      logger: noopLogger,
    });
    expect((await handle({ action: 'ping.do' })).code).toBe(CODES.NO_IDENTITY);
  });

  test('payload 缺省时传空对象给 handler', async () => {
    let seen;
    const handle = build({
      'ping.do': async ({ payload }) => {
        seen = payload;
        return null;
      },
    });
    await handle({ action: 'ping.do' });
    expect(seen).toEqual({});
  });

  test('handler 收到 openid', async () => {
    let seen;
    const handle = build({
      'ping.do': async ({ openid }) => {
        seen = openid;
        return null;
      },
    });
    await handle({ action: 'ping.do' });
    expect(seen).toBe('openid-a');
  });

  test('已知错误码原样透出，含中文 message', async () => {
    const handle = build({
      'ping.do': async () => {
        throw appError(CODES.FORBIDDEN, '你不在这个家庭中');
      },
    });
    expect(await handle({ action: 'ping.do' })).toEqual({
      ok: false,
      code: CODES.FORBIDDEN,
      message: '你不在这个家庭中',
    });
  });

  test('未预期异常统一收敛为 INTERNAL 且不泄露堆栈', async () => {
    const handle = build({
      'ping.do': async () => {
        throw new Error('db exploded at line 42');
      },
    });
    const res = await handle({ action: 'ping.do' });
    expect(res).toEqual({ ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' });
  });

  test('原型链错误码统一收敛为 INTERNAL 且不泄露消息', async () => {
    const handle = build({
      'ping.do': async () => {
        throw Object.assign(new Error('内部敏感信息'), { code: 'constructor' });
      },
    });
    const res = await handle({ action: 'ping.do' });
    expect(res).toEqual({ ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' });
    expect(res.message).not.toContain('内部敏感信息');
  });

  test('标记业务错误但 code 为 CODES 原型链键时收敛为 INTERNAL 且不泄露消息', async () => {
    const handle = build({
      'ping.do': async () => {
        throw appError('constructor', '敏感信息');
      },
    });
    const res = await handle({ action: 'ping.do' });
    expect(res).toEqual({ ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' });
    expect(JSON.stringify(res)).not.toContain('敏感信息');
  });

  test('伪造的已知错误码统一收敛为 INTERNAL', async () => {
    const handle = build({
      'ping.do': async () => {
        throw Object.assign(new Error('内部敏感信息'), { code: CODES.FORBIDDEN });
      },
    });
    expect(await handle({ action: 'ping.do' })).toEqual({
      ok: false,
      code: CODES.INTERNAL,
      message: '服务异常，请稍后重试',
    });
  });

  test('getOpenid 抛错时统一收敛为 INTERNAL', async () => {
    const handle = createRouter({
      actions: { 'ping.do': async () => 1 },
      getOpenid: () => {
        throw new Error('identity provider failed');
      },
      getRepo: () => ({}),
      logger: noopLogger,
    });
    await expect(handle({ action: 'ping.do' })).resolves.toEqual({
      ok: false,
      code: CODES.INTERNAL,
      message: '服务异常，请稍后重试',
    });
  });

  test('未预期异常会记录日志', async () => {
    const logger = { error: jest.fn() };
    const handle = createRouter({
      actions: {
        'ping.do': async () => {
          throw new Error('boom');
        },
      },
      getOpenid: () => 'openid-a',
      getRepo: () => ({}),
      logger,
    });
    await handle({ action: 'ping.do' });
    expect(logger.error).toHaveBeenCalled();
  });
});
