// action 注册表。每个 handler 签名为 ({ openid, payload, repo }) => Promise<any>。
const family = require('./family');
const chore = require('./chore');

module.exports = {
  'family.createOrGet': family['family.createOrGet'],
  'family.join': family['family.join'],
  'family.refreshInviteCode': family['family.refreshInviteCode'],
  'family.listMembers': family['family.listMembers'],
  'family.updateSettings': family['family.updateSettings'],

  'chore.create': chore['chore.create'],
  'chore.batchCreate': chore['chore.batchCreate'],
  'chore.list': chore['chore.list'],
  'chore.get': chore['chore.get'],
  'chore.update': chore['chore.update'],
  'chore.setArchived': chore['chore.setArchived'],
};
