import { randomBytes } from 'node:crypto';

import slugify from 'slugify';

export function toSlug(value: string): string {
  return slugify(value, { lower: true, strict: true, trim: true });
}

/**
 * Produces a slug guaranteed not to collide, given a lookup that reports existence.
 * Appends `-2`, `-3`, … then falls back to a random suffix rather than looping forever.
 */
export async function uniqueSlug(
  base: string,
  exists: (candidate: string) => Promise<boolean>,
  maxAttempts = 10,
): Promise<string> {
  const root = toSlug(base) || 'item';

  if (!(await exists(root))) return root;

  for (let attempt = 2; attempt <= maxAttempts; attempt += 1) {
    const candidate = `${root}-${attempt}`;
    if (!(await exists(candidate))) return candidate;
  }

  return `${root}-${randomBytes(4).toString('hex')}`;
}

/** Deterministic SKU seed, e.g. "Acoustic Headphones" → "ACO-8F2A1C". */
export function generateSku(name: string): string {
  const prefix = toSlug(name).replace(/-/g, '').slice(0, 3).toUpperCase().padEnd(3, 'X');
  return `${prefix}-${randomBytes(3).toString('hex').toUpperCase()}`;
}
