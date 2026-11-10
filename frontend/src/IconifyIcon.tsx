import type { CSSProperties } from 'react'

/** Locally stored SVGs from Iconify's Tabler collection. */
export default function IconifyIcon({ name, size = 18, className = '', collection = 'ui' }: {
  name: string
  size?: number
  className?: string
  collection?: 'ui' | 'sidebar'
}) {
  const url = `url("${import.meta.env.BASE_URL}icons/${collection}/${name}.svg")`
  const style: CSSProperties = { width: size, height: size, maskImage: url, WebkitMaskImage: url }
  return <span className={`iconify-glyph ${className}`} style={style} aria-hidden="true" />
}
