import '@xterm/xterm/css/xterm.css'

import { ArrowLeft, ArrowClockwise, ArrowsIn, ArrowsOut, Terminal } from '@phosphor-icons/react'
import { FitAddon } from '@xterm/addon-fit'
import { Terminal as XTerm } from '@xterm/xterm'
import { useCallback, useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { api } from '@/lib/api'
import { cn } from '@/lib/utils'

type ConnState = 'connecting' | 'open' | 'closed'

const CLOSE_REASONS: Record<number, string> = {
  4401: 'Not signed in — sign in again and retry.',
  4404: 'Server not found.',
  4408: 'Closed after 20 minutes idle.',
  4410: 'Start the server first.',
  4500: 'Could not open a shell inside the server.',
}

export function ServerConsolePage() {
  const { id } = useParams<{ id: string }>()
  const [serverName, setServerName] = useState('')
  const [state, setState] = useState<ConnState>('connecting')
  const [reason, setReason] = useState<string | null>(null)
  const [attempt, setAttempt] = useState(0)
  const [mode, setMode] = useState<'shell' | 'console'>('shell')
  const containerRef = useRef<HTMLDivElement>(null)
  const wrapRef = useRef<HTMLDivElement>(null)
  const [isFullscreen, setIsFullscreen] = useState(false)
  const termRef = useRef<XTerm | null>(null)
  const wsRef = useRef<WebSocket | null>(null)

  useEffect(() => {
    if (!id) return
    void api.getInstance(id).then((res) => {
      if (res.ok) setServerName(res.data.instance.name)
    })
  }, [id])

  const connect = useCallback(() => {
    if (!id || !containerRef.current) return
    setState('connecting')
    setReason(null)

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
        `${proto}://${window.location.host}/api/instances/${encodeURIComponent(id)}/console?mode=${mode}&cols=${term.cols}&rows=${term.rows}`,
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
        setState('closed')
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
      ;(term as unknown as { _cleanup?: () => void })._cleanup?.()
      term.dispose()
      termRef.current = null
    }
  }, [id, attempt, mode])

  useEffect(() => connect(), [connect])

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
      <div className="flex w-full flex-col gap-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <Button variant="secondary" size="sm" asChild className="gap-1.5 text-[12px]">
              <Link to={id ? `/servers/${id}` : '/servers'}>
                <ArrowLeft size={14} />
                Back to server
              </Link>
            </Button>
            <div className="flex items-center gap-2">
              <Terminal size={16} className="text-fg-subtle" aria-hidden />
              <h1 className="truncate font-mono text-[16px] font-bold text-fg">
                {serverName || 'Console'}
              </h1>
            </div>
            <div className="flex items-center gap-1 rounded-control border border-border bg-surface p-0.5">
              {([
                { id: 'shell', label: 'Shell' },
                { id: 'console', label: 'Console' },
              ] as const).map((m) => (
                <button
                  key={m.id}
                  type="button"
                  onClick={() => setMode(m.id)}
                  className={cn(
                    'rounded-control px-2.5 py-1 text-[12px] font-medium transition-colors',
                    mode === m.id ? 'bg-surface-2 text-fg shadow-xs' : 'text-fg-subtle hover:text-fg',
                  )}
                >
                  {m.label}
                </button>
              ))}
            </div>
            <span
              className={cn(
                'rounded-full border px-2.5 py-0.5 text-[11px] font-medium',
                state === 'open'
                  ? 'border-emerald-500/30 bg-emerald-500/10 text-emerald-600 dark:text-emerald-400'
                  : state === 'connecting'
                    ? 'border-amber-500/30 bg-amber-500/10 text-amber-600 dark:text-amber-400'
                    : 'border-border bg-surface-2/60 text-fg-subtle',
              )}
            >
              {state === 'open' ? 'Connected' : state === 'connecting' ? 'Connecting...' : 'Closed'}
            </span>

          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => void toggleFullscreen()}
              className="gap-1.5 text-[12px]"
            >
              {isFullscreen ? <ArrowsIn size={14} /> : <ArrowsOut size={14} />}
              {isFullscreen ? 'Exit Fullscreen' : 'Fullscreen'}
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setAttempt((n) => n + 1)}
              disabled={state === 'connecting'}
              className="gap-1.5 text-[12px]"
            >
              <ArrowClockwise size={14} className={state === 'connecting' ? 'animate-spin' : ''} />
              Reconnect
            </Button>
          </div>
        </div>

        {reason && state === 'closed' && <Alert tone="warning">{reason}</Alert>}

        <div
          ref={wrapRef}
          className="overflow-hidden rounded-panel border border-border bg-[#0d1117] [&:fullscreen]:rounded-none [&:fullscreen]:border-0"
        >
          <div
            ref={containerRef}
            className={
              isFullscreen
                ? 'h-screen w-full p-3 [&_.xterm]:h-full'
                : 'h-[60vh] min-h-[420px] w-full p-3 [&_.xterm]:h-full'
            }
          />
        </div>

        <p className="text-[12px] text-fg-subtle">
          {mode === 'shell'
            ? 'Root shell inside the server over an encrypted channel. Idle sessions close after 20 minutes.'
            : 'Raw serial/text console — boot output and a login prompt. Only one client can hold it; opening it here takes it over from the Incus UI or CLI and releases it when you leave.'}
        </p>
      </div>
    </AppShell>
  )
}
