const CODES = {
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  NO_IDENTITY: 'NO_IDENTITY',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
};

// message 会直接展示给用户，必须是中文且可读。
function appError(code, message) {
  const err = new Error(message);
  err.code = code;
  return err;
}

module.exports = { CODES, appError };
