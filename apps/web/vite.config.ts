import { timingSafeEqual } from 'node:crypto'
import { fileURLToPath, URL } from 'node:url'

import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv, type Plugin } from 'vite'

function secretsMatch(a: string, b: string) {
  const left = Buffer.from(a)
  const right = Buffer.from(b)
  return left.length === right.length && timingSafeEqual(left, right)
}

/*
 * The dev server answers on a public hostname and through the tunnel, and it
 * serves source files and the API, so it is gated behind HTTP basic auth rather
 * than left readable by anyone who finds the URL. Credentials come from
 * apps/web/.env, which is gitignored; with no credentials set it stays open,
 * which keeps local-only work unencumbered.
 */
function devBasicAuth(username: string, password: string): Plugin {
  return {
    name: 'dev-basic-auth',
    apply: 'serve',
    configureServer(server) {
      // Calling use() here, rather than returning a function, registers before
      // Vite installs its own middlewares — which is what makes this gate every
      // request instead of only the 404 fallthrough.
      server.middlewares.use((req, res, next) => {
        const header = req.headers.authorization

        if (header?.startsWith('Basic ')) {
          const decoded = Buffer.from(header.slice('Basic '.length), 'base64').toString('utf8')
          const separator = decoded.indexOf(':')

          if (
            separator !== -1 &&
            secretsMatch(decoded.slice(0, separator), username) &&
            secretsMatch(decoded.slice(separator + 1), password)
          ) {
            next()
            return
          }
        }

        res.statusCode = 401
        res.setHeader('WWW-Authenticate', 'Basic realm="restricted"')
        res.end('Authentication required')
      })
    },
  }
}

function dynamicSeo(apiUrl: string): Plugin {
  return {
    name: 'dynamic-seo',
    transformIndexHtml: {
      order: 'post',
      async handler(html) {
        let config: any = null
        try {
          const res = await fetch(`${apiUrl}/api/config`, { signal: AbortSignal.timeout(1000) })
          if (res.ok) config = await res.json()
        } catch {
          // fallback
        }

        if (!config) return html

        const pageUrl = config.url || ''
        const name = config.name || 'Solstice'
        const title = `${name} Host`
        const desc = config.metaDescription || 'Next-generation cloud infrastructure and VPS management platform.'
        const image = config.metaPreviewImage || config.banner || ''
        const twitterCard = config.metaTwitterCard || 'summary_large_image'
        const themeColor = config.metaThemeColor || '#6c5ce7'
        const allowIndexing = config.metaAllowIndexing !== false

        // Replace <title>
        html = html.replace(/<title>.*?<\/title>/i, `<title>${title}</title>`)

        // Clean out default description/theme-color/robots to avoid duplicates
        html = html.replace(/<meta\s+name=["']description["'][^>]*>\s*/gi, '')
        html = html.replace(/<meta\s+name=["']theme-color["'][^>]*>\s*/gi, '')
        html = html.replace(/<meta\s+name=["']robots["'][^>]*>\s*/gi, '')
        html = html.replace(/<meta\s+property=["']og:[^"']*["'][^>]*>\s*/gi, '')
        html = html.replace(/<meta\s+name=["']twitter:[^"']*["'][^>]*>\s*/gi, '')

        const metaTags = [
          `<meta name="description" content="${desc}" />`,
          `<meta name="theme-color" content="${themeColor}" />`,
          pageUrl ? `<meta property="og:url" content="${pageUrl}" />` : '',
          `<meta property="og:site_name" content="${name}" />`,
          `<meta property="og:type" content="website" />`,
          `<meta property="og:title" content="${title}" />`,
          `<meta property="og:description" content="${desc}" />`,
          image ? `<meta property="og:image" content="${image}" />` : '',
          image ? `<meta property="og:image:secure_url" content="${image}" />` : '',
          `<meta name="twitter:card" content="${twitterCard}" />`,
          `<meta name="twitter:title" content="${title}" />`,
          `<meta name="twitter:description" content="${desc}" />`,
          image ? `<meta name="twitter:image" content="${image}" />` : '',
          `<meta name="robots" content="${allowIndexing ? 'index, follow' : 'noindex, nofollow'}" />`,
        ]
          .filter(Boolean)
          .join('\n    ')

        return html.replace('</head>', `    ${metaTags}\n  </head>`)
      },
    },
  }
}

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const username = env.DEV_AUTH_USER
  const password = env.DEV_AUTH_PASSWORD
  const apiUrl = env.API_URL || process.env.API_URL || 'http://127.0.0.1:8788'

  return {
    plugins: [
      react(),
      tailwindcss(),
      dynamicSeo(apiUrl),
      ...(username && password ? [devBasicAuth(username, password)] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      host: '0.0.0.0',
      allowedHosts: true,
      proxy: {
        '/api': {
          target: env.API_URL || process.env.API_URL || 'http://127.0.0.1:8788',
          changeOrigin: true,
          // The embedded console speaks WebSocket under /api — without this
          // Vite never forwards the Upgrade and the terminal hangs connecting.
          ws: true,
          timeout: 600000,
        },
        '/agentation': {
          target: process.env.AGENTATION_URL ?? 'http://127.0.0.1:4747',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agentation/, '') || '/',
          bypass: (_req, res) => {
            if (!process.env.AGENTATION_URL && res) {
              res.statusCode = 204
              res.end()
              return false
            }
          },
        },
      },
    },
  }
})
