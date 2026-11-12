// Serves https://solstice.host/install.sh straight from the repo, so the page
// and the installer can never drift apart. Pages caches the upstream response
// for a minute; the installer itself is small.
const SOURCE = 'https://raw.githubusercontent.com/heyitslumi/solstice/main/install.sh'

export async function onRequest(): Promise<Response> {
  const upstream = await fetch(SOURCE, { cf: { cacheTtl: 60, cacheEverything: true } })

  if (!upstream.ok) {
    return new Response(`# installer unavailable (upstream ${upstream.status})\n`, {
      status: 502,
      headers: { 'content-type': 'text/plain; charset=utf-8' },
    })
  }

  return new Response(upstream.body, {
    headers: {
      'content-type': 'text/x-shellscript; charset=utf-8',
      'cache-control': 'public, max-age=60',
      'x-content-type-options': 'nosniff',
    },
  })
}
