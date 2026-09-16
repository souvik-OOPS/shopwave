import bcrypt from 'bcryptjs';

import { AUTH } from '@/config/constants';

/**
 * bcrypt at cost 12. Chosen over argon2 because it has no native build step, which
 * keeps `npm install` working identically on Windows, Alpine and CI without a toolchain.
 */
export async function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, AUTH.BCRYPT_ROUNDS);
}

export async function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

/**
 * Burns roughly the same time as a real comparison. Called on the "user not found"
 * branch of login so response timing does not reveal which emails are registered.
 */
export async function fakePasswordCompare(): Promise<void> {
  await bcrypt.compare(
    'timing-equaliser',
    '$2a$12$C6UzMDM.H6dfI/f/IKcEe.9dJkPBqcyOMEuMk3P7CDBRXTNVvNRSm',
  );
}
