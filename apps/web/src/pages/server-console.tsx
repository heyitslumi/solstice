import '@xterm/xterm/css/xterm.css'

import { ArrowLeft, ArrowClockwise, ArrowsIn, ArrowsOut, Terminal } from '@phosphor-icons/react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Dialog, DialogContent, DialogDescription, DialogTitle } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { CliSpinner } from '@/components/ui/cli-spinner'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type ConnState = 'connecting' | 'open' | 'closed'

const CLOSE_REASONS: Record<number, string> = {
  4401: 'Not signed in — sign in again and retry.',
  4404: 'Server not found.',
  4408: 'Closed after 20 minutes idle.',
  4409: 'Someone is already using this console.',
  4410: 'Start the server first.',
  4500: 'Could not open a shell inside the server.',
}

export function ServerConsolePage() {
  const { id } = useParams<{ id: string }>()
  const [serverName, setServerName] = useState('')
  const [state, setState] = useState<ConnState>('connecting')
  const [reason, setReason] = useState<string | null>(null)
  const [takenCode, setTakenCode] = useState<number | null>(null)
  const [takeover, setTakeover] = useState(false)
  const [attempt, setAttempt] = useState(0)
  const [mode, setMode] = useState<'shell' | 'console' | 'graphical'>('shell')
  const [instanceType, setInstanceType] = useState<string>('')
  const spiceRef = useRef<any>(null)
  const graphicalRef = useRef(false)
  const spiceScreenRef = useRef<HTMLDivElement>(null)
  const spiceMsgRef = useRef<HTMLDivElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const termRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!id) return
    void api.getInstance(id).then((res) => {
      if (res.ok) {
        setServerName(res.data.instance.name)
        setInstanceType(res.data.instance.type || '')
      }
    })
  }, [id])

  const connect = useCallback(() => {
    if (!id || !containerRef.current || mode === 'graphical') return
    setState('connecting')
    setReason(null)

    // Remove any leftover elements from SPICE or past sessions before opening terminal
    if (containerRef.current) {
      containerRef.current.replaceChildren()
    }
    const term = new XTerm({
      cursorBlink: true,
      cursorStyle: 'bar',
      fontFamily: '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace',
      fontSize: 13,
      lineHeight: 1.25,
      scrollback: 5000,
      theme: {
        background: '#0d1117',
        foreground: '#e6edf3',
        cursor: '#fd9d1e',
        cursorAccent: '#0d1117',
        selectionBackground: '#fd9d1e55',
        black: '#0d1117',
        red: '#f85149',
        green: '#3fb950',
        yellow: '#d29922',
        blue: '#58a6ff',
        magenta: '#bc8cff',
        cyan: '#39c5cf',
        white: '#b1bac4',
        brightBlack: '#6e7681',
        brightRed: '#ff7b72',
        brightGreen: '#56d364',
        brightYellow: '#e3b341',
        brightBlue: '#79c0ff',
        brightMagenta: '#d2a8ff',
        brightCyan: '#56d4dd',
        brightWhite: '#f0f6fc',
      },
    })
    const fit = new FitAddon()
    term.loadAddon(fit)
    term.open(containerRef.current)
    termRef.current = term

    const sendSize = (ws: WebSocket) => {
      if (ws.readyState !== WebSocket.OPEN) return
      ws.send(JSON.stringify({ cols: term.cols, rows: term.rows }))
    }

    // Defer so the container has layout dimensions.
    const timer = setTimeout(() => {
      try {
        fit.fit()
      } catch {
        // ignore
      }
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const ws = new WebSocket(
        `${proto}://${window.location.host}/api/instances/${encodeURIComponent(id)}/console?mode=${mode}&cols=${term.cols}&rows=${term.rows}${takeover ? '&takeover=1' : ''}`,
      )
      wsRef.current = ws
      ws.binaryType = 'arraybuffer'

      ws.onopen = () => {
        setState('open')
        sendSize(ws)
      }
      ws.onmessage = (evt) => {
        if (typeof evt.data === 'string') term.write(evt.data)
        else term.write(new Uint8Array(evt.data as ArrayBuffer))
      }
      ws.onclose = (evt) => {
        // In graphical mode the terminal ws is stale — SPICE owns the state.
        if (graphicalRef.current) return
        setState('closed')
        setTakenCode(evt.code === 4409 ? evt.code : null)
        if (evt.code === 4409) setTakeover(false)
        if (evt.code !== 1000 || evt.reason) {
          setReason(
            evt.reason || CLOSE_REASONS[evt.code] || `Connection closed (${evt.code}).`,
          )
        }
        term.write('\r\n\x1b[2m[session ended — press Reconnect to open a new shell]\x1b[0m\r\n')
      }
      ws.onerror = () => {
        ws.close()
      }

      const unsubData = term.onData((data) => {
        if (ws.readyState === WebSocket.OPEN) ws.send(data)
      })
      const unsubResize = term.onResize(() => sendSize(ws))

      const ro = new ResizeObserver(() => {
        try {
          fit.fit()
        } catch {
          // ignore
        }
      })
      if (containerRef.current) ro.observe(containerRef.current)

      termRef.current = term
      wsRef.current = ws
      ;(term as unknown as { _cleanup?: () => void })._cleanup = () => {
        unsubData.dispose()
        unsubResize.dispose()
        ro.disconnect()
        try {
          ws.close()
        } catch {
          // ignore
        }
      }
    }, 30)

    return () => {
      clearTimeout(timer)
      try { wsRef.current?.close() } catch { /* ignore */ }
      ;(term as unknown as { _cleanup?: () => void })._cleanup?.()
      term.dispose()
      termRef.current = null
    }
  }, [id, attempt, mode, takeover])

  useEffect(() => {
    graphicalRef.current = mode === 'graphical'
  }, [mode])

  useEffect(() => connect(), [connect])

  // Graphical (SPICE) mode: load the vendored spice-html5 bundle once and
  // connect its main channel to our vga websocket endpoint.
  useEffect(() => {
    if (mode !== 'graphical' || !id) return
    let cancelled = false
    const start = () => {
      const SpiceHtml5 = (window as any).SpiceHtml5
      if (cancelled || !spiceScreenRef.current) return
      const proto = window.location.protocol === 'https:' ? 'wss' : 'ws'
      const uri = `${proto}://${window.location.host}/api/instances/${encodeURIComponent(id)}/console?mode=vga${takeover ? '&takeover=1' : ''}`
      const sc = new SpiceHtml5.SpiceMainConn({
        uri,
        password: '',
        screen_id: 'spice-screen',
        message_id: 'spice-message',
        onerror: (e: Error) => {
          if (!cancelled) {
            setState('closed')
            const msg = e?.message || 'Graphical console failed.'
            if (/already using/i.test(msg)) {
              setTakenCode(4409)
              setReason('Someone is already using this console.')
            } else {
              setReason(msg)
            }
          }
        },
        onagent: () => SpiceHtml5.resize_helper(sc),
      })
      spiceRef.current = sc
      setState('open')
    }
    if ((window as any).SpiceHtml5) {
      start()
    } else {
      const script = document.createElement('script')
      script.src = '/spice-html5/spice-html5.js'
      script.onload = start
      document.head.appendChild(script)
    }
    return () => {
      cancelled = true
      try { spiceRef.current?.stop() } catch { /* ignore */ }
      spiceRef.current = null
      // Clean up spice-screen and any leftover canvases
      const screen = document.getElementById('spice-screen')
      if (screen) screen.replaceChildren()
      const msg = document.getElementById('spice-message')
      if (msg) msg.replaceChildren()
      // Remove any canvases attached anywhere in wrapRef or body
      wrapRef.current?.querySelectorAll('canvas').forEach((c) => c.remove())
      document.querySelectorAll('#spice-screen canvas').forEach((c) => c.remove())
    }
  }, [mode, id, takeover, attempt])

  useEffect(() => {
    const onChange = () => setIsFullscreen(document.fullscreenElement != null)
    document.addEventListener('fullscreenchange', onChange)
    return () => document.removeEventListener('fullscreenchange', onChange)
  }, [])

  async function toggleFullscreen() {
    try {
      if (document.fullscreenElement) {
        await document.exitFullscreen()
      } else {
        await wrapRef.current?.requestFullscreen()
      }
    } catch {
      // Fullscreen unavailable (e.g. permissions policy) — stay embedded.
    }
  }

  return (
    <AppShell title={serverName || 'Console'} description="Built-in terminal.">
      <div className="flex w-full min-w-0 flex-col gap-4 overflow-hidden">
        {/* Top Controls Bar */}
        <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex flex-wrap items-center gap-2 sm:gap-3">
            <Button variant="secondary" size="sm" asChild className="gap-1.5 text-[12px]">
              <Link to={id ? `/servers/${id}` : '/servers'}>
                <ArrowLeft size={14} />
                Back to server
              </Link>
            </Button>
            <div className="flex items-center gap-1.5 min-w-0">
              <Terminal size={16} className="text-fg-subtle shrink-0" aria-hidden />
              <h1 className="truncate font-mono text-[14px] sm:text-[16px] font-bold text-fg max-w-[140px] sm:max-w-[200px]">
                {serverName || 'Console'}
              </h1>
            </div>
            <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-0.5">
              {(
                [
                  { id: 'shell' as const, label: 'Shell' },
                  { id: 'console' as const, label: 'Console' },
                  ...(instanceType === 'kvm' || !instanceType ? [{ id: 'graphical' as const, label: 'Graphical' }] : []),
                ] as const
              ).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => {
                    setMode(m.id)
                    setState('connecting')
                    setReason(null)
                    setTakenCode(null)
                  }}
                  className={cn(
                    'rounded-control px-2 sm:px-2.5 py-1 text-[11px] sm:text-[12px] font-medium transition-colors',
                    mode === m.id ? 'bg-surface-2 text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span
              className={cn(
                'rounded-full border px-2 py-0.5 text-[10px] sm:text-[11px] font-medium flex items-center gap-1.5 shrink-0',
                state === 'open'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : state === 'connecting'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-border bg-surface-2/60 text-fg-subtle',
              )}
            >
              {state === 'connecting' ? <CliSpinner name="dots" className="text-[11px]" /> : null}
              {state === 'open' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Closed'}
            </span>
          </div>

          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void toggleFullscreen()}
              className="flex-1 sm:flex-none gap-1.5 text-[12px]"
            >
              {isFullscreen ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
              disabled={state === 'connecting'}
              className="flex-1 sm:flex-none gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={state === 'connecting' ? 'animate-spin' : ''} />
              Reconnect
            </Button>
          </div>
        </div>

        {reason && state === 'closed' && <Alert tone="warning">{reason}</Alert>}

        <Dialog open={takenCode === 4409 && state === 'closed'} onOpenChange={() => {}}>
          <DialogContent className="max-w-md p-6 text-center" style={{ width: 'min(26rem, calc(100vw - 2rem))' }}>
            <DialogTitle className="text-center text-[15px] font-semibold">Someone is already using this console</DialogTitle>
            <DialogDescription className="mt-2 text-center text-[13px]">
              Another user is connected right now. Taking over will disconnect them.
            </DialogDescription>
            <div className="mt-5 flex gap-3">
              <Button variant="secondary" className="flex-1" onClick={() => setTakenCode(null)}>Cancel</Button>
              <Button
                variant="danger"
                className="flex-1"
                onClick={() => {
                  setTakenCode(null)
                  setTakeover(true)
                  setAttempt((n) => n + 1)
                }}
              >
                Take Over
              </Button>
            </div>
          </DialogContent>
        </Dialog>

        {mode === 'graphical' ? (
          <div className="w-full max-w-full overflow-hidden rounded-panel border border-border bg-black">
            <div id="spice-screen" ref={spiceScreenRef} className="h-[60vh] min-h-[420px] w-full overflow-hidden" />
            <div id="spice-message" ref={spiceMsgRef} className="px-3 py-2 text-[12px] text-fg-subtle" />
          </div>
        ) : (
          <div
            ref={wrapRef}
            className="w-full max-w-full overflow-hidden rounded-panel border border-border bg-[#0d1117] [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
          >
            <div
              ref={containerRef}
              className={
                isFullscreen
                  ? 'h-screen w-full overflow-hidden p-3 [&_.xterm]:h-full [&_.xterm-viewport]:overflow-x-hidden'
                  : 'h-[60vh] min-h-[420px] w-full overflow-hidden p-2 sm:p-3 [&_.xterm]:h-full [&_.xterm-viewport]:overflow-x-hidden'
              }
            />
          </div>
        )}

        <p className="text-[12px] text-fg-subtle">
          {mode === 'shell'
            ? 'Root shell inside the server over an encrypted channel. Idle sessions close after 20 minutes.'
            : mode === 'graphical'
              ? 'Graphical console (SPICE) — full framebuffer, works even before the guest boots. VMs only.'
              : 'Raw serial/text console — boot output and a login prompt. Only one client can hold it; opening it here takes it over from the Incus UI or CLI and releases it when you leave.'}
        </p>
      </div>
    </AppShell>
  )
}
