import bcrypt from 'bcrypt';
import { AppError } from '../../core/errors.js';

// How expensive it is to compute a password hash.
const BCRYPT_ROUNDS = 12;

export function createAuthService({
  authRepository,
  characterService,
  gymService,
  runInTransaction
}) {
  return {
    // Checks the credentials and returns the user WITHOUT the password hash.
    async login({ email, password }) {
      const existingUser = await authRepository.findByEmail(email);

      // The same error for "no such email" and "wrong password".
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

    // Creates a user, activates the gym module and creates their gym profile.
    async register({ name, email, password, trainingFocus }) {
      const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);

      try {
        return await runInTransaction(async (client) => {

          // 1. Create the user.
          const user = await authRepository.createUser(
            { name, email, passwordHash },
            client
          );

          // 2. Activate the gym module for the new user.
          await characterService.activateModule(
            { userId: user.id, module: 'gym' },
            client
          );

          // 3. Create the gym profile with the selected training focus.
          await gymService.createProfile(
            { userId: user.id, trainingFocus },
            client
          );

          return user;
        });

      } catch (error) {
        // The unique index on lower(email) rejected a repeated email.
        if (
          error.code === '23505' &&
          error.constraint === 'uq_users_email_lower'
        ) {
          throw new AppError('EMAIL_TAKEN', 'Email is already registered');
        }

        throw error;
      }
    },
  };
}