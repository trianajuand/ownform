import { z } from 'zod';

// Reusable email validation schema
const emailSchema = z.string().trim().toLowerCase().pipe(z.email().max(254));

// User registration schema
export const registerSchema = z.object({
  name: z.string().trim().min(1, 'Name is required').max(100, 'Name cannot exceed 100 characters'),

  email: emailSchema,

  password: z
    .string()
    .min(8, 'Password must be at least 8 characters long')
    .max(18, 'Password cannot exceed 18 characters'),

  trainingFocus: z.enum(['strength', 'hypertrophy']),
});

// User login schema
export const loginSchema = z.object({
  email: emailSchema,

  password: z.string().min(1, 'Password is required'),
});
