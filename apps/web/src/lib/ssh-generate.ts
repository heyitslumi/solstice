// Client-side SSH key pair generation (WebCrypto).
// The private key never leaves the browser — only the public key is
// ever sent to the server (via the existing add-ssh-key API).

export type GeneratedKeyType = 'ed25519' | 'rsa' | 'ecdsa'

export interface GeneratedKeyPair {
  publicKey: string // OpenSSH format: "ssh-ed25519 AAAA... comment"
  privateKeyPem: string // PKCS#8 PEM (BEGIN PRIVATE KEY)
  fingerprint: string // SHA256:... (base64, no padding)
  typeLabel: string // e.g. "ED25519", "2048 RSA", "ECDSA P-256"
}

// --- DER (ASN.1) helpers: just enough to parse SubjectPublicKeyInfo ---

function readLength(buf: Uint8Array, pos: number): [number, number] {
  const first = buf[pos]
  if (first < 0x80) return [first, pos + 1]
  const n = first & 0x7f
  let len = 0
  for (let i = 0; i < n; i++) len = (len << 8) | buf[pos + 1 + i]
  return [len, pos + 1 + n]
}

function readTlv(buf: Uint8Array, pos: number): { tag: number; value: Uint8Array; end: number } {
  const tag = buf[pos]
  const [len, valPos] = readLength(buf, pos + 1)
  return { tag, value: buf.subarray(valPos, valPos + len), end: valPos + len }
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((n, p) => n + p.length, 0))
  let off = 0
  for (const p of parts) {
    out.set(p, off)
    off += p.length
  }
  return out
}

function strat(data: Uint8Array): Uint8Array {
  return sshString(data)
}

function sshString(data: Uint8Array): Uint8Array {
  const len = new Uint8Array(4)
  new DataView(len.buffer).setUint32(0, data.length)
  return concat(len, data)
}

function sshMpint(raw: Uint8Array): Uint8Array {
  // raw is the unsigned big-endian integer; prepend 0x00 if sign bit set.
  let val = raw
  while (val.length > 1 && val[0] === 0) val = val.subarray(1)
  if (val.length === 0 || val[0] & 0x80) val = concat(new Uint8Array([0]), val)
  return sshString(val)
}

function b64(bytes: Uint8Array): string {
  let s = ''
  for (let i = 0; i < bytes.length; i += 0x8000) {
    s += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  }
  return btoa(s)
}

function pemWrap(label: string, der: ArrayBuffer): string {
  const lines = b64(new Uint8Array(der)).match(/.{1,64}/g) || []
  return `-----BEGIN ${label}-----\n${lines.join('\n')}\n-----END ${label}-----\n`
}

async function sha256Fingerprint(opensshBlob: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', opensshBlob.slice().buffer as ArrayBuffer)
  return 'SHA256:' + b64(new Uint8Array(digest)).replace(/=+$/, '')
}

function parseSpki(der: ArrayBuffer): { algOid: Uint8Array; pubKeyBytes: Uint8Array } {
  const buf = new Uint8Array(der)
  const outer = readTlv(buf, 0) // SEQUENCE
  const algSeq = readTlv(outer.value, 0) // SEQUENCE { OID, params }
  const oid = readTlv(algSeq.value, 0)
  const bitStr = readTlv(outer.value, algSeq.end) // BIT STRING
  // first byte of BIT STRING value = unused bits count (0), rest = key
  return { algOid: oid.value, pubKeyBytes: bitStr.value.subarray(1) }
}


// Build an OpenSSH-format private key (openssh-key-v1) from the PKCS#8
// export, so the result works directly with ssh / ssh-keygen.
// Layout: magic, string keytype, string publickey blob,
//         string private section { checkint x2, string keytype,
//         string publickey blob, <type-specific fields>, string comment,
//         padding 1,2,3.. to a multiple of 8 }
function opensshPrivatePem(opts: {
  algoName: string
  publicBlob: Uint8Array
  privSection: Uint8Array
  comment: string
}): string {
  const checkint = crypto.getRandomValues(new Uint8Array(4))
  let priv = concat(
    checkint,
    checkint,
    strat(new TextEncoder().encode(opts.algoName)),
    opts.privSection,
    strat(new TextEncoder().encode(opts.comment)),
  )
  let padByte = 1
  while (priv.length % 8 !== 0) {
    priv = concat(priv, new Uint8Array([padByte++]))
  }
  const nkeys = new Uint8Array(4)
  new DataView(nkeys.buffer).setUint32(0, 1)
  const blob = concat(
    new TextEncoder().encode('openssh-key-v1\0'),
    strat(new TextEncoder().encode('none')), // ciphername
    strat(new TextEncoder().encode('none')), // kdfname
    strat(new Uint8Array(0)), // kdfoptions
    nkeys,
    strat(opts.publicBlob),
    strat(priv),
  )
  return pemWrap('OPENSSH PRIVATE KEY', blob.buffer as ArrayBuffer)
}

