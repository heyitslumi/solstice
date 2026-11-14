# Per-node Direct SSH switch

## Intent
Hypervisors without a public IPv4 (NAT'ed, behind a tunnel) hand users an
`ssh -p <port> root@<host>` command that cannot work. Admins need to turn direct SSH off
per node so the panel stops offering it there.

## Goals
- `nodes.direct_ssh boolean NOT NULL DEFAULT true`; editable in the admin node form's
  "System" toggles and through `POST`/`PATCH /api/admin/nodes`.
- Enforced server-side wherever a `kind='ssh'` forward would be created:
  `POST /api/instances`, `POST /api/instances/:id/rebuild`, `POST /api/instances/:id/ssh-forward`.
- `GET /api/instances/:id/ssh-forward` reports `available` so the server dialog explains
  instead of offering a button that will fail.
- `GET /api/config` reports `directSsh` from the default node (the one creation uses), so the
  setup page hides Advanced → Direct SSH.
- Existing forwards are left alone. Flipping the switch off is not retroactive.

## Non-goals
- Tearing down existing SSH forwards (rejected: kills a live access path mid-session).
- Custom (non-SSH) port forwards.
- The browser console and sshx session — they ride the API websocket, no inbound port.
- Per-instance overrides.
- Blocking admin `POST /api/admin/instances`; it never creates a forward.

## Approach (picked)
One column plus guard clauses. `nodeAllowsDirectSsh(nodeId)` returns true when the node row
or `node_id` is missing, so legacy and unassigned instances keep working. The `/api/config`
value comes from `SELECT direct_ssh FROM nodes ORDER BY (name = 'local-incus') DESC, name ASC
LIMIT 1`, defaulting to true with no nodes.

Rejected: cosmetic-only hiding (API stays open, NAT'ed nodes still get broken commands);
teardown-on-toggle (destructive, half-fails when the node is unreachable).

## Builder notes
- `apps/api/src/db.ts`: `ALTER TABLE nodes ADD COLUMN IF NOT EXISTS direct_ssh boolean NOT NULL DEFAULT true;`
  next to the other node ALTERs. Do not touch the `CREATE TABLE nodes` block.
- `apps/api/src/app.ts`: add `n.direct_ssh AS "directSsh"` to `GET /api/admin/nodes`, accept
  `directSsh` in create/update. Rebuild already selects `primary_network` for the node — extend
  that query instead of adding another round trip.
- `apps/web/src/lib/api.ts`: `ApiNode.directSsh?: boolean`, `PublicConfig.directSsh?: boolean`,
  `ssh-forward` response gains `available: boolean`.
- `apps/web/src/pages/server-setup.tsx`: `useAppConfig()`; when `config.directSsh === false`,
  don't render the Direct SSH block (the state default stays true, which the server ignores).
- `apps/web/src/pages/server-detail.tsx`: when `available === false` and there is no forward,
  show "Direct SSH is disabled on this node — use the browser console." in place of the button.
- `apps/web/src/pages/admin-node-form.tsx`: third toggle in the System widget; include
  `directSsh` in the create/update payload and in `handleToggleSystem`.
- Test in `apps/api/src/instances.test.ts`: flip the seeded node to `direct_ssh = false`,
  assert `GET /api/config` returns `directSsh: false`, flip it back. DB-only, no Incus needed.
  (`npm test` needs Postgres, so run it where the DB is reachable.)
- Demo mode: the flag is a boolean, nothing to mask.
