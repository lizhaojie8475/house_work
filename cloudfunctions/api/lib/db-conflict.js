const DUPLICATE_KEY_ERR_CODE = -502001;
const DUPLICATE_KEY_MESSAGE = 'duplicate key error';

function isDuplicateKeyError(err) {
  return Boolean(
    err &&
      (err.errCode === DUPLICATE_KEY_ERR_CODE ||
        String(err.message || '').includes(DUPLICATE_KEY_MESSAGE))
  );
}

module.exports = { isDuplicateKeyError };
