import { isValid, monotonicFactory } from 'ulid';

const generateMonotonicUlid = monotonicFactory();
const ulidPattern = /^[0-9A-HJKMNP-TV-Z]{26}$/;

export type Ulid = string & { readonly __brand: 'Ulid' };

export function createUlid(now = Date.now()): Ulid {
  return generateMonotonicUlid(now) as Ulid;
}

export function isUlid(value: string): value is Ulid {
  return ulidPattern.test(value) && isValid(value);
}

export function parseUlid(value: string): Ulid {
  if (!isUlid(value)) throw new Error('Invalid ULID');
  return value;
}
