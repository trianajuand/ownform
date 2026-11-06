import bcrypt from 'bcrypt';
import { AppError } from '../../core/errors.js';

// How expensive it is to compute a password hash. Higher is safer and slower
// (about 270 ms at 12 on a normal computer).
const BCRYPT_ROUNDS = 12;

export function createAuthService({ authRepository }) {
  return {
    // Checks the credentials and returns the user WITHOUT the password hash.
    async login({ email, password }) {
      const existingUser = await authRepository.findByEmail(email);

      // The same error for "no such email" and "wrong password", so nobody can find out
      // which emails have an account.
      if (!existingUser) {
        throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
      }

      const isValid = await bcrypt.compare(password, existingUser.passwordHash);

      if (!isValid) {
        throw new AppError('INVALID_CREDENTIALS', 'Invalid email or password');
      }

      return {
        id: existingUser.id,
        name: existingUser.name,
        email: existingUser.email,
        role: existingUser.role,
      };
    },

    // Creates the account with the password hashed. Returns the user WITHOUT the hash.
    async register({ name, email, password }) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      try {
        return await authRepository.createUser({ name, email, passwordHash });
      } catch (error) {
        // The unique index on lower(email) rejected a repeated email.
        if (error.code === '23505' && error.constraint === 'uq_users_email_lower') {
          throw new AppError('EMAIL_TAKEN', 'Email is already registered');
        }

        throw error;
      }
    },
  };
}
