const { CODES, isAppError } = require('./errors');

const hasOwn = (object, property) => Object.prototype.hasOwnProperty.call(object, property);

// 单入口 + action 路由。所有依赖通过参数注入，便于单元测试替换。
function createRouter({ actions, getOpenid, getRepo, logger = console }) {
  return async function handle(event) {
    if (event == null || typeof event !== 'object') {
      event = {};
    }
    const { action } = event;
    const payload =
      event.payload != null && typeof event.payload === 'object' ? event.payload : {};
    const handler = hasOwn(actions, action) ? actions[action] : undefined;
    if (typeof handler !== 'function') {
      return { ok: false, code: CODES.UNKNOWN_ACTION, message: `未知操作：${action}` };
    }
    try {
      const openid = getOpenid();
      if (!openid) {
        return { ok: false, code: CODES.NO_IDENTITY, message: '无法获取微信身份，请重新进入小程序' };
      }
      const data = await handler({ openid, payload, repo: getRepo() });
      return { ok: true, data };
    } catch (err) {
      if (isAppError(err) && hasOwn(CODES, err.code)) {
        return { ok: false, code: err.code, message: err.message };
      }
      logger.error(`[api] action=${action} failed`, err);
      return { ok: false, code: CODES.INTERNAL, message: '服务异常，请稍后重试' };
    }
  };
}

module.exports = { createRouter };
