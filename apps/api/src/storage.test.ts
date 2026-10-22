import assert from 'node:assert/strict'
import { createServer } from 'node:http'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { describe, it, after } from 'node:test'
import { parseDataUrl, parseStorageConfig, readLocalAsset, uploadAsset } from './storage.ts'

describe('storage module', () => {
  const testLocalDir = join(process.cwd(), 'data', 'test-uploads')

  after(async () => {
    await rm(testLocalDir, { recursive: true, force: true }).catch(() => {})
  })

  it('parses base64 data URLs correctly', () => {
    const dataUrl = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA='
    const parsed = parseDataUrl(dataUrl)
    assert.ok(parsed)
    assert.equal(parsed.contentType, 'image/webp')
    assert.equal(parsed.extension, 'webp')
    assert.ok(parsed.buffer.length > 0)
  })

  it('uploads to local filesystem and reads it back', async () => {
    const config = parseStorageConfig({
      storage_driver: 'local',
    })
    config.localDir = testLocalDir

    const dummyData = Buffer.from('hello-world-image-content')
    const result = await uploadAsset({
      folder: 'avatars',
      filename: 'test-user.png',
      buffer: dummyData,
      contentType: 'image/png',
      config,
      publicOrigin: 'https://solstice.test',
    })

    assert.equal(result.url, 'https://solstice.test/api/uploads/avatars/test-user.png')
    assert.equal(result.key, 'avatars/test-user.png')

    const read = await readLocalAsset(testLocalDir, 'avatars/test-user.png')
    assert.ok(read)
    assert.equal(read.contentType, 'image/png')
    assert.equal(read.buffer.toString(), 'hello-world-image-content')
  })

  it('fails gracefully when S3 credentials missing', async () => {
    const config = parseStorageConfig({
      storage_driver: 's3',
      storage_s3_bucket: 'my-bucket',
    })

    await assert.rejects(
      async () => {
        await uploadAsset({
          folder: 'avatars',
          buffer: Buffer.from('test'),
          contentType: 'image/png',
          config,
          publicOrigin: 'https://solstice.test',
        })
      },
      { message: /S3 access credentials are not configured/ },
    )
  })

  it('uploads to S3 compatible endpoint with SigV4 authorization', async () => {
    let receivedAuth = ''
    let receivedSha = ''
    let receivedPath = ''
    let receivedBody = ''

    const server = createServer((req, res) => {
      receivedAuth = req.headers['authorization'] || ''
      receivedSha = (req.headers['x-amz-content-sha256'] as string) || ''
      receivedPath = req.url || ''
      const chunks: Buffer[] = []
      req.on('data', (c) => chunks.push(c))
      req.on('end', () => {
        receivedBody = Buffer.concat(chunks).toString()
        res.writeHead(200)
        res.end()
      })
    })

    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', () => resolve()))
    const address = server.address()
    if (!address || typeof address === 'string') throw new Error('Server listen failed')

    try {
      const config = parseStorageConfig({
        storage_driver: 's3',
        storage_s3_access_key: 'test-access-key',
        storage_s3_secret_key: 'test-secret-key',
        storage_s3_bucket: 'my-test-bucket',
        storage_s3_region: 'us-east-1',
        storage_s3_endpoint: `http://127.0.0.1:${address.port}`,
        storage_s3_public_url: 'https://cdn.example.com',
        storage_s3_force_path_style: 'true',
      })

      const payload = Buffer.from('s3-image-bytes')
      const result = await uploadAsset({
        folder: 'avatars',
        filename: 'avatar.png',
        buffer: payload,
        contentType: 'image/png',
        config,
        publicOrigin: 'https://solstice.test',
      })

      assert.equal(result.url, 'https://cdn.example.com/avatars/avatar.png')
      assert.equal(result.key, 'avatars/avatar.png')
      assert.equal(receivedPath, '/my-test-bucket/avatars/avatar.png')
      assert.equal(receivedBody, 's3-image-bytes')
      assert.ok(receivedAuth.startsWith('AWS4-HMAC-SHA256 Credential=test-access-key/'))
      assert.ok(receivedAuth.includes('Signature='))
      assert.ok(receivedSha.length === 64) // SHA-256 hex string
    } finally {
      await new Promise<void>((resolve) => server.close(() => resolve()))
    }
  })
})
