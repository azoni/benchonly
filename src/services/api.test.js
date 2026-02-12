import { describe, it, expect } from 'vitest'
import { getAuthHeaders } from './api'

describe('getAuthHeaders', () => {
  it('returns headers with Bearer token', async () => {
    const headers = await getAuthHeaders()
    expect(headers).toHaveProperty('Authorization')
    expect(headers.Authorization).toMatch(/^Bearer .+/)
    expect(headers['Content-Type']).toBe('application/json')
  })
})
