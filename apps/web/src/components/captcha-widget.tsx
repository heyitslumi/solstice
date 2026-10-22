import { useEffect, useRef } from 'react'

interface CaptchaWidgetProps {
  provider?: 'none' | 'turnstile' | 'recaptcha' | 'recaptcha_v2' | 'recaptcha_v3' | 'hcaptcha' | 'friendly_captcha' | 'trycap'
  siteKey?: string
  apiUrl?: string
  onVerify: (token: string) => void
  onError?: (err?: any) => void
}

// <cap-widget> custom element (Cap / TryCap).
declare global {
  interface HTMLElementTagNameMap {
    'cap-widget': HTMLElement
  }
}

declare global {
  interface Window {
    turnstile?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          'error-callback'?: (err: any) => void
          theme?: 'auto' | 'light' | 'dark'
        },
      ) => string
      reset: (widgetId?: string) => void
      remove: (widgetId?: string) => void
    }
    grecaptcha?: {
      ready?: (callback: () => void) => void
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          theme?: 'light' | 'dark'
        },
      ) => number
      execute: (siteKey: string, options: { action: string }) => Promise<string>
      reset: (opt_widget_id?: number) => void
    }
    hcaptcha?: {
      render: (
        container: string | HTMLElement,
        options: {
          sitekey: string
          callback: (token: string) => void
          theme?: 'light' | 'dark'
        },
      ) => string
      reset: (widgetId?: string) => void
    }
    friendlyChallenge?: {
      WidgetInstance: new (
        element: HTMLElement,
        options: {
          sitekey: string
          doneCallback: (solution: string) => void
          errorCallback?: (err: any) => void
          language?: string
        },
      ) => { reset: () => void; destroy: () => void }
    }
  }
}

export function CaptchaWidget({ provider, siteKey, apiUrl, onVerify, onError }: CaptchaWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const widgetIdRef = useRef<any>(null)
  // Callbacks are inline closures in parents (new identity every render).
  // Routing them through refs keeps the effect from re-running — and tearing
  // down a freshly solved widget — on every keystroke.
  const verifyRef = useRef(onVerify)
  verifyRef.current = onVerify
  const errorRef = useRef(onError)
  errorRef.current = onError
  const verify = (token: string) => verifyRef.current(token)
  const fail = (err?: any) => errorRef.current?.(err)

  useEffect(() => {
    if (!provider || provider === 'none' || !siteKey) return
    // Only widget-based providers need the container div; recaptcha_v3 is
    // invisible and renders nothing into it (the component returns null).
    if (provider !== 'recaptcha_v3' && !containerRef.current) return

    let cancelled = false

    function loadScript(src: string, onLoad: () => void) {
      if (document.querySelector(`script[src="${src}"]`)) {
        onLoad()
        return
      }
      const script = document.createElement('script')
      script.src = src
      script.async = true
      script.defer = true
      script.onload = onLoad
      script.onerror = (e) => fail(e)
      document.head.appendChild(script)
    }

    if (provider === 'turnstile') {
      const src = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit'
      loadScript(src, () => {
        if (cancelled || !containerRef.current || !window.turnstile) return
        try {
          widgetIdRef.current = window.turnstile.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => verify(token),
            'error-callback': (err) => fail(err),
            theme: 'dark',
          })
        } catch (e) {
          fail(e)
        }
      })
    } else if (provider === 'recaptcha' || provider === 'recaptcha_v2') {
      const src = 'https://www.google.com/recaptcha/api.js?render=explicit'
      loadScript(src, () => {
        if (cancelled || !containerRef.current || !window.grecaptcha) return
        try {
          widgetIdRef.current = window.grecaptcha.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => verify(token),
            theme: 'dark',
          })
        } catch (e) {
          fail(e)
        }
      })
    } else if (provider === 'recaptcha_v3') {
      const src = `https://www.google.com/recaptcha/api.js?render=${encodeURIComponent(siteKey)}`
      loadScript(src, () => {
        if (cancelled || !window.grecaptcha?.ready) return
        window.grecaptcha.ready(() => {
          if (cancelled || !window.grecaptcha) return
          window.grecaptcha
            .execute(siteKey, { action: 'login' })
            .then((token) => {
              if (!cancelled) verify(token)
            })
            .catch((e) => fail(e))
        })
      })
    } else if (provider === 'hcaptcha') {
      const src = 'https://js.hcaptcha.com/1/api.js?render=explicit'
      loadScript(src, () => {
        if (cancelled || !containerRef.current || !window.hcaptcha) return
        try {
          widgetIdRef.current = window.hcaptcha.render(containerRef.current, {
            sitekey: siteKey,
            callback: (token) => verify(token),
            theme: 'dark',
          })
        } catch (e) {
          fail(e)
        }
      })
    } else if (provider === 'trycap') {
      // apiUrl arrives with the async public config; wait silently — the
      // render guard already returns null until then.
      if (!apiUrl) return
      const endpoint = `${apiUrl.replace(/\/+$/, '')}/${siteKey}/`
      const src = 'https://cdn.jsdelivr.net/npm/cap-widget@0'
      loadScript(src, () => {
        if (cancelled || !containerRef.current) return
        try {
          containerRef.current.innerHTML = ''
          const el = document.createElement('cap-widget')
          el.setAttribute('data-cap-api-endpoint', endpoint)
          el.addEventListener('solve', (e) => {
            const token = (e as CustomEvent).detail?.token
            if (typeof token === 'string' && token && !cancelled) verify(token)
          })
          containerRef.current.appendChild(el)
          widgetIdRef.current = el
        } catch (e) {
          fail(e)
        }
      })
    } else if (provider === 'friendly_captcha') {
      const src = 'https://cdn.jsdelivr.net/npm/friendly-challenge@0.9.14/widget.min.js'
      loadScript(src, () => {
        if (cancelled || !containerRef.current || !window.friendlyChallenge) return
        try {
          widgetIdRef.current = new window.friendlyChallenge.WidgetInstance(containerRef.current, {
            sitekey: siteKey,
            doneCallback: (solution) => onVerify(solution),
            errorCallback: (err) => fail(err),
          })
        } catch (e) {
          fail(e)
        }
      })
    }

    return () => {
      cancelled = true
      if (provider === 'turnstile' && window.turnstile && widgetIdRef.current) {
        try {
          window.turnstile.remove(widgetIdRef.current)
        } catch {}
      }
      if (provider === 'friendly_captcha' && widgetIdRef.current?.destroy) {
        try {
          widgetIdRef.current.destroy()
        } catch {}
      }
      if (provider === 'trycap') {
        try {
          widgetIdRef.current?.reset?.()
        } catch {}
        if (containerRef.current) containerRef.current.innerHTML = ''
      }
    }
  }, [provider, siteKey, apiUrl])

  if (!provider || provider === 'none' || !siteKey) return null
  if (provider === 'trycap' && !apiUrl) return null

  // reCAPTCHA v3 is fully invisible (score-based, badge only) and renders
  // nothing into the container, so skip the wrapper to avoid an empty gap.
  if (provider === 'recaptcha_v3') return null

  return (
    <div className="flex justify-center my-2">
      <div ref={containerRef} />
    </div>
  )
}
