import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type PublicConfig } from '@/lib/api'
import { useSession } from '@/lib/session'
import { applyThemeToDom, THEME_PRESETS } from '@/lib/theme-utils'

const DEFAULT_CONFIG: PublicConfig = {
  name: 'VPS Panel',
  tagline: 'VPS Hosting',
  language: 'en',
  icon: '/brand/mark.svg',
  banner: '',
  url: window.location.origin,
  enableRegistration: true,
  requireEmailVerification: true,
  enableSecurityKeys: true,
  allowUsernamelessLogin: false,
  captchaProvider: 'none',
  captchaSiteKey: '',
  captchaApiUrl: '',
  legalTermsUrl: '',
  legalPrivacyUrl: '',
  legalAupUrl: '',
}

interface ConfigContextValue {
  config: PublicConfig
  refreshConfig: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_CONFIG,
  refreshConfig: async () => {},
})

function setMetaTag(name: string, content: string, isProperty = false) {
  const attr = isProperty ? 'property' : 'name'
  let el = document.querySelector(`meta[${attr}='${name}']`) as HTMLMetaElement | null
  if (!el) {
    el = document.createElement('meta')
    el.setAttribute(attr, name)
    document.head.appendChild(el)
  }
  el.content = content
}

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG)
  const { user } = useSession()

  // A user-picked preset replaces the whole panel theme (accent, surfaces,
  // radius, font, light treatment). Otherwise the panel defaults apply.
  function applyEffectiveTheme(data: PublicConfig, userPresetId?: string | null) {
    const preset = (userPresetId && THEME_PRESETS.find((p) => p.id === userPresetId)) || null
    applyThemeToDom({
      accentColor: preset?.accentColor ?? data.themeAccentColor,
      surfaceStyle: preset?.surfaceStyle ?? data.themeSurfaceStyle,
      lightStyle: preset?.lightStyle,
      radius: preset?.radius ?? data.themeRadius,
      font: preset?.font ?? data.themeFont,
      customCss: data.themeCustomCss,
    })
  }

  // Server-forced light/dark wins; otherwise the local stored/device choice
  // (managed by useTheme) stays in charge of the .dark class.
  useEffect(() => {
    const mode = user?.themeMode
    if (mode === 'light' || mode === 'dark') {
      document.documentElement.classList.toggle('dark', mode === 'dark')
    }
  }, [user?.themeMode])

  async function refreshConfig() {
    const res = await api.config()
    if (res.ok && res.data) {
      setConfig(res.data)
      document.title = res.data.name || 'VPS Panel'
      if (res.data.icon) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = res.data.icon
      }
      if (res.data.name) {
        setMetaTag('og:site_name', res.data.name, true)
        setMetaTag('og:title', res.data.name, true)
        setMetaTag('twitter:title', res.data.name)
      }
      if (res.data.url) {
        setMetaTag('og:url', res.data.url, true)
      }
      if (res.data.metaDescription) {
        setMetaTag('description', res.data.metaDescription)
        setMetaTag('og:description', res.data.metaDescription, true)
        setMetaTag('twitter:description', res.data.metaDescription)
      }
      if (res.data.metaPreviewImage) {
        setMetaTag('og:image', res.data.metaPreviewImage, true)
        setMetaTag('og:image:secure_url', res.data.metaPreviewImage, true)
        setMetaTag('twitter:image', res.data.metaPreviewImage)
      }
      if (res.data.metaTwitterCard) {
        setMetaTag('twitter:card', res.data.metaTwitterCard)
      }
      if (res.data.metaThemeColor) {
        setMetaTag('theme-color', res.data.metaThemeColor)
      }
      if (res.data.metaAllowIndexing !== undefined) {
        setMetaTag('robots', res.data.metaAllowIndexing ? 'index, follow' : 'noindex, nofollow')
      }
    }
  }

  // Panel theme + user preset override, re-applied whenever either arrives.
  useEffect(() => {
    applyEffectiveTheme(config, user?.themePreset)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [config, user?.themePreset])

  useEffect(() => {
    void refreshConfig()
  }, [])

  return (
    <ConfigContext.Provider value={{ config, refreshConfig }}>
      {children}
    </ConfigContext.Provider>
  )
}

export function useAppConfig() {
  return useContext(ConfigContext)
}
