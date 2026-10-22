import { ArrowLeft, Copy, DownloadSimple, FloppyDisk, LinkSimple } from '@phosphor-icons/react'
import { useEffect, useState } from 'react'
import { useNavigate, useParams } from 'react-router-dom'

import { AppShell } from '@/components/app-shell'
import { Alert } from '@/components/ui/alert'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { api } from '@/lib/api'
import { useAppConfig } from '@/lib/config'

const inputClass =
  'mt-1.5 h-10 w-full rounded-control border border-field-border bg-field px-3 font-mono text-[13px] text-fg placeholder:text-fg-subtle focus:border-accent focus:outline-none'

function Field({
  label,
  required,
  hint,
  children,
}: {
  label: string
  required?: boolean
  hint?: string
  children: React.ReactNode
}) {
  return (
    <div>
      <label className="text-[12px] font-semibold text-fg">
        {label} {required && <span className="text-danger">*</span>}
      </label>
      {children}
      {hint && <span className="mt-1 block text-[11px] text-fg-subtle">{hint}</span>}
    </div>
  )
}

export function AdminOAuthProviderFormPage() {
  const navigate = useNavigate()
  const { config } = useAppConfig()
  const { id } = useParams<{ id: string }>()
  const isEdit = Boolean(id)

  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [clientId, setClientId] = useState('')
  const [clientSecret, setClientSecret] = useState('')
  const [authUrl, setAuthUrl] = useState('')
  const [tokenUrl, setTokenUrl] = useState('')
  const [infoUrl, setInfoUrl] = useState('')
  const [basicAuth, setBasicAuth] = useState(false)
  const [scopes, setScopes] = useState('openid email profile')
  const [identifierPath, setIdentifierPath] = useState('$.sub')
  const [emailPath, setEmailPath] = useState('$.email')
  const [usernamePath, setUsernamePath] = useState('')
  const [firstNamePath, setFirstNamePath] = useState('$.given_name')
  const [lastNamePath, setLastNamePath] = useState('$.family_name')
  const [avatarUrlTemplate, setAvatarUrlTemplate] = useState('')
  const [overwriteAvatars, setOverwriteAvatars] = useState(false)
  const [loginOnly, setLoginOnly] = useState(false)
  const [linkViewable, setLinkViewable] = useState(true)
  const [userManageable, setUserManageable] = useState(true)
  const [enabled, setEnabled] = useState(true)

  const [loading, setLoading] = useState(isEdit)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  useEffect(() => {
    if (!id) return
    let active = true
    async function fetchProvider() {
      setLoading(true)
      const res = await api.adminListOAuthProviders()
      if (!active) return
      if (res.ok) {
        const found = res.data.find((p) => p.id === id)
        if (found) {
          setName(found.name)
          setDescription(found.description || '')
          setClientId(found.clientId || '')
          setAuthUrl(found.authUrl || '')
          setTokenUrl(found.tokenUrl || '')
          setInfoUrl(found.infoUrl || '')
          setBasicAuth(found.basicAuth)
          setScopes(found.scopes || '')
          setIdentifierPath(found.identifierPath || '$.sub')
          setEmailPath(found.emailPath || '$.email')
          setUsernamePath(found.usernamePath || '')
          setFirstNamePath(found.firstNamePath || '')
          setLastNamePath(found.lastNamePath || '')
          setAvatarUrlTemplate(found.avatarUrlTemplate || '')
          setOverwriteAvatars(found.overwriteAvatars)
          setLoginOnly(found.loginOnly)
          setLinkViewable(found.linkViewable)
          setUserManageable(found.userManageable)
          setEnabled(found.enabled)
        } else {
          setError('Provider not found.')
        }
      } else {
        setError(res.error.message || 'Failed to load provider.')
      }
      setLoading(false)
    }
    void fetchProvider()
    return () => {
      active = false
    }
  }, [id])

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setSaving(true)
    setError(null)

    const payload = {
      name: name.trim(),
      description: description.trim(),
      clientId: clientId.trim(),
      ...(clientSecret.trim() ? { clientSecret: clientSecret.trim() } : {}),
      authUrl: authUrl.trim(),
      tokenUrl: tokenUrl.trim(),
      infoUrl: infoUrl.trim(),
      basicAuth,
      scopes: scopes.trim(),
      identifierPath: identifierPath.trim() || '$.sub',
      emailPath: emailPath.trim(),
      usernamePath: usernamePath.trim(),
      firstNamePath: firstNamePath.trim(),
      lastNamePath: lastNamePath.trim(),
      avatarUrlTemplate: avatarUrlTemplate.trim(),
      overwriteAvatars,
      loginOnly,
      linkViewable,
      userManageable,
      enabled,
    }

    const res =
      isEdit && id
        ? await api.adminUpdateOAuthProvider(id, payload)
        : await api.adminCreateOAuthProvider(payload)

    if (res.ok) {
      navigate('/admin/oauth-providers')
    } else {
      setError(res.error.message || 'Failed to save provider.')
    }
    setSaving(false)
  }

  // Matches the redirect_uri the API sends: the configured panel URL
  // (DB `app_url`), not the browser's current origin.
  const panelOrigin = (config.url || window.location.origin).replace(/\/+$/, '')
  const redirectUrl = isEdit && id ? `${panelOrigin}/api/auth/oauth/${id}` : null

  // Export mirrors the Calagopus provider file shape. Client credentials are
  // never included, so an imported file needs them set before use.
  function exportDocument() {
    return {
      name: name.trim(),
      description: description.trim() || null,
      auth_url: authUrl.trim(),
      token_url: tokenUrl.trim(),
      info_url: infoUrl.trim(),
      scopes: scopes.trim() ? scopes.trim().split(/\s+/) : [],
      identifier_path: identifierPath.trim() || '$.sub',
      email_path: emailPath.trim() || null,
      username_path: usernamePath.trim() || null,
      name_first_path: firstNamePath.trim() || null,
      name_last_path: lastNamePath.trim() || null,
      avatar_url_template: avatarUrlTemplate.trim() || null,
      avatar_overwrite: overwriteAvatars,
      enabled,
      login_only: loginOnly,
      login_bypass_two_factor: false,
      link_viewable: linkViewable,
      user_manageable: userManageable,
      basic_auth: basicAuth,
    }
  }

  function yamlScalar(value: string | null): string {
    if (value === null) return 'null'
    if (/[:#\n\r\[\]{},&*!|>'"%@`]|^\s|\s$/.test(value)) {
      return `'${value.replace(/'/g, "''")}'`
    }
    return value === '' ? "''" : value
  }

  function exportYaml(doc: Record<string, unknown>): string {
    const lines: string[] = []
    for (const [key, value] of Object.entries(doc)) {
      if (Array.isArray(value)) {
        lines.push(`${key}:`)
        for (const item of value) lines.push(`  - ${yamlScalar(String(item))}`)
      } else if (typeof value === 'boolean') {
        lines.push(`${key}: ${value ? 'true' : 'false'}`)
      } else if (value === null) {
        lines.push(`${key}: null`)
      } else {
        lines.push(`${key}: ${yamlScalar(String(value))}`)
      }
    }
    return lines.join('\n') + '\n'
  }

  function downloadExport(format: 'json' | 'yaml') {
    const doc = exportDocument()
    const content = format === 'json' ? JSON.stringify(doc, null, 2) + '\n' : exportYaml(doc)
    const blob = new Blob([content], {
      type: format === 'json' ? 'application/json' : 'text/yaml',
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `${name.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-') || 'provider'}.${format === 'json' ? 'json' : 'yml'}`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <AppShell
      title={isEdit ? 'Edit OAuth Provider' : 'New OAuth Provider'}
      description="Register an external OAuth2 service for login and account linking."
    >
      <div className="flex w-full flex-col gap-6">
        <div className="flex items-center gap-4">
          <Button
            variant="secondary"
            size="sm"
            onClick={() => navigate('/admin/oauth-providers')}
            className="gap-1.5 text-[12px]"
          >
            <ArrowLeft size={14} />
            Back to Providers
          </Button>
          <div className="flex items-center gap-2">
            <span className="font-mono text-[11px] uppercase tracking-wider text-fg-subtle">
              Users &amp; Access
            </span>
            <span className="text-fg-subtle/50">/</span>
            <span className="text-[12px] font-medium text-fg">
              {isEdit ? 'Edit Provider' : 'New Provider'}
            </span>
          </div>
        </div>

        <div>
          <h1 className="text-[26px] font-bold tracking-tight text-fg">
            {isEdit ? `Edit Provider: ${name || 'OAuth'}` : 'Register OAuth Provider'}
          </h1>
          <p className="mt-0.5 text-[13px] text-fg-subtle">
            Works with Discord, GitHub, Google, or any OIDC-compliant service.
          </p>
        </div>

        {error && <Alert tone="danger">{error}</Alert>}

        {loading ? (
          <div className="rounded-panel border border-border bg-surface p-12 text-center text-[13px] text-fg-subtle">
            Loading provider...
          </div>
        ) : (
          <form
            onSubmit={handleSubmit}
            className="flex flex-col gap-6 rounded-panel border border-border bg-surface p-6 shadow-2xs"
          >
            {/* Redirect URL card */}
            <div className="flex flex-col gap-2 rounded-control border border-border bg-surface-2/30 p-4">
              <div className="flex items-center gap-2 text-[12px] font-semibold text-fg">
                <LinkSimple size={14} />
                Redirect URL
              </div>
              {redirectUrl ? (
                <div className="flex items-center gap-2">
                  <code className="flex-1 truncate rounded-control border border-field-border bg-field px-3 py-2 font-mono text-[12px] text-fg">
                    {redirectUrl}
                  </code>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => {
                      void navigator.clipboard.writeText(redirectUrl)
                      setCopied(true)
                      setTimeout(() => setCopied(false), 2000)
                    }}
                    className="gap-1.5"
                  >
                    <Copy size={14} />
                    {copied ? 'Copied' : 'Copy'}
                  </Button>
                </div>
              ) : (
                <p className="text-[12px] text-fg-subtle">
                  Available after creation — register this callback URL with the external provider.
                </p>
              )}
            </div>

            {/* Identity */}
            <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
              <Field label="Name" required>
                <input
                  type="text"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Discord"
                  className={inputClass}
                />
              </Field>
              <Field label="Description" hint="Shown next to the sign-in button.">
                <input
                  type="text"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Sign in with your Discord account"
                  className={inputClass}
                />
              </Field>
            </div>

            {/* Credentials */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Credentials &amp; Endpoints</h2>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Client ID" required>
                  <input
                    type="text"
                    required={!isEdit}
                    value={clientId}
                    onChange={(e) => setClientId(e.target.value)}
                    placeholder="abc123..."
                    className={inputClass}
                  />
                </Field>
                <Field
                  label="Client Secret"
                  required={!isEdit}
                  hint={isEdit ? 'Leave blank to keep the stored secret.' : undefined}
                >
                  <input
                    type="password"
                    required={!isEdit}
                    value={clientSecret}
                    onChange={(e) => setClientSecret(e.target.value)}
                    placeholder={isEdit ? '•••••••• (unchanged)' : 'shh...'}
                    className={inputClass}
                  />
                </Field>
                <Field label="Auth URL" required hint="Authorization endpoint.">
                  <input
                    type="url"
                    required
                    value={authUrl}
                    onChange={(e) => setAuthUrl(e.target.value)}
                    placeholder="https://discord.com/oauth2/authorize"
                    className={inputClass}
                  />
                </Field>
                <Field label="Token URL" required hint="Token exchange endpoint.">
                  <input
                    type="url"
                    required
                    value={tokenUrl}
                    onChange={(e) => setTokenUrl(e.target.value)}
                    placeholder="https://discord.com/api/oauth2/token"
                    className={inputClass}
                  />
                </Field>
                <div className="md:col-span-2">
                  <Field label="Info URL" required hint="User profile (user-info) endpoint.">
                    <input
                      type="url"
                      required
                      value={infoUrl}
                      onChange={(e) => setInfoUrl(e.target.value)}
                      placeholder="https://discord.com/api/users/@me"
                      className={inputClass}
                    />
                  </Field>
                </div>
                <Field label="Scopes" hint="Space-separated, include email + profile scopes.">
                  <input
                    type="text"
                    value={scopes}
                    onChange={(e) => setScopes(e.target.value)}
                    placeholder="openid email profile"
                    className={inputClass}
                  />
                </Field>
                <div className="flex items-end pb-1">
                  <label className="flex items-start gap-3 cursor-pointer select-none">
                    <div className="pt-0.5">
                      <Checkbox
                        checked={basicAuth}
                        onCheckedChange={(checked) => setBasicAuth(checked === true)}
                      />
                    </div>
                    <div className="flex flex-col">
                      <span className="text-[13px] font-medium text-fg">Basic Auth</span>
                      <span className="text-[11px] text-fg-subtle">
                        Send client ID and secret via HTTP Basic Auth.
                      </span>
                    </div>
                  </label>
                </div>
              </div>
            </div>

            {/* Profile mapping */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Profile Mapping</h2>
              <p className="mt-0.5 text-[11px] text-fg-subtle">
                JSONPath expressions evaluated against the Info URL response.
              </p>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <Field label="Identifier Path" required hint="Unique user ID, e.g. $.sub or $.id.">
                  <input
                    type="text"
                    required
                    value={identifierPath}
                    onChange={(e) => setIdentifierPath(e.target.value)}
                    placeholder="$.sub"
                    className={inputClass}
                  />
                </Field>
                <Field label="Email Path" hint="Used to match and register accounts.">
                  <input
                    type="text"
                    value={emailPath}
                    onChange={(e) => setEmailPath(e.target.value)}
                    placeholder="$.email"
                    className={inputClass}
                  />
                </Field>
                <Field label="Username Path">
                  <input
                    type="text"
                    value={usernamePath}
                    onChange={(e) => setUsernamePath(e.target.value)}
                    placeholder="$.preferred_username"
                    className={inputClass}
                  />
                </Field>
                <Field label="Avatar URL Template" hint="e.g. {$.picture} or a URL with {$.id} parts.">
                  <input
                    type="text"
                    value={avatarUrlTemplate}
                    onChange={(e) => setAvatarUrlTemplate(e.target.value)}
                    placeholder="{$.picture}"
                    className={inputClass}
                  />
                </Field>
                <Field label="First Name Path">
                  <input
                    type="text"
                    value={firstNamePath}
                    onChange={(e) => setFirstNamePath(e.target.value)}
                    placeholder="$.given_name"
                    className={inputClass}
                  />
                </Field>
                <Field label="Last Name Path">
                  <input
                    type="text"
                    value={lastNamePath}
                    onChange={(e) => setLastNamePath(e.target.value)}
                    placeholder="$.family_name"
                    className={inputClass}
                  />
                </Field>
              </div>
              <label className="mt-4 flex items-start gap-3 cursor-pointer select-none">
                <div className="pt-0.5">
                  <Checkbox
                    checked={overwriteAvatars}
                    onCheckedChange={(checked) => setOverwriteAvatars(checked === true)}
                  />
                </div>
                <div className="flex flex-col">
                  <span className="text-[13px] font-medium text-fg">Overwrite Existing Avatars</span>
                  <span className="text-[11px] text-fg-subtle">
                    Replace user-uploaded avatars on every login. Otherwise only users without an
                    avatar get one.
                  </span>
                </div>
              </label>
            </div>

            {/* Behavior flags */}
            <div className="border-t border-border pt-6">
              <h2 className="text-[15px] font-semibold text-fg">Behavior</h2>
              <div className="mt-4 grid grid-cols-1 gap-5 md:grid-cols-2">
                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={loginOnly}
                      onCheckedChange={(checked) => setLoginOnly(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Only allow Login</span>
                    <span className="text-[11px] text-fg-subtle">
                      Existing links can sign in, but sign-in never registers a new account.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={linkViewable}
                      onCheckedChange={(checked) => setLinkViewable(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Link Viewable to User</span>
                    <span className="text-[11px] text-fg-subtle">
                      Users can see the connection and its identifier in their settings.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={userManageable}
                      onCheckedChange={(checked) => setUserManageable(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Link Manageable by User</span>
                    <span className="text-[11px] text-fg-subtle">
                      Users can connect and disconnect this provider themselves.
                    </span>
                  </div>
                </label>

                <label className="flex items-start gap-3 cursor-pointer select-none">
                  <div className="pt-0.5">
                    <Checkbox
                      checked={enabled}
                      onCheckedChange={(checked) => setEnabled(checked === true)}
                    />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-[13px] font-medium text-fg">Enabled</span>
                    <span className="text-[11px] text-fg-subtle">
                      Whether this provider can be used at all.
                    </span>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex items-center justify-end gap-3 border-t border-border pt-4">
              {isEdit ? (
                <>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => downloadExport('json')}
                    className="gap-1.5"
                  >
                    <DownloadSimple size={16} />
                    Export JSON
                  </Button>
                  <Button
                    type="button"
                    variant="secondary"
                    onClick={() => downloadExport('yaml')}
                    className="gap-1.5"
                  >
                    <DownloadSimple size={16} />
                    Export YAML
                  </Button>
                </>
              ) : null}
              <Button
                type="button"
                variant="secondary"
                onClick={() => navigate('/admin/oauth-providers')}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button type="submit" variant="primary" disabled={saving} className="gap-1.5">
                <FloppyDisk size={16} />
                {saving ? 'Saving...' : isEdit ? 'Update Provider' : 'Create Provider'}
              </Button>
            </div>
          </form>
        )}
      </div>
    </AppShell>
  )
}
