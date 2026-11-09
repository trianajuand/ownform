import { AppError } from '../core/errors.js';

// Builds a middleware that checks req.body against a Zod schema, for example
// validate(registerSchema). On success, req.body is replaced by the cleaned data
// (trimmed, lowercased, unknown fields removed). On failure, it throws a VALIDATION_ERROR
// with the list of invalid fields.
export function validate(schema) {
  return (req, res, next) => {
    // In Express 5, req.body is undefined when the request has no JSON body.
    // The schema rejects that like any other invalid input.
    const result = schema.safeParse(req.body);

    if (!result.success) {
      const details = result.error.issues.map((issue) => ({
        field: issue.path.join('.'),
        message: issue.message,
      }));

      throw new AppError('VALIDATION_ERROR', 'Invalid request data', details);
    }

    req.body = result.data;
    next();
  };
}
