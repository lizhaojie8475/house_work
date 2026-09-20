const { appError, CODES } = require('../lib/errors');
const { requireMember } = require('../lib/auth');

const MAX_QUOTA = 200;
const MAX_QUOTA_INCREMENT = 20;

async function updateProfile({ openid, payload, repo }) {
  const me = await requireMember(repo, openid);
  const patch = {};

  if (payload.nickname !== undefined) {
    const nickname = String(payload.nickname).trim();
    if (!nickname) throw appError(CODES.INVALID_ARGUMENT, '昵称不能为空');
    if (nickname.length > 20) throw appError(CODES.INVALID_ARGUMENT, '昵称不能超过 20 个字');
    patch.nickname = nickname;
  }
  if (payload.avatarUrl !== undefined) {
    patch.avatarUrl = String(payload.avatarUrl).slice(0, 500);
  }

  const updated = Object.keys(patch).length > 0
    ? await repo.updateMember(me._id, patch)
    : me;
  return { member: updated };
}

// 用户每次点击订阅授权后由小程序端上报累加。
// 上限用于防止异常上报把额度刷到不合理的数值。
async function addSubscribeQuota({ openid, payload, repo }) {
  const me = await requireMember(repo, openid);
  const count = payload.count;
  if (!Number.isInteger(count) || count < 1 || count > MAX_QUOTA_INCREMENT) {
    throw appError(
      CODES.INVALID_ARGUMENT,
      `单次上报额度需为 1 到 ${MAX_QUOTA_INCREMENT} 之间的整数`
    );
  }
  const subscribeQuota = Math.min(MAX_QUOTA, (me.subscribeQuota || 0) + count);
  await repo.updateMember(me._id, { subscribeQuota });
  return { subscribeQuota };
}

async function me({ openid, repo }) {
  const member = await requireMember(repo, openid);
  const family = await repo.getFamily(member.familyId);
  return { member, family };
}

module.exports = {
  'member.updateProfile': updateProfile,
  'member.addSubscribeQuota': addSubscribeQuota,
  'member.me': me,
  MAX_QUOTA,
};
