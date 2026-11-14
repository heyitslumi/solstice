# Per-node Direct SSH switch Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let an admin turn direct SSH (the SSH port-forward) off per node, so NAT'ed hypervisors stop handing out unusable `ssh -p` commands.

**Architecture:** One `nodes.direct_ssh` boolean, read through a `nodeAllowsDirectSsh(nodeId)` helper in `apps/api/src/app.ts`. The helper guards the three places a `kind='ssh'` forward is created, feeds `available` on `GET /api/instances/:id/ssh-forward`, and feeds `directSsh` on `GET /api/config` so the web hides the option. Existing forwards are never touched.

**Tech Stack:** Hono on Node 24 (no build step), Postgres via `pg`, React 19 + Vite for the panel.

**Spec:** `docs/superpowers/specs/2026-11-14-node-direct-ssh-design.md`

## Global Constraints

- `apps/api` has no build step; never add `tsc`/`tsx` to its run path.
- `npm run build` (web, `tsc -b` + vite) is the only practical typecheck. `npm run typecheck` is red on `main` — do not use it as a gate.
- `npm test` needs a reachable Postgres with `CREATEDB` on the role in `DATABASE_URL`. On a box without one the suite dies with `ECONNREFUSED`; do not "fix" that by mocking the DB.
- New node columns go in `apps/api/src/db.ts` as `ALTER TABLE nodes ADD COLUMN IF NOT EXISTS …` next to lines 422–428. Do not edit the `CREATE TABLE nodes` block.
- `DEMO_MODE=true` must not leak real addresses; this feature is a boolean and must stay one.
- Follow the existing `summary()`-style conventions: plain SQL strings, `queryOne<T>`, no new dependencies.

## Review Focus

- Node with `direct_ssh = false`, user created a server with **no SSH keys**: creation must succeed with no forward and still email the root password (mail text omits the `ssh -p` line) — not error, not half-insert.
- Instance with `node_id IS NULL` (legacy rows): `nodeAllowsDirectSsh` must return `true`, otherwise those servers silently lose SSH.
- Forward that already exists when the node is flipped off: `GET …/ssh-forward` must keep returning it and `DELETE` must still free the port; only new enables are blocked.
- Install with **zero** node rows: `/api/config` must report `directSsh: true`, not `false`.
- Admin `POST /api/admin/instances` on a disabled node: no forward is created today; the change must not introduce one.

---

### Task 1: Node column and admin API

**Files:**
- Modify: `apps/api/src/db.ts:422-428`
- Modify: `apps/api/src/app.ts:6554-6760` (GET/POST/PATCH `/api/admin/nodes`)
- Test: `apps/api/src/instances.test.ts`

