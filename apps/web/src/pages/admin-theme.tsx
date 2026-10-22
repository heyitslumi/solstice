import {
  ArrowClockwise,
  Check,
  Code,
  DownloadSimple,
  Eye,
  FloppyDisk,
  Moon,
  PaintBrush,
  Palette,
  Sparkle,
  Sun,
  TextAa,
  UploadSimple,
} from '@phosphor-icons/react'
import { useEffect, useRef, useState } from 'react'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { api } from '@/lib/api'
import { useAppConfig } from '@/lib/config'
import {
  applyThemeToDom,
  THEME_PRESETS,
  type ThemePreset,
} from '@/lib/theme-utils'
import { cn } from '@/lib/utils'

const POPULAR_ACCENTS = [
  { label: 'Ember Orange', hex: '#fd9d1e' },
  { label: 'Gold Sun', hex: '#ffc01b' },
  { label: 'Cyan Neon', hex: '#06b6d4' },
  { label: 'Electric Blue', hex: '#3b82f6' },
  { label: 'Emerald Green', hex: '#10b981' },
  { label: 'Amethyst Purple', hex: '#a855f7' },
  { label: 'Crimson Rose', hex: '#f43f5e' },
  { label: 'OLED White', hex: '#ffffff' },
]

const SURFACE_STYLES = [
  {
    id: 'midnight',
    title: 'Midnight Navy',
    desc: 'Deep navy-tinted dark surfaces (default)',
    bg: '#0e1420',
    surface: '#141c2b',
    border: '#232e42',
  },
  {
    id: 'oled',
    title: 'Pitch OLED Black',
    desc: 'Pure #000000 high-contrast black for AMOLED displays',
    bg: '#000000',
    surface: '#0a0a0a',
    border: '#222222',
  },
  {
    id: 'slate',
    title: 'Cool Slate',
    desc: 'Balanced blue-gray slate tone with modern contrast',
    bg: '#0b1120',
    surface: '#131c31',
    border: '#29354d',
  },
  {
    id: 'zinc',
    title: 'Neutral Zinc',
    desc: 'Industrial neutral dark charcoal without chromatic tint',
    bg: '#09090b',
    surface: '#121215',
    border: '#27272a',
  },
]

const RADIUS_OPTIONS = [
  { id: 'sharp', label: 'Sharp', desc: '4px / Technical & compact', controlRadius: '4px' },
  { id: 'default', label: 'Modern', desc: '10px / Balanced standard', controlRadius: '10px' },
  { id: 'round', label: 'Round', desc: '14px / Soft & friendly', controlRadius: '14px' },
  { id: 'pill', label: 'Pill', desc: 'Full pill controls', controlRadius: '9999px' },
]

const FONT_OPTIONS = [
  { id: 'geist', label: 'Geist Variable', desc: 'Default modern technical typeface' },
  { id: 'inter', label: 'Inter', desc: 'Popular neutral UI font' },
  { id: 'roboto', label: 'Roboto', desc: 'Clean geometric curves' },
  { id: 'system', label: 'System Default', desc: 'Native OS font stack' },
  { id: 'mono', label: 'Geist Mono', desc: 'Monospaced developer styling' },
]

const CSS_SNIPPETS = [
  {
    label: 'Button Glow',
    code: `/* Subtle glow on primary buttons */\nbutton[data-variant="primary"]:hover {\n  box-shadow: 0 0 16px var(--accent);\n}`,
  },
  {
    label: 'Thin Scrollbars',
    code: `/* Sleek custom scrollbars */\n::-webkit-scrollbar {\n  width: 6px;\n  height: 6px;\n}\n::-webkit-scrollbar-thumb {\n  background: var(--border-strong);\n  border-radius: 9999px;\n}`,
  },
  {
    label: 'Frosted Glass Header',
    code: `/* Frosted glass header effect */\nheader {\n  backdrop-filter: blur(12px) !important;\n  background-color: color-mix(in oklab, var(--surface) 80%, transparent) !important;\n}`,
  },
]

