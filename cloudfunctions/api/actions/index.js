// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],
};
