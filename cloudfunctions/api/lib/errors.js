const CODES = {
  UNKNOWN_ACTION: 'UNKNOWN_ACTION',
  NO_IDENTITY: 'NO_IDENTITY',
  FORBIDDEN: 'FORBIDDEN',
  NOT_FOUND: 'NOT_FOUND',
  INVALID_ARGUMENT: 'INVALID_ARGUMENT',
  CONFLICT: 'CONFLICT',
  INTERNAL: 'INTERNAL',
};

const APP_ERROR_MARKER = Symbol('appError');

// message 会直接展示给用户，必须是中文且可读。
function appError(code, message) {
  const err = new Error(message);
  err.code = code;
  Object.defineProperty(err, APP_ERROR_MARKER, { value: true });
  return err;
}

function isAppError(err) {
  return Boolean(err && err[APP_ERROR_MARKER] === true);
}

module.exports = { CODES, appError, isAppError };