export function AdminThemePage() {
  const { refreshConfig } = useAppConfig()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [saveSuccess, setSaveSuccess] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [resetDialogOpen, setResetDialogOpen] = useState(false)

  // Theme settings state
  const [preset, setPreset] = useState('solstice')
  const [accentColor, setAccentColor] = useState('#fd9d1e')
  const [surfaceStyle, setSurfaceStyle] = useState('midnight')
  const [radius, setRadius] = useState('default')
  const [font, setFont] = useState('geist')
  const [customCss, setCustomCss] = useState('')
  const [defaultMode, setDefaultMode] = useState('dark')

  // Interactive preview mode toggle (dark vs light simulation)
  const [previewMode, setPreviewMode] = useState<'dark' | 'light'>('dark')

  const fileInputRef = useRef<HTMLInputElement | null>(null)

  // Load current settings from backend
  useEffect(() => {
    async function load() {
      setLoading(true)
      const res = await api.adminSettings()
      if (res.ok && res.data.theme) {
        const t = res.data.theme
        setPreset(t.preset || 'solstice')
        setAccentColor(t.accentColor || '#fd9d1e')
        setSurfaceStyle(t.surfaceStyle || 'midnight')
        setRadius(t.radius || 'default')
        setFont(t.font || 'geist')
        setCustomCss(t.customCss || '')
        setDefaultMode(t.defaultMode || 'dark')

        // Apply immediately to preview live DOM
        applyThemeToDom({
          accentColor: t.accentColor,
          surfaceStyle: t.surfaceStyle,
          radius: t.radius,
          font: t.font,
          customCss: t.customCss,
        })
      }
      setLoading(false)
    }
    load()
  }, [])

  // Live update the DOM whenever any setting changes in the form
  function handleLiveChange(updates: {
    accentColor?: string
    surfaceStyle?: string
    radius?: string
    font?: string
    customCss?: string
  }) {
    applyThemeToDom({
      accentColor: updates.accentColor ?? accentColor,
      surfaceStyle: updates.surfaceStyle ?? surfaceStyle,
      radius: updates.radius ?? radius,
      font: updates.font ?? font,
      customCss: updates.customCss ?? customCss,
    })
  }

  function handleSelectPreset(p: ThemePreset) {
    setPreset(p.id)
    setAccentColor(p.accentColor)
    setSurfaceStyle(p.surfaceStyle)
    setRadius(p.radius)
    setFont(p.font)

    handleLiveChange({
      accentColor: p.accentColor,
      surfaceStyle: p.surfaceStyle,
      radius: p.radius,
      font: p.font,
    })
  }

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaveSuccess(false)

    const res = await api.adminUpdateThemeSettings({
      preset,
      accentColor,
      surfaceStyle,
      radius,
      font,
      customCss,
      defaultMode,
    })

    setSaving(false)
    if (res.ok) {
      setSaveSuccess(true)
      await refreshConfig()
      setTimeout(() => setSaveSuccess(false), 3500)
    } else {
      setError(res.error.message || 'Failed to save theme settings.')
    }
  }

  function handleResetDefaults() {
    const def = THEME_PRESETS[0]
    setPreset(def.id)
    setAccentColor(def.accentColor)
    setSurfaceStyle(def.surfaceStyle)
    setRadius(def.radius)
    setFont(def.font)
    setCustomCss('')
    setDefaultMode('dark')

    handleLiveChange({
      accentColor: def.accentColor,
      surfaceStyle: def.surfaceStyle,
      radius: def.radius,
      font: def.font,
      customCss: '',
    })

    setResetDialogOpen(false)
  }

  function handleExportJson() {
    const payload = {
      preset,
      accentColor,
      surfaceStyle,
      radius,
      font,
      customCss,
      defaultMode,
      exportedAt: new Date().toISOString(),
    }
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `panel-theme-${preset || 'custom'}.json`
    a.click()
    URL.revokeObjectURL(url)
  }

  function handleImportJson(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    const reader = new FileReader()
    reader.onload = (event) => {
      try {
        const data = JSON.parse(event.target?.result as string)
        if (data.accentColor) setAccentColor(data.accentColor)
        if (data.surfaceStyle) setSurfaceStyle(data.surfaceStyle)
        if (data.radius) setRadius(data.radius)
        if (data.font) setFont(data.font)
        if (data.customCss !== undefined) setCustomCss(data.customCss)
        if (data.defaultMode) setDefaultMode(data.defaultMode)
        if (data.preset) setPreset(data.preset)

        handleLiveChange({
          accentColor: data.accentColor,
          surfaceStyle: data.surfaceStyle,
          radius: data.radius,
          font: data.font,
          customCss: data.customCss,
        })
      } catch {
        setError('Invalid theme JSON file.')
      }
    }
    reader.readAsText(file)
    e.target.value = ''
  }

  return (
    <AppShell
      title="Theme Editor"
      description="Design system customization, live color grading, typography, and custom CSS injection."
    >
      <div className="flex w-full flex-col gap-6">
        {/* Hidden Import Input */}
        <input
          type="file"
          ref={fileInputRef}
          accept=".json,application/json"
          className="hidden"
          onChange={handleImportJson}
        />

        {/* Top Control Bar */}
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h1 className="text-[28px] font-bold tracking-tight text-fg">Theme Editor</h1>
            <p className="text-[13px] text-fg-subtle">
              Customize colors, surface contrast, border radius, and inject custom styles.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => fileInputRef.current?.click()}
              className="gap-1.5 text-[12px]"
            >
              <UploadSimple size={15} />
              Import
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={handleExportJson}
              className="gap-1.5 text-[12px]"
            >
              <DownloadSimple size={15} />
              Export
            </Button>

            <Button
              variant="secondary"
              size="sm"
              onClick={() => setResetDialogOpen(true)}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={15} />
              Reset Defaults
            </Button>

            <Button
              variant="primary"
              size="sm"
              disabled={saving || loading}
              onClick={handleSave}
              className="gap-1.5 text-[12px]"
            >
              <FloppyDisk size={15} weight="bold" />
              {loading ? 'Loading...' : saving ? 'Saving...' : 'Save Theme'}
            </Button>
          </div>
        </div>

        {/* Alert status messages */}
        {error && <Alert tone="danger">{error}</Alert>}
        {saveSuccess && (
          <Alert tone="success">
            Theme settings successfully updated and applied globally.
          </Alert>
        )}

        {/* Main 2-Column Layout */}
        <div className="grid grid-cols-1 gap-6 lg:grid-cols-12">
          {/* Left Column: Controls (7 cols) */}
          <div className="flex flex-col gap-6 lg:col-span-7">
            {/* Presets Gallery */}
            <div className="rounded-panel border border-border bg-surface p-5">
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Sparkle size={18} className="text-sun-500" />
                  <h2 className="text-[15px] font-semibold text-fg">Theme Presets</h2>
                </div>
                <span className="text-[11px] text-fg-subtle">One-click visual styles</span>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {THEME_PRESETS.map((p) => {
                  const isSelected = preset === p.id
                  return (
                    <button
                      key={p.id}
                      type="button"
                      onClick={() => handleSelectPreset(p)}
                      className={cn(
                        'flex flex-col items-start rounded-control border p-3 text-left transition-all',
                        isSelected
                          ? 'border-sun-500 bg-sun-500/10 shadow-sm ring-1 ring-sun-500/50'
                          : 'border-border bg-surface-2/40 hover:border-border-strong hover:bg-surface-2',
                      )}
                    >
                      <div className="flex w-full items-center justify-between">
                        <span className="font-semibold text-[13px] text-fg">{p.name}</span>
                        <div className="flex items-center gap-1.5">
                          <span
                            className="size-3.5 rounded-full border border-black/30 shadow-sm"
                            style={{ backgroundColor: p.accentColor }}
                          />
                          {isSelected && <Check size={14} className="text-sun-500 font-bold" />}
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-fg-subtle">
                        {p.description}
                      </p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Accent Colors Section */}
            <div className="rounded-panel border border-border bg-surface p-5">
              <div className="mb-4 flex items-center gap-2">
                <Palette size={18} className="text-sun-500" />
                <h2 className="text-[15px] font-semibold text-fg">Primary Accent Color</h2>
              </div>

              <div className="flex flex-col gap-4">
                <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                  {POPULAR_ACCENTS.map((item) => {
                    const isSelected = accentColor.toLowerCase() === item.hex.toLowerCase()
                    return (
                      <button
                        key={item.hex}
                        type="button"
                        onClick={() => {
                          setAccentColor(item.hex)
                          setPreset('custom')
                          handleLiveChange({ accentColor: item.hex })
                        }}
                        className={cn(
                          'flex items-center gap-2.5 rounded-control border p-2 text-[12px] transition-colors',
                          isSelected
                            ? 'border-sun-500 bg-sun-500/10 font-semibold text-fg'
                            : 'border-border bg-surface-2/40 text-fg-subtle hover:text-fg hover:bg-surface-2',
                        )}
                      >
                        <span
                          className="size-4 rounded-full border border-black/20 shrink-0 shadow-sm"
                          style={{ backgroundColor: item.hex }}
                        />
                        <span className="truncate">{item.label}</span>
                      </button>
                    )
                  })}
                </div>

                <div className="flex items-center gap-3 rounded-control border border-border bg-surface-2/40 p-3">
                  <input
                    type="color"
                    aria-label="Custom color picker"
                    value={accentColor.startsWith('#') ? accentColor : '#fd9d1e'}
                    onChange={(e) => {
                      setAccentColor(e.target.value)
                      setPreset('custom')
                      handleLiveChange({ accentColor: e.target.value })
                    }}
                    className="size-9 cursor-pointer rounded border border-border bg-transparent p-0.5"
                  />
                  <div className="flex flex-1 flex-col">
                    <label className="text-[11px] font-medium text-fg-subtle">
                      Custom Hex Code
                    </label>
                    <input
                      type="text"
                      value={accentColor}
                      onChange={(e) => {
                        setAccentColor(e.target.value)
                        setPreset('custom')
                        if (/^#[0-9A-Fa-f]{6}$/.test(e.target.value)) {
                          handleLiveChange({ accentColor: e.target.value })
                        }
                      }}
                      placeholder="#fd9d1e"
                      className="mt-0.5 h-8 w-36 rounded border border-border bg-surface px-2 font-mono text-[12px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>
                  <span
                    className="size-7 rounded-control border border-border shadow-sm shrink-0"
                    style={{ backgroundColor: accentColor }}
                  />
                </div>
              </div>
            </div>

            {/* Surface & Dark Tone Section */}
            <div className="rounded-panel border border-border bg-surface p-5">
              <div className="mb-4 flex items-center gap-2">
                <PaintBrush size={18} className="text-sun-500" />
                <h2 className="text-[15px] font-semibold text-fg">Dark Surface Styling</h2>
              </div>

              <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                {SURFACE_STYLES.map((style) => {
                  const isSelected = surfaceStyle === style.id
                  return (
                    <button
                      key={style.id}
                      type="button"
                      onClick={() => {
                        setSurfaceStyle(style.id)
                        setPreset('custom')
                        handleLiveChange({ surfaceStyle: style.id })
                      }}
                      className={cn(
                        'flex flex-col rounded-control border p-3 text-left transition-all',
                        isSelected
                          ? 'border-sun-500 bg-sun-500/10 ring-1 ring-sun-500/50'
                          : 'border-border bg-surface-2/40 hover:bg-surface-2',
                      )}
                    >
                      <div className="flex items-center justify-between">
                        <span className="text-[13px] font-semibold text-fg">{style.title}</span>
                        <div
                          className="flex h-4 w-10 overflow-hidden rounded border"
                          style={{ borderColor: style.border }}
                        >
                          <span className="w-1/2" style={{ backgroundColor: style.bg }} />
                          <span className="w-1/2" style={{ backgroundColor: style.surface }} />
                        </div>
                      </div>
                      <p className="mt-1 text-[11px] text-fg-subtle">{style.desc}</p>
                    </button>
                  )
                })}
              </div>
            </div>

            {/* Geometry & Typography */}
            <div className="rounded-panel border border-border bg-surface p-5">
              <div className="mb-4 flex items-center gap-2">
                <TextAa size={18} className="text-sun-500" />
                <h2 className="text-[15px] font-semibold text-fg">Geometry & Typography</h2>
              </div>

              <div className="flex flex-col gap-5">
                {/* Radius */}
                <div>
                  <label className="text-[12px] font-medium text-fg">Corner Radius</label>
                  <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-4">
                    {RADIUS_OPTIONS.map((opt) => {
                      const isSelected = radius === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setRadius(opt.id)
                            setPreset('custom')
                            handleLiveChange({ radius: opt.id })
                          }}
                          className={cn(
                            'flex flex-col items-center justify-center p-2.5 text-center border transition-all',
                            isSelected
                              ? 'border-sun-500 bg-sun-500/10 text-fg font-semibold'
                              : 'border-border bg-surface-2/40 text-fg-subtle hover:text-fg hover:bg-surface-2',
                          )}
                          style={{ borderRadius: opt.controlRadius }}
                        >
                          <span className="text-[12px]">{opt.label}</span>
                          <span className="text-[10px] text-fg-subtle">{opt.controlRadius}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Font Family */}
                <div>
                  <label className="text-[12px] font-medium text-fg">Typography Stack</label>
                  <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                    {FONT_OPTIONS.map((opt) => {
                      const isSelected = font === opt.id
                      return (
                        <button
                          key={opt.id}
                          type="button"
                          onClick={() => {
                            setFont(opt.id)
                            setPreset('custom')
                            handleLiveChange({ font: opt.id })
                          }}
                          className={cn(
                            'flex flex-col rounded-control border p-2.5 text-left transition-all',
                            isSelected
                              ? 'border-sun-500 bg-sun-500/10 font-semibold text-fg'
                              : 'border-border bg-surface-2/40 text-fg-subtle hover:text-fg hover:bg-surface-2',
                          )}
                        >
                          <span className="text-[12px] text-fg">{opt.label}</span>
                          <span className="text-[10px] text-fg-subtle truncate">{opt.desc}</span>
                        </button>
                      )
                    })}
                  </div>
                </div>

                {/* Default Mode */}
                <div>
                  <label className="text-[12px] font-medium text-fg">Default Color Scheme</label>
                  <div className="mt-2 flex gap-2">
                    {[
                      { id: 'dark', label: 'Dark Mode', icon: Moon },
                      { id: 'light', label: 'Light Mode', icon: Sun },
                      { id: 'system', label: 'System Auto', icon: Eye },
                    ].map((m) => {
                      const Icon = m.icon
                      const isSelected = defaultMode === m.id
                      return (
                        <button
                          key={m.id}
                          type="button"
                          onClick={() => setDefaultMode(m.id)}
                          className={cn(
                            'flex flex-1 items-center justify-center gap-1.5 rounded-control border py-2 text-[12px] transition-colors',
                            isSelected
                              ? 'border-sun-500 bg-sun-500/10 font-semibold text-fg'
                              : 'border-border bg-surface-2/40 text-fg-subtle hover:text-fg hover:bg-surface-2',
                          )}
                        >
                          <Icon size={15} />
                          {m.label}
                        </button>
                      )
                    })}
                  </div>
                </div>
              </div>
            </div>

            {/* Custom CSS Injection */}
            <div className="rounded-panel border border-border bg-surface p-5">
              <div className="mb-2 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Code size={18} className="text-sun-500" />
                  <h2 className="text-[15px] font-semibold text-fg">Custom CSS Overrides</h2>
                </div>
                <span className="text-[11px] text-fg-subtle">Appends directly into head</span>
              </div>
              <p className="mb-3 text-[12px] text-fg-subtle leading-relaxed">
                Add custom styles, CSS variables, background patterns, or vendor branding tweaks.
              </p>

              {/* Quick Snippets */}
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="text-[11px] text-fg-subtle">Quick Snippets:</span>
                {CSS_SNIPPETS.map((snip) => (
                  <button
                    key={snip.label}
                    type="button"
                    onClick={() => {
                      const next = customCss.trim()
                        ? `${customCss.trim()}\n\n${snip.code}`
                        : snip.code
                      setCustomCss(next)
                      handleLiveChange({ customCss: next })
                    }}
                    className="rounded bg-surface-2 px-2 py-0.5 text-[11px] font-mono text-fg-subtle hover:text-fg hover:bg-surface-2/80 transition-colors"
                  >
                    + {snip.label}
                  </button>
                ))}
              </div>

              <textarea
                value={customCss}
                onChange={(e) => {
                  setCustomCss(e.target.value)
                  handleLiveChange({ customCss: e.target.value })
                }}
                placeholder="/* Custom CSS overrides */&#10;.custom-banner { border-radius: 8px; }"
                rows={6}
                className="w-full rounded-control border border-border bg-surface-2/50 p-3 font-mono text-[12px] text-fg placeholder:text-fg-subtle focus:border-sun-500 focus:outline-none"
              />
            </div>
          </div>

          {/* Right Column: Live Interactive Preview Canvas (5 cols) */}
          <div className="lg:col-span-5">
            <div className="sticky top-6 flex flex-col gap-4">
              <div className="rounded-panel border border-border bg-surface p-5 shadow-sm">
                <div className="mb-4 flex items-center justify-between border-b border-border pb-3">
                  <div>
                    <span className="font-semibold text-[14px] text-fg">Interactive Preview</span>
                    <p className="text-[11px] text-fg-subtle">Real-time design token sandbox</p>
                  </div>

                  {/* Mode switcher for preview box */}
                  <div className="flex items-center rounded-control border border-border bg-surface-2 p-0.5">
                    <button
                      type="button"
                      onClick={() => setPreviewMode('dark')}
                      className={cn(
                        'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        previewMode === 'dark' ? 'bg-surface text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                      )}
                    >
                      <Moon size={12} />
                      Dark
                    </button>
                    <button
                      type="button"
                      onClick={() => setPreviewMode('light')}
                      className={cn(
                        'flex items-center gap-1 rounded px-2 py-1 text-[11px] font-medium transition-colors',
                        previewMode === 'light' ? 'bg-surface text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                      )}
                    >
                      <Sun size={12} />
                      Light
                    </button>
                  </div>
                </div>

                {/* Simulation Canvas Container */}
                <div
                  className={cn(
                    'flex flex-col gap-4 rounded-control border border-border p-4 transition-colors',
                    previewMode === 'dark' ? 'dark bg-bg text-fg' : 'bg-white text-slate-900',
                  )}
                >
                  {/* Mock Header */}
                  <div className="flex items-center justify-between border-b border-border pb-3">
                    <div className="flex items-center gap-2">
                      <div
                        className="size-6 rounded-control flex items-center justify-center text-white font-bold text-[11px]"
                        style={{ backgroundColor: accentColor }}
                      >
                        S
                      </div>
                      <span className="font-bold text-[13px]">Node #01</span>
                    </div>
                    <span
                      className="rounded-control px-2 py-0.5 text-[11px] font-medium"
                      style={{
                        backgroundColor: `color-mix(in oklab, ${accentColor} 18%, transparent)`,
                        color: accentColor,
                      }}
                    >
                      Online
                    </span>
                  </div>

                  {/* Buttons Sandbox */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-fg-subtle">Buttons</span>
                    <div className="flex flex-wrap gap-2">
                      <Button variant="primary" size="sm" className="text-[12px]">
                        Primary Button
                      </Button>
                      <Button variant="secondary" size="sm" className="text-[12px]">
                        Secondary
                      </Button>
                      <Button variant="danger" size="sm" className="text-[12px]">
                        Danger
                      </Button>
                    </div>
                  </div>

                  {/* Badges Sandbox */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-fg-subtle">Badges</span>
                    <div className="flex flex-wrap gap-1.5">
                      <span
                        className="rounded-control px-2 py-0.5 text-[11px] font-medium border"
                        style={{
                          borderColor: accentColor,
                          color: accentColor,
                        }}
                      >
                        Accent Highlight
                      </span>
                      <span className="rounded-control bg-emerald-500/15 border border-emerald-500/30 px-2 py-0.5 text-[11px] text-emerald-400 font-medium">
                        Running
                      </span>
                      <span className="rounded-control bg-amber-500/15 border border-amber-500/30 px-2 py-0.5 text-[11px] text-amber-400 font-medium">
                        Warning
                      </span>
                      <span className="rounded-control bg-rose-500/15 border border-rose-500/30 px-2 py-0.5 text-[11px] text-rose-400 font-medium">
                        Stopped
                      </span>
                    </div>
                  </div>

                  {/* Form Elements Sandbox */}
                  <div className="flex flex-col gap-2">
                    <span className="text-[11px] font-medium text-fg-subtle">Form Input</span>
                    <input
                      type="text"
                      readOnly
                      defaultValue="instance-01.example.com"
                      className="h-9 w-full rounded-control border border-border bg-surface-2/60 px-3 text-[12px] text-fg focus:border-sun-500 focus:outline-none"
                    />
                  </div>

                  {/* Mock Metric Card */}
                  <div className="rounded-control border border-border bg-surface p-3">
                    <div className="flex items-center justify-between text-[12px]">
                      <span className="text-fg-subtle">CPU Allocation</span>
                      <span className="font-mono font-medium">68%</span>
                    </div>
                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-surface-2">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{ width: '68%', backgroundColor: accentColor }}
                      />
                    </div>
                  </div>

                  {/* Mock Alert */}
                  <div
                    className="flex items-center gap-2 rounded-control border p-2.5 text-[12px]"
                    style={{
                      borderColor: `color-mix(in oklab, ${accentColor} 40%, transparent)`,
                      backgroundColor: `color-mix(in oklab, ${accentColor} 10%, transparent)`,
                    }}
                  >
                    <Sparkle size={15} style={{ color: accentColor }} className="shrink-0" />
                    <span>System announcement style with active accent coloring.</span>
                  </div>
                </div>

                <div className="mt-3 flex items-center justify-between text-[11px] text-fg-subtle">
                  <span>Changes reflect live across the app</span>
                  <span className="font-mono">
                    Preset: <strong className="text-fg">{preset}</strong>
                  </span>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Dialog: Reset Defaults Confirmation */}
        <Dialog open={resetDialogOpen} onOpenChange={setResetDialogOpen}>
          <DialogContent className="max-w-md">
            <DialogTitle>Reset Theme to Default</DialogTitle>
            <DialogDescription>
              Are you sure you want to reset the theme to the default styling? Custom
              accent colors, surface overrides, and custom CSS will be reverted.
            </DialogDescription>

            <div className="mt-5 flex justify-end gap-2.5">
              <Button
                type="button"
                variant="secondary"
                onClick={() => setResetDialogOpen(false)}
              >
                Cancel
              </Button>
              <Button type="button" variant="danger" onClick={handleResetDefaults}>
                Reset to Defaults
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>
    </AppShell>
  )
}
