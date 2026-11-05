export interface OsIconProps {
  size?: number | string
  className?: string
  alt?: string
}

export interface OsLogoDef {
  label: string
  file: string
  color: string
}

export const OS_LOGOS: Record<string, OsLogoDef> = {
  almalinux: { label: 'AlmaLinux', file: '/logos/os/almalinux.svg', color: 'text-amber-400' },
  alpine: { label: 'Alpine Linux', file: '/logos/os/alpine.svg', color: 'text-sky-400' },
  archlinux: { label: 'Arch Linux', file: '/logos/os/archlinux.svg', color: 'text-cyan-400' },
  centos: { label: 'CentOS', file: '/logos/os/centos.svg', color: 'text-purple-400' },
  debian: { label: 'Debian', file: '/logos/os/debian.svg', color: 'text-red-500' },
  fedora: { label: 'Fedora', file: '/logos/os/fedora.svg', color: 'text-blue-500' },
  freebsd: { label: 'FreeBSD', file: '/logos/os/freebsd.svg', color: 'text-rose-500' },
  rocky: { label: 'Rocky Linux', file: '/logos/os/rocky.svg', color: 'text-emerald-500' },
  ubuntu: { label: 'Ubuntu', file: '/logos/os/ubuntu.svg', color: 'text-orange-500' },
  windows: { label: 'Windows', file: '/logos/os/windows.svg', color: 'text-sky-500' },
  opensuse: { label: 'openSUSE', file: '/logos/os/opensuse.svg', color: 'text-lime-500' },
  oracle: { label: 'Oracle Linux', file: '/logos/os/oracle.svg', color: 'text-red-600' },
  linux: { label: 'Linux (Generic)', file: '/logos/os/linux.svg', color: 'text-fg-muted' },
}

export function getOsLogo(logoKey?: string): OsLogoDef {
  const key = (logoKey || '').toLowerCase()
  return OS_LOGOS[key] || OS_LOGOS.linux
}

export function OsLogoImage({
  logoKey,
  size = 20,
  className,
}: {
  logoKey?: string
  size?: number | string
  className?: string
}) {
  const def = getOsLogo(logoKey)
  return (
    <img
      src={def.file}
      alt={def.label}
      style={{ width: size, height: size }}
      className={`object-contain inline-block ${className || ''}`}
      loading="lazy"
    />
  )
}
