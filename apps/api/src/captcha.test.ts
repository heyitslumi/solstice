import assert from 'node:assert/strict'
import { describe, it } from 'node:test'

const { verifyCaptcha } = await import('./app.ts')

describe('trycap verification', () => {
  it('passes through when provider is none', async () => {
    const res = await verifyCaptcha({ captcha_provider: 'none' }, undefined, 'unknown')
    assert.equal(res.ok, true)
  })

  it('fails closed when trycap has no instance URL', async () => {
    const res = await verifyCaptcha(
      { captcha_provider: 'trycap', captcha_site_key: 'site', captcha_secret_key: 'secret' },
      'token',
      'unknown',
    )
    assert.equal(res.ok, false)
  })

  it('fails closed when trycap has no site key', async () => {
    const res = await verifyCaptcha(
      {
        captcha_provider: 'trycap',
        captcha_api_url: 'https://cap.example.com',
        captcha_secret_key: 'secret',
      },
      'token',
      'unknown',
    )
    assert.equal(res.ok, false)
  })

  it('fails closed when the instance is unreachable', async () => {
    const res = await verifyCaptcha(
      {
        captcha_provider: 'trycap',
        captcha_api_url: 'http://127.0.0.1:9',
        captcha_site_key: 'site',
        captcha_secret_key: 'secret',
      },
      'token',
      'unknown',
    )
    assert.equal(res.ok, false)
  })
})
