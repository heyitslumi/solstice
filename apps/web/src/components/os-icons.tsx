import React from 'react'

export interface OsIconProps extends React.SVGProps<SVGSVGElement> {
  size?: number | string
  className?: string
}

export function WindowsIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M3 5.5 10.5 4.4v7.1H3V5.5zm8.5-1.3L21 2.5v9H11.5V4.2zm-8.5 8.3h7.5v7.1L3 18.5v-6zm8.5 0H21v9l-9.5-1.7v-7.3z" />
    </svg>
  )
}

export function AlpineIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12.9 6.8 17.5 15h-3.2l-2.9-5.3-2 3.6 1.6 3H7.8l3.6-6.6 1.5 2.7zM2.8 18.5 9 7.2l3 5.4-1.9 3.5H4.2l-1.4 2.4zm10.7-1.1 1.7 3.1h5.8l-4.6-8.3-2.9 5.2z" />
    </svg>
  )
}

export function FreeBsdIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2C6.48 2 2 6.48 2 12c0 4.09 2.47 7.61 6 9.15V19.1c-2.4-.95-4-3.15-4-5.6 0-3.31 2.69-6 6-6s6 2.69 6 6c0 2.45-1.6 4.65-4 5.6v2.05c3.53-1.54 6-5.06 6-9.15 0-5.52-4.48-10-10-10zm-3 8a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm6 0a1.5 1.5 0 1 0 0 3 1.5 1.5 0 0 0 0-3zm-6.2 5.5c.6 1.2 1.8 2 3.2 2s2.6-.8 3.2-2H8.8z" />
    </svg>
  )
}

export function FedoraIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm3.8 6.5a2.7 2.7 0 0 1 2.7 2.7v.5h-2.5v-.5a.2.2 0 0 0-.2-.2 1.3 1.3 0 0 0-1.3 1.3v1.7h4v2.5h-4v5h-2.5v-5h-1.5v-2.5h1.5v-1.7a3.8 3.8 0 0 1 3.8-3.8zm-7.6 3.8v1.7h-1.5v2.5h1.5v5h2.5v-5h4v-2.5h-4v-1.7a1.3 1.3 0 0 1 1.3-1.3.2.2 0 0 1 .2.2v.5h2.5v-.5a2.7 2.7 0 0 0-2.7-2.7 3.8 3.8 0 0 0-3.8 3.8z" />
    </svg>
  )
}

export function UbuntuIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <circle cx="12" cy="12" r="10" fill="none" stroke="currentColor" strokeWidth="2" />
      <circle cx="12" cy="5" r="1.5" />
      <circle cx="6" cy="15.5" r="1.5" />
      <circle cx="18" cy="15.5" r="1.5" />
      <path d="M12 8a4 4 0 0 0-3.5 2M8 14a4 4 0 0 0 4 2M15.5 10a4 4 0 0 1 0 4" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
    </svg>
  )
}

export function AlmaLinuxIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2C6.5 2 2 6.5 2 12s4.5 10 10 10 10-4.5 10-10S17.5 2 12 2zm1 4.5a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5-2.5A2.5 2.5 0 0 1 13 6.5zM7.5 10A2.5 2.5 0 0 1 10 12.5 2.5 2.5 0 0 1 7.5 15 2.5 2.5 0 0 1 5 12.5 2.5 2.5 0 0 1 7.5 10zm9 0a2.5 2.5 0 0 1 2.5 2.5 2.5 2.5 0 0 1-2.5 2.5 2.5 2.5 0 0 1-2.5-2.5 2.5 2.5 0 0 1 2.5-2.5zm-5.5 4.5A2.5 2.5 0 0 1 13.5 17a2.5 2.5 0 0 1-2.5 2.5A2.5 2.5 0 0 1 8.5 17a2.5 2.5 0 0 1 2.5-2.5z" />
    </svg>
  )
}

export function RockyLinuxIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2A10 10 0 0 0 2 12a10 10 0 0 0 10 10 10 10 0 0 0 10-10A10 10 0 0 0 12 2zm-.2 3.8c1.3 0 2.5.4 3.5 1.2l-5.6 5.6-2-2 4.1-4.8zm-5.6 3.7 2.4 2.4-4 4A8.2 8.2 0 0 1 6.2 9.5zm5.9 8.7a8.2 8.2 0 0 1-4.8-1.5l5.8-5.8 2.2 2.2-3.2 5.1zm4.8-3.1-2.4-2.4 3.7-3.7c.6 1 .9 2.2.9 3.5a8.2 8.2 0 0 1-2.2 2.6z" />
    </svg>
  )
}

export function CentOsIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2.5 8.5 6h7L12 2.5zM6 8.5 2.5 12 6 15.5v-7zm12 0v7l3.5-3.5L18 8.5zM8.5 18l3.5 3.5 3.5-3.5h-7zM7.5 7.5h4v4h-4v-4zm5 0h4v4h-4v-4zm-5 5h4v4h-4v-4zm5 0h4v4h-4v-4z" />
    </svg>
  )
}