**Interfaces:**
- Consumes: nothing.
- Produces: `nodes.direct_ssh boolean NOT NULL DEFAULT true`; JSON field `directSsh` on every node object returned by `GET /api/admin/nodes`, accepted by `POST /api/admin/nodes` and `PATCH /api/admin/nodes/:id`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/instances.test.ts`, add `query` to the existing `./db.ts` import and append inside the existing `describe`:

```ts
  it('defaults the seeded node to direct SSH enabled', async () => {
    const rows = await query<{ direct_ssh: boolean }>(
      `SELECT direct_ssh FROM nodes WHERE name = 'local-incus'`,
    )
    assert.equal(rows[0]?.direct_ssh, true)
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && node --env-file-if-exists=.env --test src/instances.test.ts`
Expected: FAIL — `column "direct_ssh" does not exist`.

- [ ] **Step 3: Add the column**

In `apps/api/src/db.ts` after the `storage_enabled` ALTER (line 428):

```sql
  ALTER TABLE nodes ADD COLUMN IF NOT EXISTS direct_ssh boolean NOT NULL DEFAULT true;
```

- [ ] **Step 4: Pass the column through the admin API**

In `GET /api/admin/nodes` (line ~6554) add after `n.storage_enabled AS "storageEnabled",`:

```sql
              n.direct_ssh AS "directSsh",
```

In `POST /api/admin/nodes` (line ~6608) extend the column list with `direct_ssh` and the values with `body.directSsh !== false` as the 16th parameter (`$16`).

In `PATCH /api/admin/nodes/:id` (line ~6657), next to the `storageEnabled` branch:

```ts
    if (body.directSsh !== undefined) {
      fields.push(`direct_ssh = $${idx++}`)
      values.push(Boolean(body.directSsh))
    }
```

- [ ] **Step 5: Run test to verify it passes**

Run: `cd apps/api && node --env-file-if-exists=.env --test src/instances.test.ts`
Expected: PASS (all tests in the file).

- [ ] **Step 6: Commit**

```bash
git add apps/api/src/db.ts apps/api/src/app.ts apps/api/src/instances.test.ts
git commit -m "nodes: add direct_ssh flag and admin API field"
```

---

### Task 2: Enforcement and the public config flag

**Files:**
- Modify: `apps/api/src/app.ts:2907-2912` (helper, next to `defaultNodeId`)
- Modify: `apps/api/src/app.ts:3061` (create guard), `apps/api/src/app.ts:3479` (rebuild guard)
- Modify: `apps/api/src/app.ts:4021-4045` (GET ssh-forward), `apps/api/src/app.ts:4046-4060` (POST ssh-forward)
- Modify: `apps/api/src/app.ts:9051-9085` (`GET /api/config`)
- Test: `apps/api/src/instances.test.ts`

**Interfaces:**
- Consumes: `nodes.direct_ssh` from Task 1.
- Produces: `async function nodeAllowsDirectSsh(nodeId: string | null | undefined): Promise<boolean>` inside `createApp`; `available: boolean` on the `GET /api/instances/:id/ssh-forward` body; `directSsh: boolean` on `GET /api/config`.

- [ ] **Step 1: Write the failing test**

In `apps/api/src/instances.test.ts` append inside the existing `describe`:

```ts
  it('reports direct SSH unavailable when the default node disables it', async () => {
    const before = await app.request('/api/config')
    assert.equal((await before.json() as any).directSsh, true)

    await query(`UPDATE nodes SET direct_ssh = false WHERE name = 'local-incus'`)
    try {
      const res = await app.request('/api/config')
      assert.equal(res.status, 200)
      assert.equal((await res.json() as any).directSsh, false)
    } finally {
      await query(`UPDATE nodes SET direct_ssh = true WHERE name = 'local-incus'`)
    }
  })
```

- [ ] **Step 2: Run test to verify it fails**

Run: `cd apps/api && node --env-file-if-exists=.env --test src/instances.test.ts`
Expected: FAIL — `directSsh` is `undefined`.

- [ ] **Step 3: Add the helper**

In `apps/api/src/app.ts` directly after `defaultNodeId()` (line ~2912):

```ts
  /* A node with direct SSH off (NAT'ed hypervisor) must not hand out SSH forwards. */
  async function nodeAllowsDirectSsh(nodeId: string | null | undefined): Promise<boolean> {
    if (!nodeId) return true
    const row = await queryOne<{ direct_ssh: boolean }>('SELECT direct_ssh FROM nodes WHERE id = $1', [nodeId])
    return row?.direct_ssh !== false
  }
```

- [ ] **Step 4: Guard the three creation paths**

In `POST /api/instances`, before the `if (sshPublicKeys.length === 0 || directSsh) {` block (line ~3061), add `const directSshAllowed = await nodeAllowsDirectSsh(nodeId)` and change the condition to `if (directSshAllowed && (sshPublicKeys.length === 0 || directSsh)) {`.

In `POST /api/instances/:id/rebuild`, before its identical block (line ~3479), add `const directSshAllowed = await nodeAllowsDirectSsh(instance.node_id)` and make the same condition change.

In `POST /api/instances/:id/ssh-forward`, after `if (!instance) return c.json({ message: 'Instance not found.' }, 404)` (line ~4053):

```ts
    if (!(await nodeAllowsDirectSsh(instance.node_id))) {
      return c.json(
        { message: 'Direct SSH is disabled on this node. Use the browser console instead.' },
        409,
      )
    }
```

- [ ] **Step 5: Report availability on the read endpoint**

In `GET /api/instances/:id/ssh-forward`, compute `const available = await nodeAllowsDirectSsh(instance.node_id)` before the early return and include `available` in both responses (`{ forward: null, available }` and `{ forward: { … }, available }`).

- [ ] **Step 6: Expose it on `/api/config`**

In `GET /api/config` add to the returned object:

```ts
      directSsh: await nodeAllowsDirectSsh(await defaultNodeId()),
```

- [ ] **Step 7: Run tests to verify they pass**

Run: `cd apps/api && node --env-file-if-exists=.env --test src/instances.test.ts`
Expected: PASS, including the two new tests.

- [ ] **Step 8: Commit**

```bash
git add apps/api/src/app.ts apps/api/src/instances.test.ts
git commit -m "api: enforce per-node direct SSH and expose it in /api/config"
```

---

### Task 3: Panel UI

**Files:**
- Modify: `apps/web/src/lib/api.ts:208` (`PublicConfig`), `:351` (`ApiNode`), `:974` (ssh-forward response)
- Modify: `apps/web/src/lib/config.tsx:6-25` (`DEFAULT_CONFIG`)
- Modify: `apps/web/src/pages/server-setup.tsx:727-737` (Direct SSH block)
- Modify: `apps/web/src/pages/server-detail.tsx:274-279`, `:235-236`, `:1547-1564`
- Modify: `apps/web/src/pages/admin-node-form.tsx:40-60`, `:329-340`, `:435-455`, `:480-495`, `:803-820`

**Interfaces:**
- Consumes: `directSsh` on `/api/config` and on node objects; `available` on the ssh-forward response (Task 2).
- Produces: no new exported API; the panel hides the Direct SSH controls when the node disallows them.

- [ ] **Step 1: Types and defaults**

`apps/web/src/lib/api.ts`: add `directSsh?: boolean` to `PublicConfig` and `ApiNode`; change the `getSshForward` return type to `{ forward: { host: string; hostPort: number; containerPort: number; username: string } | null; available: boolean }`.

`apps/web/src/lib/config.tsx`: add `directSsh: true,` to `DEFAULT_CONFIG`.

- [ ] **Step 2: Hide the option in server setup**

In `server-setup.tsx` import `useAppConfig` from `@/lib/config`, call `const { config } = useAppConfig()` in the component, and wrap the Advanced → Direct SSH panel (the `<div className="mt-3 rounded-panel …">` block containing "Direct SSH") in `{config.directSsh !== false && ( … )}`.

- [ ] **Step 3: Explain it in the SSH dialog**

In `server-detail.tsx` add `const [sshAvailable, setSshAvailable] = useState(true)`, set it from `fwdRes.data.available` in `loadAll` (line ~236), and in the `!sshForward` branch render this instead of the paragraph + button when `!sshAvailable`:

```tsx
<p className="text-[12px] text-fg-subtle">
  Direct SSH is disabled on this node — use the browser console below.
</p>
```

- [ ] **Step 4: Admin toggle**

In `admin-node-form.tsx`: add `const [directSsh, setDirectSsh] = useState(true)`, load it with `setDirectSsh(found.directSsh !== false)`, include `directSsh` in the create/update `payload`, widen `handleToggleSystem` to `key: 'maintenance' | 'isPublic' | 'directSsh'` (setting state and PATCHing `{ [key]: nextVal }`), and add a fourth row to the System widget:

```tsx
<div className="flex items-center justify-between">
  <span className="text-[12px] font-medium text-fg">Direct SSH</span>
  <button type="button" disabled={updatingSystem} onClick={() => handleToggleSystem('directSsh', !directSsh)} …same classes as the isPublic toggle…>
```

Label the toggle row "Direct SSH" and give the label `title="Off for NAT'ed nodes without a public IPv4"`.

- [ ] **Step 5: Build**

Run: `npm run build`
Expected: `tsc -b` and vite finish with no errors.

- [ ] **Step 6: Commit**

```bash
git add apps/web/src/lib/api.ts apps/web/src/lib/config.tsx apps/web/src/pages/server-setup.tsx apps/web/src/pages/server-detail.tsx apps/web/src/pages/admin-node-form.tsx
git commit -m "web: hide direct SSH on nodes that disable it"
```

---

### Task 4: End-to-end check on a real install

**Files:** none.

**Interfaces:**
- Consumes: everything above, deployed.

- [ ] **Step 1: Deploy to the demo box**

Run on elysia: `cd /opt/solstice && git pull --ff-only && npm run build && systemctl restart solstice-web solstice-api`
Expected: both services active; `curl -s localhost:8788/api/config | grep directSsh` shows `"directSsh":true`.

- [ ] **Step 2: Flip the node off and back**

In the panel (admin → node → System → Direct SSH off), then:
- `GET /api/config` returns `directSsh: false`
- the setup page no longer shows Advanced → Direct SSH
- an existing server's SSH dialog still shows its command, and a server without a forward shows the disabled note
- create a server **without** SSH keys on that node: it must finish, email the password, and have no `ssh -p` line (this is the review-focus case no automated test covers)
- an instance with `node_id = NULL` (if the demo box has one) keeps working as before

Flip it back on and confirm the controls return.

- [ ] **Step 3: Commit any fixups, then push**

```bash
git push origin main
```
