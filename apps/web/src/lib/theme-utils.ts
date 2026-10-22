export type LightStyle = 'paper' | 'mist' | 'moss' | 'frost' | 'white' | 'blush' | 'lilac'

export interface ThemePreset {
  id: string
  name: string
  description: string
  accentColor: string
  surfaceStyle: 'midnight' | 'oled' | 'slate' | 'zinc'
  lightStyle: LightStyle
  radius: 'sharp' | 'default' | 'round' | 'pill'
  font: 'geist' | 'inter' | 'roboto' | 'system' | 'mono'
}

/* Light-mode surface treatments, one per preset. Kept deliberately subtle:
   near-white surfaces with a whisper of the preset's hue. */
const LIGHT_STYLES: Record<LightStyle, { bg: string; surface: string; surface2: string; border: string; borderStrong: string }> = {
  paper: { bg: '#faf7f2', surface: '#fffdf9', surface2: '#f3ede3', border: '#e7ddcd', borderStrong: '#d3c5ab' },
  mist: { bg: '#f2f4f7', surface: '#fcfdfe', surface2: '#e8ecf1', border: '#dbe1e9', borderStrong: '#bcc6d2' },
  moss: { bg: '#f1f6f1', surface: '#fcfffc', surface2: '#e6efe6', border: '#d5e2d5', borderStrong: '#b3c8b3' },
  frost: { bg: '#eef4fa', surface: '#f8fcfe', surface2: '#e2ecf5', border: '#d2dfee', borderStrong: '#aec6dd' },
  white: { bg: '#ffffff', surface: '#ffffff', surface2: '#f4f4f5', border: '#e4e4e7', borderStrong: '#c9c9ce' },
  blush: { bg: '#faf2f4', surface: '#fffbfc', surface2: '#f5e6ea', border: '#ecd3da', borderStrong: '#d9aeb9' },
  lilac: { bg: '#f5f2fa', surface: '#fdfcff', surface2: '#eae5f4', border: '#d9cfee', borderStrong: '#bdaed9' },
}

export const THEME_PRESETS: ThemePreset[] = [
  {
    id: 'solstice',
    name: 'Sunset',
    description: 'Warm gold, ember orange and deep navy tint (Official)',
    accentColor: '#fd9d1e',
    surfaceStyle: 'midnight',
    lightStyle: 'paper',
    radius: 'default',
    font: 'geist',
  },
  {
    id: 'cyberpunk',
    name: 'Cyberpunk Neon',
    description: 'Electric cyan highlight over deep midnight black',
    accentColor: '#06b6d4',
    surfaceStyle: 'midnight',
    lightStyle: 'mist',
    radius: 'sharp',
    font: 'mono',
  },
  {
    id: 'emerald',
    name: 'Emerald Forest',
    description: 'Lush emerald green on balanced dark slate surfaces',
    accentColor: '#10b981',
    surfaceStyle: 'slate',
    lightStyle: 'moss',
    radius: 'default',
    font: 'inter',
  },
  {
    id: 'nordic',
    name: 'Nordic Frost',
    description: 'Arctic sky blue with soft rounded curves and cool slate',
    accentColor: '#38bdf8',
    surfaceStyle: 'slate',
    lightStyle: 'frost',
    radius: 'round',
    font: 'inter',
  },
  {
    id: 'oled',
    name: 'OLED Pitch Black',
    description: 'True #000000 high-contrast monochrome with sharp corners',
    accentColor: '#ffffff',
    surfaceStyle: 'oled',
    lightStyle: 'white',
    radius: 'sharp',
    font: 'geist',
  },
  {
    id: 'rose',
    name: 'Rose Quartz',
    description: 'Vibrant crimson rose with smooth rounded geometry',
    accentColor: '#f43f5e',
    surfaceStyle: 'zinc',
    lightStyle: 'blush',
    radius: 'round',
    font: 'geist',
  },
  {
    id: 'amethyst',
    name: 'Royal Amethyst',
    description: 'Deep royal purple with modern balanced curves',
    accentColor: '#a855f7',
    surfaceStyle: 'midnight',
    lightStyle: 'lilac',
    radius: 'default',
    font: 'geist',
  },
]

export interface ThemeConfigInput {
  accentColor?: string
  surfaceStyle?: string
  lightStyle?: string
  radius?: string
  font?: string
  customCss?: string
}

const FALLBACK_ACCENT = '#fd9d1e'

function parseHexColor(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{3}|[0-9a-f]{6})$/i.exec(hex.trim())
  if (!match) return null
  let digits = match[1]
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((d) => d + d)
      .join('')
  }
  const num = parseInt(digits, 16)
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255]
}

function relativeLuminance([r, g, b]: [number, number, number]): number {
  const channel = (v: number) => {
    const s = v / 255
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4)
  }
  return 0.2126 * channel(r) + 0.7152 * channel(g) + 0.0722 * channel(b)
}

