import { createHash, createHmac, randomBytes } from 'node:crypto'
import { mkdir, readdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { dirname, join, normalize } from 'node:path'

export interface StorageConfig {
  driver: 'local' | 's3'
  s3AccessKey: string
  s3SecretKey: string
  s3Bucket: string
  s3Region: string
  s3Endpoint: string
  s3PublicUrl: string
  s3ForcePathStyle: boolean
  localDir: string
}

export interface AssetItem {
  name: string
  path: string
  isDir: boolean
  size: number
  createdAt: string
  url: string
}

export function parseStorageConfig(config: Record<string, string>): StorageConfig {
  return {
    driver: (config['storage_driver'] as 'local' | 's3') || 'local',
    s3AccessKey: config['storage_s3_access_key'] || '',
    s3SecretKey: config['storage_s3_secret_key'] || '',
    s3Bucket: config['storage_s3_bucket'] || '',
    s3Region: config['storage_s3_region'] || 'auto',
    s3Endpoint: config['storage_s3_endpoint'] || '',
    s3PublicUrl: config['storage_s3_public_url'] || '',
    s3ForcePathStyle: config['storage_s3_force_path_style'] === 'true',
    localDir: process.env.STORAGE_LOCAL_DIR || join(process.cwd(), 'data', 'uploads'),
  }
}

function sha256(data: string | Buffer): string {
  return createHash('sha256').update(data).digest('hex')
}

function hmac(key: string | Buffer, data: string): Buffer {
  return createHmac('sha256', key).update(data).digest()
}

function getSigningKey(secretKey: string, dateStamp: string, region: string, service: string): Buffer {
  const kDate = hmac('AWS4' + secretKey, dateStamp)
  const kRegion = createHmac('sha256', kDate).update(region).digest()
  const kService = createHmac('sha256', kRegion).update(service).digest()
  return createHmac('sha256', kService).update('aws4_request').digest()
}

export function parseDataUrl(dataUrl: string): { buffer: Buffer; contentType: string; extension: string } | null {
  const match = dataUrl.match(/^data:([a-zA-Z0-9/+-]+);base64,(.+)$/)
  if (!match) return null

  const contentType = match[1]
  const base64Data = match[2]
  const buffer = Buffer.from(base64Data, 'base64')

  let extension = 'bin'
  if (contentType.includes('webp')) extension = 'webp'
  else if (contentType.includes('png')) extension = 'png'
  else if (contentType.includes('jpeg') || contentType.includes('jpg')) extension = 'jpg'
  else if (contentType.includes('svg')) extension = 'svg'
  else if (contentType.includes('gif')) extension = 'gif'

  return { buffer, contentType, extension }
}

async function s3Request(options: {
  method: string
  key?: string
  query?: Record<string, string>
  headers?: Record<string, string>
  body?: Buffer
  contentType?: string
  config: StorageConfig
}): Promise<{ res: Response; targetUrl: URL; host: string }> {
  const { method, key, query, config } = options
  if (!config.s3Bucket) throw new Error('S3 bucket is not configured.')
  if (!config.s3AccessKey || !config.s3SecretKey) {
    throw new Error('S3 access credentials are not configured.')
  }

  const endpointStr = config.s3Endpoint || 'https://s3.amazonaws.com'
  const baseEndpoint = new URL(endpointStr.startsWith('http') ? endpointStr : `https://${endpointStr}`)

  let targetUrl: URL
  let host: string

  const cleanKey = (key || '').replace(/^\/+/, '')
  const encodedKey = cleanKey ? cleanKey.split('/').map(encodeURIComponent).join('/') : ''

  if (config.s3ForcePathStyle || baseEndpoint.hostname.includes('r2.cloudflarestorage.com')) {
    const pathname = `/${encodeURIComponent(config.s3Bucket)}${encodedKey ? '/' + encodedKey : ''}`
    targetUrl = new URL(pathname, baseEndpoint)
    host = baseEndpoint.host
  } else {
    const pathname = encodedKey ? `/${encodedKey}` : '/'
    host = `${config.s3Bucket}.${baseEndpoint.host}`
    targetUrl = new URL(pathname, `${baseEndpoint.protocol}//${host}`)
  }

  const queryEntries = Object.entries(query || {}).sort(([a], [b]) => a.localeCompare(b))
  const canonicalQueryString = queryEntries
    .map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(v)}`)
    .join('&')
  if (canonicalQueryString) {
    targetUrl.search = canonicalQueryString
  }

  const amzDate = new Date().toISOString().replace(/[:-]|\.\d{3}/g, '')
  const dateStamp = amzDate.slice(0, 8)
  const body = options.body || Buffer.alloc(0)
  const payloadHash = sha256(body)

  const canonicalHeaders = `host:${host}\nx-amz-content-sha256:${payloadHash}\nx-amz-date:${amzDate}\n`
  const signedHeaders = 'host;x-amz-content-sha256;x-amz-date'

  const canonicalRequest = [
    method,
    targetUrl.pathname,
    canonicalQueryString,
    canonicalHeaders,
    signedHeaders,
    payloadHash,
  ].join('\n')

  const region = config.s3Region || 'auto'
  const credentialScope = `${dateStamp}/${region}/s3/aws4_request`
  const stringToSign = [
    'AWS4-HMAC-SHA256',
    amzDate,
    credentialScope,
    sha256(canonicalRequest),
  ].join('\n')

  const signingKey = getSigningKey(config.s3SecretKey, dateStamp, region, 's3')
  const signature = createHmac('sha256', signingKey).update(stringToSign).digest('hex')
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.s3AccessKey}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`

  const reqHeaders: Record<string, string> = {
    Host: host,
    'x-amz-date': amzDate,
    'x-amz-content-sha256': payloadHash,
    Authorization: authorization,
    ...(options.headers || {}),
  }

  if (options.contentType) {
    reqHeaders['Content-Type'] = options.contentType
  }
  if (method === 'PUT' || method === 'POST') {
    reqHeaders['Content-Length'] = String(body.byteLength)
  }

  const res = await fetch(targetUrl.toString(), {
    method,
    headers: reqHeaders,
    body: method === 'GET' || method === 'HEAD' || method === 'DELETE' ? undefined : body,
  })

  return { res, targetUrl, host }
}

