const crypto = require('crypto');

const INVITE_CODE_TTL_MS = 7 * 24 * 60 * 60 * 1000;

// 去掉容易混淆的 0/O/1/I，减少口头转述时的输入错误
const ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

function generateInviteCode(random) {
  let code = '';
  for (let i = 0; i < 6; i += 1) {
    const index = random
      ? Math.floor(random() * ALPHABET.length)
      : crypto.randomInt(ALPHABET.length);
    code += ALPHABET[index];
  }
  return code;
}

function isInviteCodeValid(family, now) {
  return Boolean(family && family.inviteCodeExpireAt && family.inviteCodeExpireAt > now);
}

module.exports = { INVITE_CODE_TTL_MS, generateInviteCode, isInviteCodeValid };