function contrastRatio(a: string, b: string): number {
  const rgbA = parseHexColor(a)
  const rgbB = parseHexColor(b)
  if (!rgbA || !rgbB) return 21
  const [lighter, darker] = [relativeLuminance(rgbA), relativeLuminance(rgbB)].sort((x, y) => y - x)
  return (lighter + 0.05) / (darker + 0.05)
}

function accentBlock(selector: string, accent: string, includeText: boolean): string {
  return `
${selector} {
  --accent: ${accent};
  --ring: ${accent};
  --color-sun-500: ${accent};${includeText ? `\n  --accent-text: ${accent};` : ''}
  --accent-hover: color-mix(in oklab, ${accent} 85%, white);
  --accent-active: color-mix(in oklab, ${accent} 85%, black);
}`
}

export function generateThemeCss(config: ThemeConfigInput): string {
  const rules: string[] = []

  // Accent color. Extreme accents are scoped to the mode they remain visible
  // in: near-white vanishes on light surfaces, near-black on dark ones. The
  // other mode falls back to the default amber so controls never go invisible.
  const accent = config.accentColor?.trim()
  if (accent && accent.toLowerCase() !== FALLBACK_ACCENT) {
    const nearWhite = contrastRatio(accent, '#ffffff') < 1.5
    const nearBlack = !nearWhite && contrastRatio(accent, '#000000') < 1.5
    if (nearWhite) {
      rules.push(accentBlock(':root', FALLBACK_ACCENT, false))
      rules.push(accentBlock('.dark', accent, true))
    } else if (nearBlack) {
      rules.push(accentBlock(':root', accent, false))
      rules.push(accentBlock('.dark', FALLBACK_ACCENT, true))
    } else {
      rules.push(accentBlock(':root', accent, false))
      rules.push(accentBlock('.dark', accent, true))
    }
  }

  // Radius
  if (config.radius === 'sharp') {
    rules.push(`
:root, .dark {
  --radius-control: 0.25rem !important;
  --radius-panel: 0.375rem !important;
}`)
  } else if (config.radius === 'round') {
    rules.push(`
:root, .dark {
  --radius-control: 0.875rem !important;
  --radius-panel: 1.5rem !important;
}`)
  } else if (config.radius === 'pill') {
    rules.push(`
:root, .dark {
  --radius-control: 9999px !important;
  --radius-panel: 1.5rem !important;
}`)
  }

  // Surface Style (dark mode)
  if (config.surfaceStyle === 'oled') {
    rules.push(`
.dark {
  --bg: #000000 !important;
  --surface: #0a0a0a !important;
  --surface-2: #141414 !important;
  --border: #222222 !important;
  --border-strong: #333333 !important;
}`)
  } else if (config.surfaceStyle === 'slate') {
    rules.push(`
.dark {
  --bg: #0b1120 !important;
  --surface: #131c31 !important;
  --surface-2: #1e293b !important;
  --border: #29354d !important;
  --border-strong: #3d4d6e !important;
}`)
  } else if (config.surfaceStyle === 'zinc') {
    rules.push(`
.dark {
  --bg: #09090b !important;
  --surface: #121215 !important;
  --surface-2: #1c1c21 !important;
  --border: #27272a !important;
  --border-strong: #3f3f46 !important;
}`)
  }

  // Light surface treatment (light mode only). Scoped to :root without
  // .dark: the !important flags would otherwise beat the dark theme and
  // wash dark mode out with light surfaces.
  if (config.lightStyle && config.lightStyle !== 'paper' && LIGHT_STYLES[config.lightStyle as LightStyle]) {
    const light = LIGHT_STYLES[config.lightStyle as LightStyle]
    rules.push(`
:root:not(.dark) {
  --bg: ${light.bg} !important;
  --surface: ${light.surface} !important;
  --surface-2: ${light.surface2} !important;
  --border: ${light.border} !important;
  --border-strong: ${light.borderStrong} !important;
}`)
  }

  // Font family
  if (config.font === 'inter') {
    rules.push(`body { font-family: 'Inter', system-ui, sans-serif !important; }`)
  } else if (config.font === 'roboto') {
    rules.push(`body { font-family: 'Roboto', system-ui, sans-serif !important; }`)
  } else if (config.font === 'system') {
    rules.push(`body { font-family: system-ui, -apple-system, sans-serif !important; }`)
  } else if (config.font === 'mono') {
    rules.push(`body { font-family: var(--font-mono) !important; }`)
  }

  // Custom CSS injection
  if (config.customCss?.trim()) {
    rules.push(`\n/* Custom CSS */\n${config.customCss.trim()}`)
  }

  return rules.join('\n')
}

export function applyThemeToDom(config: ThemeConfigInput) {
  if (typeof document === 'undefined') return
  let el = document.getElementById('solstice-theme-override') as HTMLStyleElement | null
  const css = generateThemeCss(config)

  if (!css.trim()) {
    if (el) el.remove()
    return
  }

  if (!el) {
    el = document.createElement('style')
    el.id = 'solstice-theme-override'
    document.head.appendChild(el)
  }
  el.textContent = css
}
