import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api, type PublicConfig } from '@/lib/api'

const DEFAULT_CONFIG: PublicConfig = {
  name: 'Solstice',
  language: 'en',
  icon: '/brand/solstice-mark.png',
  banner: '',
  url: window.location.origin,
  enableRegistration: true,
  requireEmailVerification: true,
}

interface ConfigContextValue {
  config: PublicConfig
  refreshConfig: () => Promise<void>
}

const ConfigContext = createContext<ConfigContextValue>({
  config: DEFAULT_CONFIG,
  refreshConfig: async () => {},
})

export function ConfigProvider({ children }: { children: ReactNode }) {
  const [config, setConfig] = useState<PublicConfig>(DEFAULT_CONFIG)

  async function refreshConfig() {
    const res = await api.config()
    if (res.ok && res.data) {
      setConfig(res.data)
      document.title = `${res.data.name || 'Solstice'} Host`
      if (res.data.language) {
        document.documentElement.lang = res.data.language
      }
      if (res.data.icon) {
        let link = document.querySelector("link[rel*='icon']") as HTMLLinkElement | null
        if (!link) {
          link = document.createElement('link')
          link.rel = 'icon'
          document.head.appendChild(link)
        }
        link.href = res.data.icon
      }
    }
  }

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
