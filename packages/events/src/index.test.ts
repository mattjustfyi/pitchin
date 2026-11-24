import { describe, expect, it } from 'vitest'
import { PACKAGE_NAME } from './index.ts'

describe('@pitchin/events', () => {
  it('is importable', () => {
    expect(PACKAGE_NAME).toBe('@pitchin/events')
  })
})
