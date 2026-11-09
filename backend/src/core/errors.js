// An error that our own code throws on purpose (a rule was broken, a record already exists...).
// "code" is a stable name such as EMAIL_TAKEN. It knows nothing about HTTP: the error
// handler (middlewares/error-handler.js) decides which HTTP status each code gets.
// "details" is optional extra information, for example the list of invalid fields.
export class AppError extends Error {
  constructor(code, message, details) {
    super(message);

    this.name = 'AppError';
    this.code = code;
    this.details = details;
  }
}
