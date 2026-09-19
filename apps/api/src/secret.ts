import { createHash, randomInt, timingSafeEqual } from 'node:crypto'

export function hashSecret(value: string) {
  return createHash('sha256').update(value).digest('hex')
}

export function matchesSecret(storedHash: string, value: string) {
  const expected = Buffer.from(storedHash, 'hex')
  const actual = Buffer.from(hashSecret(value), 'hex')
  return expected.length === actual.length && timingSafeEqual(actual, expected)
}

/*
 * randomInt over randomBytes % 10**length: the modulo does not divide the byte
 * range evenly, so the low digits would come up more often than the high.
 */
export function generateNumericCode(length: number) {
  return String(randomInt(0, 10 ** length)).padStart(length, '0')
}
