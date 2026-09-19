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

// https://vite.dev/config/
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  const username = env.DEV_AUTH_USER
  const password = env.DEV_AUTH_PASSWORD

  return {
    plugins: [
      react(),
      tailwindcss(),
      ...(username && password ? [devBasicAuth(username, password)] : []),
    ],
    resolve: {
      alias: {
        '@': fileURLToPath(new URL('./src', import.meta.url)),
      },
    },
    server: {
      // Vite rejects requests whose Host header it does not recognise, so the
      // public dev domain has to be listed explicitly. The leading dot covers the
      // random tunnel subdomains.
      allowedHosts: ['vps.dev.solstice.host', '.kimaki.dev'],
      proxy: {
        '/api': {
          target: env.API_URL || process.env.API_URL || 'http://127.0.0.1:8788',
          changeOrigin: true,
        },
        '/agentation': {
          target: process.env.AGENTATION_URL ?? 'http://127.0.0.1:4747',
          changeOrigin: true,
          rewrite: (path) => path.replace(/^\/agentation/, '') || '/',
        },
      },
    },
  }
})
