import { describe, expect, test } from 'vitest'
import { getValidatorById } from '../validatorApi'

describe('verified proposer identity without bundled metadata', () => {
  test('preserves a real validator id so the live map can resolve newer validators', () => {
    const validator = getValidatorById(987654)
    expect(validator).toMatchObject({ id: 987654, name: 'Unknown Validator' })
    expect(validator.logo).toBeNull()
  })

  test.each([null, undefined, 0, -1, NaN, Infinity, 1.5, 'invalid', true])(
    'does not invent an identity for an invalid proposer value %s',
    id => expect(getValidatorById(id).id).toBeNull(),
  )

  test('unknown identities do not mutate the shared unknown placeholder', () => {
    getValidatorById(987654)
    expect(getValidatorById(null).id).toBeNull()
    expect(getValidatorById(987655).id).toBe(987655)
  })
})