export async function uploadAsset(options: {
  folder: 'avatars' | 'assets' | 'publicdata' | string
  filename?: string
  buffer: Buffer
  contentType: string
  config: StorageConfig
  publicOrigin: string
}): Promise<{ url: string; key: string }> {
  const { folder, buffer, contentType, config, publicOrigin } = options
  const ext = options.filename?.split('.').pop() || 'bin'
  const safeFilename = options.filename
    ? options.filename.replace(/[^a-zA-Z0-9._-]/g, '_')
    : `${randomBytes(16).toString('hex')}.${ext}`
  const key = `${folder.replace(/\/+$/, '')}/${safeFilename}`

  if (config.driver === 's3') {
    const { res, targetUrl } = await s3Request({
      method: 'PUT',
      key,
      body: buffer,
      contentType,
      config,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`S3 upload failed (${res.status}): ${errText || res.statusText}`)
    }

    const publicBase = config.s3PublicUrl ? config.s3PublicUrl.replace(/\/+$/, '') : ''
    const url = publicBase ? `${publicBase}/${key}` : targetUrl.origin + targetUrl.pathname

    return { url, key }
  }

  // Local filesystem driver
  const safePath = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = join(config.localDir, safePath)
  await mkdir(dirname(filePath), { recursive: true })
  await writeFile(filePath, buffer)

  const base = publicOrigin.replace(/\/+$/, '')
  const url = `${base}/api/uploads/${safePath}`

  return { url, key: safePath }
}

export async function listAssets(options: {
  prefix?: string
  config: StorageConfig
  publicOrigin: string
}): Promise<{ items: AssetItem[]; currentPath: string }> {
  const { config, publicOrigin } = options
  const rawPrefix = (options.prefix || 'assets').replace(/^\/+|\/+$/g, '')
  const currentPath = rawPrefix || 'assets'

  if (config.driver === 's3') {
    const s3Prefix = currentPath ? `${currentPath}/` : ''
    const { res, targetUrl } = await s3Request({
      method: 'GET',
      query: {
        'list-type': '2',
        delimiter: '/',
        prefix: s3Prefix,
      },
      config,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => '')
      throw new Error(`S3 list failed (${res.status}): ${errText || res.statusText}`)
    }

    const xml = await res.text()
    const items: AssetItem[] = []
    const publicBase = config.s3PublicUrl ? config.s3PublicUrl.replace(/\/+$/, '') : ''

    // Match <CommonPrefixes><Prefix>...</Prefix></CommonPrefixes>
    const prefixRegex = /<CommonPrefixes>\s*<Prefix>(.*?)<\/Prefix>\s*<\/CommonPrefixes>/g
    let match: RegExpExecArray | null
    while ((match = prefixRegex.exec(xml)) !== null) {
      const dirPath = match[1].replace(/\/+$/, '')
      const dirName = dirPath.split('/').pop() || dirPath
      items.push({
        name: dirName,
        path: dirPath,
        isDir: true,
        size: 0,
        createdAt: new Date().toISOString(),
        url: '',
      })
    }

    // Match <Contents>...</Contents>
    const contentRegex = /<Contents>([\s\S]*?)<\/Contents>/g
    while ((match = contentRegex.exec(xml)) !== null) {
      const block = match[1]
      const keyMatch = /<Key>(.*?)<\/Key>/.exec(block)
      const sizeMatch = /<Size>(\d+)<\/Size>/.exec(block)
      const modMatch = /<LastModified>(.*?)<\/LastModified>/.exec(block)

      if (keyMatch) {
        const itemKey = keyMatch[1]
        // Skip directory marker itself or empty key
        if (itemKey === s3Prefix || itemKey.endsWith('/')) continue

        const fileName = itemKey.split('/').pop() || itemKey
        const size = sizeMatch ? parseInt(sizeMatch[1], 10) : 0
        const createdAt = modMatch ? new Date(modMatch[1]).toISOString() : new Date().toISOString()
        const url = publicBase
          ? `${publicBase}/${itemKey}`
          : `${targetUrl.origin}/${encodeURIComponent(config.s3Bucket)}/${itemKey.split('/').map(encodeURIComponent).join('/')}`

        items.push({
          name: fileName,
          path: itemKey,
          isDir: false,
          size,
          createdAt,
          url,
        })
      }
    }

    // Sort: directories first, then alphabetical by name
    items.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1
      if (!a.isDir && b.isDir) return 1
      return a.name.localeCompare(b.name)
    })

    return { items, currentPath }
  }

  // Local driver
  const safeRelPath = normalize(currentPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullDirPath = join(config.localDir, safeRelPath)

  await mkdir(fullDirPath, { recursive: true })

  const entries = await readdir(fullDirPath, { withFileTypes: true })
  const items: AssetItem[] = []
  const base = publicOrigin.replace(/\/+$/, '')

  for (const entry of entries) {
    if (entry.name.startsWith('.')) continue
    const itemRelPath = join(safeRelPath, entry.name).replace(/\\/g, '/')
    const itemFullPath = join(fullDirPath, entry.name)

    try {
      const stats = await stat(itemFullPath)
      const isDir = entry.isDirectory()
      items.push({
        name: entry.name,
        path: itemRelPath,
        isDir,
        size: isDir ? 0 : stats.size,
        createdAt: (stats.birthtime || stats.mtime).toISOString(),
        url: isDir ? '' : `${base}/api/uploads/${itemRelPath}`,
      })
    } catch {
      // Ignore stat error for inaccessible file
    }
  }

  items.sort((a, b) => {
    if (a.isDir && !b.isDir) return -1
    if (!a.isDir && b.isDir) return 1
    return a.name.localeCompare(b.name)
  })

  return { items, currentPath: safeRelPath }
}

