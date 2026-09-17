const { appError, CODES } = require('./errors');

// 身份来自 cloud.getWXContext().OPENID，由微信侧注入，客户端无法伪造。
// 所有涉及家庭数据的 action 都必须先过这一关。
async function requireMember(repo, openid) {
  const member = await repo.findMemberByOpenid(openid);
  if (!member || !member.active) {
    throw appError(CODES.FORBIDDEN, '你还没有加入任何家庭');
  }
  return member;
}

async function requireOwner(repo, openid) {
  const member = await requireMember(repo, openid);
  if (member.role !== 'owner') {
    throw appError(CODES.FORBIDDEN, '只有家庭创建者可以进行此操作');
  }
  return member;
}

module.exports = { requireMember, requireOwner };
