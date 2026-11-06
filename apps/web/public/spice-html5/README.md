# spice-html5 (vendored)

SPICE (Simple Protocol for Independent Computing Environments) browser client,
vendored for the graphical console. Upstream: `spice-html5` from
gitlab.freedesktop.org/spice/spice-html5 (LGPL-3.0-or-later, see `COPYING` /
`COPYING.LESSER`).

## Files

| File | About |
| --- | --- |
| `spice-html5.js` | Single self-contained IIFE bundle (minified, ~157 kB). No external assets, no other dependencies. |
| `spice.css` | Upstream `spice.css`, verbatim. See the CSS caveat below. |
| `COPYING`, `COPYING.LESSER` | Upstream license texts. |
| `README.md` | This file. |

## How it was built

Upstream ships plain ES modules (entry `src/main.js`, no bundler, no
published npm package — `@spice/spice-html5` / `spice-html5` on npm are
404/unpublished). The bundle was produced with esbuild from a one-line entry
shim that re-exports the module namespace as a global:

```js
// entry.js (build-time only, not shipped)
import * as SpiceHtml5 from './src/main.js';
window.SpiceHtml5 = SpiceHtml5;
```

```sh
git clone --depth 1 https://gitlab.freedesktop.org/spice/spice-html5.git
# upstream commit 85262d0a4f9c0d9996575e0afa57d680fcf5bd6f (2026-11-03)
npx esbuild entry.js --bundle --format=iife --platform=browser \
  --target=es2020 --minify --outfile=spice-html5.js
```

Verified: `node --check spice-html5.js` passes; loading the bundle in Node
(with a `window` stub) exposes all 7 exports and `SpiceMainConn` is a
constructor with a `stop()` method. Target is `es2020` because upstream uses
a BigInt literal (`0n` in `spicemsg.js`) — an `es2019` target warns and may
crash at runtime. No React source files were modified; the bundle is served
statically from `public/` (Vite copies it to `dist/spice-html5/` on build).

## API

Loading `spice-html5.js` with a plain `<script>` tag (no `type="module"`)
sets `window.SpiceHtml5` with exactly these exports:

- `SpiceMainConn` — the connection class (constructor below)
- `sendCtrlAltDel(sc)` — send Ctrl-Alt-Delete through a connection
- `typeText(sc, text)` — type text into the guest
- `resize_helper(sc)` — resize the guest display after the agent connects
- `handle_resize` — window resize handler (imported from upstream)
- `handle_file_dragover`, `handle_file_drop` — drag-and-drop file transfer handlers

### Connecting

`new window.SpiceHtml5.SpiceMainConn(options)` — one instance opens **one**
WebSocket to `options.uri` and speaks the SPICE main channel over it. Child
channels (display, inputs, cursor, playback, ports) are opened by the client
itself, each as a **new WebSocket to the same URI** (`this.ws.url`,
`src/main.js` channel-list handling), carrying the server-assigned session id
in the SPICE link header — so the backend must treat every browser WebSocket
to that URI as one SPICE channel and pass bytes through verbatim. The client
does **not** send a session id it chose: the session id comes from the server
at `MAIN_INIT`; `connection_id` in options defaults to `0` and is not needed
for the main connection.

Options:

| Option | Required | Meaning |
| --- | --- | --- |
| `uri` | yes | WebSocket URI, e.g. `wss://host/api/instances/{id}/console?mode=vga` |
| `password` | yes (may be `""`) | SPICE ticket password |
| `screen_id` | no | DOM id of the element the display canvas is created in |
| `message_id` | no | DOM id of the element for status/error messages |
| `dump_id` | no | DOM id for per-frame debug dumps (debugging only) |
| `onerror` | no | `fn(err)` async error callback (also `try/catch` the constructor) |
| `onsuccess` | no | `fn()` called on successful connect |
| `onagent` | no | `fn()` called when the guest agent connects (call `resize_helper` here) |

`sc.stop()` disconnects and tears down all child channels.

### Minimal usage (React page)

Load statically in `index.html` (or at runtime before creating the
connection), then instantiate from the component:

```html
<script src="/spice-html5/spice-html5.js"></script>
```

```tsx
import { useEffect, useRef } from "react";

export function SpiceConsole({ uri, password }: { uri: string; password: string }) {
  const screenRef = useRef<HTMLDivElement>(null);
  const msgRef = useRef<HTMLDivElement>(null);
  const connRef = useRef<any>(null);

  useEffect(() => {
    const SpiceHtml5 = (window as any).SpiceHtml5;
    const sc = new SpiceHtml5.SpiceMainConn({
      uri,                       // ws(s)://host/api/instances/{id}/console?mode=vga
      password,
      screen_id: screenRef.current!.id,
      message_id: msgRef.current!.id,
      onerror: (e: Error) => console.error("SPICE:", e),
      onagent: () => SpiceHtml5.resize_helper(sc),
    });
    connRef.current = sc;
    return () => sc.stop();
  }, [uri, password]);

  return (
    <>
      <div id="spice-screen" ref={screenRef} className="spice-screen" />
      <div id="spice-message" ref={msgRef} className="spice-message" style={{ display: "none" }} />
    </>
  );
}
```

Adapted from upstream `spice.html`. Note `screen_id`/`message_id` take the
**element id strings**, so ensure the elements have those ids (set `id` on the
divs as above, or assign ids imperatively before constructing).

## Build caveats

- **CSS is global.** `spice.css` styles `body`, `button`, `canvas`, `*`, etc.
  Loading it as-is in the SPA will restyle the whole app. The console page
  should either scope the rules it needs (`.spice-screen`, `.spice-message`,
  `.spice-message-warning`, `.spice-message-error`) or override them — do not
  load the file verbatim app-wide.
- **Single display head.** Multiple display heads are not handled (upstream
  logs a warning and ignores `id != 0`).
- **One WebSocket per channel, same URI.** The backend must accept repeated
  connections to the console URI and map each to the correct SPICE channel;
  the client distinguishes channels by the SPICE link header it sends, not by
  URL.
- **Password is required** in options even when the server has none — pass
  `""`.
- **Modern browser required** (WebSocket with `binaryType`, BigInt).
- Rebuild by re-running the esbuild command above against a fresh upstream
  clone; then re-run `node --check` and the export smoke test.