export async function createAssetDirectory(options: {
  path: string
  name: string
  config: StorageConfig
}): Promise<{ ok: true; path: string }> {
  const { path: parentPath, name, config } = options
  const safeName = name.trim().replace(/[^a-zA-Z0-9._-]/g, '_')
  if (!safeName) throw new Error('Invalid directory name.')

  const rawPath = `${parentPath.replace(/\/+$/, '')}/${safeName}`.replace(/^\/+/, '')

  if (config.driver === 's3') {
    const key = `${rawPath}/`
    const { res } = await s3Request({
      method: 'PUT',
      key,
      body: Buffer.alloc(0),
      contentType: 'application/x-directory',
      config,
    })
    if (!res.ok) {
      const err = await res.text().catch(() => '')
      throw new Error(`Failed to create directory in S3 (${res.status}): ${err || res.statusText}`)
    }
    return { ok: true, path: rawPath }
  }

  const safeRelPath = normalize(rawPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = join(config.localDir, safeRelPath)
  await mkdir(fullPath, { recursive: true })

  return { ok: true, path: safeRelPath }
}

export async function deleteAsset(options: {
  path: string
  config: StorageConfig
}): Promise<{ ok: true }> {
  const { path: rawPath, config } = options
  const cleanPath = rawPath.replace(/^\/+/, '')
  if (!cleanPath || cleanPath === 'assets') {
    throw new Error('Cannot delete root assets directory.')
  }

  if (config.driver === 's3') {
    const { res } = await s3Request({
      method: 'DELETE',
      key: cleanPath,
      config,
    })
    if (!res.ok && res.status !== 404) {
      const err = await res.text().catch(() => '')
      throw new Error(`Failed to delete asset in S3 (${res.status}): ${err || res.statusText}`)
    }
    return { ok: true }
  }

  const safeRelPath = normalize(cleanPath).replace(/^(\.\.(\/|\\|$))+/, '')
  const fullPath = join(config.localDir, safeRelPath)
  await rm(fullPath, { recursive: true, force: true })

  return { ok: true }
}

export async function readLocalAsset(
  localDir: string,
  key: string,
): Promise<{ buffer: Buffer; contentType: string } | null> {
  const safePath = normalize(key).replace(/^(\.\.(\/|\\|$))+/, '')
  const filePath = join(localDir, safePath)

  try {
    const buffer = await readFile(filePath)
    let contentType = 'application/octet-stream'
    const lower = safePath.toLowerCase()
    if (lower.endsWith('.webp')) contentType = 'image/webp'
    else if (lower.endsWith('.png')) contentType = 'image/png'
    else if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) contentType = 'image/jpeg'
    else if (lower.endsWith('.svg')) contentType = 'image/svg+xml'
    else if (lower.endsWith('.gif')) contentType = 'image/gif'

    return { buffer, contentType }
  } catch {
    return null
  }
}