// Extract the inner OCTET STRING payload of a PKCS#8 PrivateKeyInfo.
function pkcs8Inner(der: ArrayBuffer): Uint8Array {
  const buf = new Uint8Array(der)
  const outer = readTlv(buf, 0)
  const version = readTlv(outer.value, 0)
  const alg = readTlv(outer.value, version.end)
  const octets = readTlv(outer.value, alg.end)
  return octets.value
}

function intsOfSequence(seqValue: Uint8Array): Uint8Array[] {
  const out: Uint8Array[] = []
  let pos = 0
  while (pos < seqValue.length) {
    const t = readTlv(seqValue, pos)
    if (t.tag !== 0x02) break
    out.push(t.value)
    pos = t.end
  }
  return out
}

export async function generateSshKeyPair(opts: {
  type: GeneratedKeyType
  size?: number // rsa bits (2048|4096) or ecdsa curve bits (256|384)
  comment?: string
}): Promise<GeneratedKeyPair> {
  const comment = (opts.comment || '').trim()
  const { type } = opts
  let keyPair: CryptoKeyPair
  let typeLabel: string

  if (type === 'ed25519') {
    keyPair = (await crypto.subtle.generateKey({ name: 'Ed25519' }, true, ['sign', 'verify'])) as CryptoKeyPair
    typeLabel = 'ED25519'
  } else if (type === 'rsa') {
    const bits = opts.size === 4096 ? 4096 : 2048
    keyPair = await crypto.subtle.generateKey(
      { name: 'RSASSA-PKCS1-v1_5', modulusLength: bits, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' },
      true,
      ['sign', 'verify'],
    )
    typeLabel = `${bits} RSA`
  } else {
    const bits = opts.size === 384 ? 384 : 256
    keyPair = await crypto.subtle.generateKey(
      { name: 'ECDSA', namedCurve: bits === 384 ? 'P-384' : 'P-256' },
      true,
      ['sign', 'verify'],
    )
    typeLabel = `ECDSA P-${bits}`
  }

  const spki = await crypto.subtle.exportKey('spki', keyPair.publicKey)
  const { pubKeyBytes } = parseSpki(spki)

  let blob: Uint8Array
  let algoName: string
  if (type === 'ed25519') {
    algoName = 'ssh-ed25519'
    blob = concat(sshString(new TextEncoder().encode(algoName)), sshString(pubKeyBytes))
  } else if (type === 'rsa') {
    algoName = 'ssh-rsa'
    const seq = readTlv(pubKeyBytes, 0) // SEQUENCE { n, e }
    const n = readTlv(seq.value, 0)
    const e = readTlv(seq.value, n.end)
    blob = concat(
      sshString(new TextEncoder().encode(algoName)),
      sshMpint(e.value),
      sshMpint(n.value),
    )
  } else {
    const bits = opts.size === 384 ? 384 : 256
    const curve = bits === 384 ? 'nistp384' : 'nistp256'
    algoName = `ecdsa-sha2-${curve}`
    blob = concat(
      sshString(new TextEncoder().encode(algoName)),
      sshString(new TextEncoder().encode(curve)),
      sshString(pubKeyBytes), // uncompressed point 0x04 || X || Y
    )
  }

  const publicKey = `${algoName} ${b64(blob)}${comment ? ' ' + comment : ''}`
  const pkcs8 = await crypto.subtle.exportKey('pkcs8', keyPair.privateKey)
  const inner = pkcs8Inner(pkcs8)

  let privSection: Uint8Array
  if (type === 'ed25519') {
    // inner = OCTET STRING(seed)
    const seed = readTlv(inner, 0).value
    privSection = concat(strat(pubKeyBytes), strat(concat(seed, pubKeyBytes)))
  } else if (type === 'rsa') {
    // inner = SEQUENCE { version, n, e, d, p, q, dp, dq, qinv }
    const seq = readTlv(inner, 0)
    const ints = intsOfSequence(seq.value) // [version, n, e, d, p, q, dp, dq, qinv]
    const [, n, e, d, pp, q, , , qinv] = ints
    // OpenSSH RSA private section: n, e, d, iqmp, p, q (no CRT exponents)
    privSection = concat(
      sshMpint(n), sshMpint(e), sshMpint(d), sshMpint(qinv), sshMpint(pp), sshMpint(q),
    )
  } else {
    // inner = SEQUENCE { version, OCTET STRING(scalar), [0] curve, [1] pub }
    const seq = readTlv(inner, 0)
    const scalar = readTlv(seq.value, readTlv(seq.value, 0).end).value
    const curve = opts.size === 384 ? 'nistp384' : 'nistp256'
    privSection = concat(
      strat(new TextEncoder().encode(curve)),
      strat(pubKeyBytes),
      sshMpint(scalar),
    )
  }

  return {
    publicKey,
    privateKeyPem: opensshPrivatePem({ algoName, publicBlob: blob, privSection, comment }),
    fingerprint: await sha256Fingerprint(blob),
    typeLabel,
  }
}
