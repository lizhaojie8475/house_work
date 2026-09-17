const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 去掉容易混淆的 0/O/1/I，减少口头转述时的输入错误
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(random = Math.random) {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    code += ALPHABET[Math.floor(random() * ALPHABET.length)];
  }
  return code;
}

function isInviteCodeValid(family, now) {
  return Boolean(family && family.inviteCodeExpireAt && family.inviteCodeExpireAt > now);
}

module.exports = { INVITE_CODE_TTL_MS, generateInviteCode, isInviteCodeValid };