export function DebianIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12.5 2.1c-4.4.2-8.1 3-9.5 6.9-1.2 3.4-.6 7.3 1.5 10.2 2.5 3.4 6.7 5 10.7 4.1 3.5-.8 6.4-3.5 7.4-6.9 1-3.4.1-7.2-2.3-9.8-1.9-2.1-4.7-3.4-7.8-3.5v1.8c2.4.1 4.7 1.2 6.2 2.9 1.9 2.2 2.5 5.3 1.7 8.1-.8 2.8-3.2 4.9-6 5.6-3.3.7-6.8-.5-8.8-3.3-1.8-2.4-2.2-5.7-1.1-8.5 1.1-3 4-5.3 7.2-5.7V2.1zm-.5 4.9c-2.3.2-4.3 1.8-4.9 4-.6 2.1.2 4.4 2 5.7 1.7 1.2 4 .1.1 5.4-.5 1.2-.5 2.7-1.4 3.7.8.2 1.6-.2 2.2-.7 1.1-1 1.4-2.6 1-4-.3-1.1-1.2-1.9-2.2-2.4-1.2-.6-1.7-1.9-1.4-3.1.3-1.1 1.4-1.9 2.5-1.9 1.2 0 2.2.8 2.5 2 .2.7 0 1.5-.5 2l1.3.9c.9-.9 1.2-2.3.8-3.5-.6-1.8-2.3-3.1-4.3-3.2z" />
    </svg>
  )
}

export function LinuxIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2c-2.2 0-3.8 1.8-3.8 4.2 0 1 .3 2.5.5 3.3-1.2.6-2.5 2.3-2.5 4.5 0 2.5 1.5 4.2 3.8 4.8-.8 1-1.5 2-1.5 2.7 0 .8 1.5 1.5 3.5 1.5s3.5-.7 3.5-1.5c0-.7-.7-1.7-1.5-2.7 2.3-.6 3.8-2.3 3.8-4.8 0-2.2-1.3-3.9-2.5-4.5.2-.8.5-2.3.5-3.3C15.8 3.8 14.2 2 12 2zm-1.2 4.5c.4 0 .8.4.8.9s-.4.9-.8.9-.8-.4-.8-.9.4-.9.8-.9zm2.4 0c.4 0 .8.4.8.9s-.4.9-.8.9-.8-.4-.8-.9.4-.9.8-.9zm-1.2 2.5c.8 0 1.2.4 1.2.8 0 .5-.7 1.2-1.2 1.2s-1.2-.7-1.2-1.2c0-.4.4-.8 1.2-.8z" />
    </svg>
  )
}

export function OpenSuseIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <path d="M12 2a10 10 0 1 0 10 10A10 10 0 0 0 12 2zm1 4.5c2.5 0 4.5 1.8 4.5 4a3.8 3.8 0 0 1-1.5 3c-.5.4-1.2.7-2 .9v-1.6c.5-.1.9-.3 1.2-.6a2.2 2.2 0 0 0 .8-1.7c0-1.4-1.3-2.5-3-2.5s-3 1.1-3 2.5c0 .7.3 1.3.8 1.7.3.3.7.5 1.2.6v1.6c-.8-.2-1.5-.5-2-.9a3.8 3.8 0 0 1-1.5-3c0-2.2 2-4 4.5-4zM8 17.5a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0zm5 0a1.5 1.5 0 1 1 3 0 1.5 1.5 0 0 1-3 0z" />
    </svg>
  )
}

export function OracleIcon({ size = 20, className, ...props }: OsIconProps) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" className={className} {...props}>
      <rect x="3" y="6" width="18" height="12" rx="6" fill="none" stroke="currentColor" strokeWidth="2.5" />
    </svg>
  )
}

export interface OsLogoDef {
  label: string
  component: React.ComponentType<OsIconProps>
  color: string
}

export const OS_LOGOS: Record<string, OsLogoDef> = {
  windows: { label: 'Windows', component: WindowsIcon, color: 'text-sky-500' },
  alpine: { label: 'Alpine Linux', component: AlpineIcon, color: 'text-sky-400' },
  freebsd: { label: 'FreeBSD', component: FreeBsdIcon, color: 'text-rose-500' },
  fedora: { label: 'Fedora', component: FedoraIcon, color: 'text-blue-500' },
  ubuntu: { label: 'Ubuntu', component: UbuntuIcon, color: 'text-orange-500' },
  almalinux: { label: 'AlmaLinux', component: AlmaLinuxIcon, color: 'text-amber-400' },
  rocky: { label: 'Rocky Linux', component: RockyLinuxIcon, color: 'text-emerald-500' },
  centos: { label: 'CentOS', component: CentOsIcon, color: 'text-purple-400' },
  debian: { label: 'Debian', component: DebianIcon, color: 'text-red-500' },
  opensuse: { label: 'openSUSE', component: OpenSuseIcon, color: 'text-lime-500' },
  oracle: { label: 'Oracle Linux', component: OracleIcon, color: 'text-red-600' },
  linux: { label: 'Linux (Generic)', component: LinuxIcon, color: 'text-fg-muted' },
}

export function getOsLogo(logoKey?: string): OsLogoDef {
  const key = (logoKey || '').toLowerCase()
  return OS_LOGOS[key] || OS_LOGOS.linux
}
