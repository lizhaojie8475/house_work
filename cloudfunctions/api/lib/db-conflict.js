const DUPLICATE_KEY_ERR_CODE = -502001;
const DUPLICATE_KEY_MESSAGE = 'duplicate key error';

// 同类识别器也内联在 cloudfunctions/reminder/lib/scan.js；错误形态来自外部
// CloudBase SDK，SDK 变化时必须同步更新两处（云函数需各自独立打包）。
function isDuplicateKeyError(err) {
  return Boolean(
    err &&
      (err.errCode === DUPLICATE_KEY_ERR_CODE ||
        String(err.message || '').includes(DUPLICATE_KEY_MESSAGE))
  );
}

module.exports = { isDuplicateKeyError };
