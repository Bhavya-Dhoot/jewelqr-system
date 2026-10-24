import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { CameraOffIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Accepts every label generation:
 *   new labels   https://<ims>/s/EAR-00012
 *   JewelQR v1.7 "EAR-00012" (bare SKU)
 *   JewelQR v1.0 {"sku":"EAR-00012",...}
 */
export function skuFromQr(text: string): string | null {
  const t = text.trim()
  try {
    if (t.startsWith('{')) return String(JSON.parse(t).sku || '').toUpperCase() || null
  } catch { return null }
  const fromUrl = /\/s\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/.exec(t)
  if (fromUrl) return decodeURIComponent(fromUrl[1]).toUpperCase()
  return /^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(t) ? t.toUpperCase() : null
}

/** Camera QR scanner. Calls onSku once per distinct code (re-arms after 2.5 s). */
export function Scanner({ onSku, paused = false, className }: { onSku: (sku: string) => void; paused?: boolean; className?: string }) {
  const video = useRef<HTMLVideoElement>(null)
  const scanner = useRef<QrScanner | null>(null)
  const last = useRef<{ sku: string; at: number }>({ sku: '', at: 0 })
  const cb = useRef(onSku)
  cb.current = onSku
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!video.current) return
    const s = new QrScanner(video.current, result => {
      const sku = skuFromQr(result.data)
      if (!sku) return
      const now = Date.now()
      if (sku === last.current.sku && now - last.current.at < 2500) return
      last.current = { sku, at: now }
      navigator.vibrate?.(40)
      cb.current(sku)
    }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, returnDetailedScanResult: true })
    scanner.current = s
    s.start().catch(err => {
      setError(
        !window.isSecureContext ? 'The camera needs HTTPS. Open the IMS over https:// or use search instead.'
          : err?.name === 'NotAllowedError' || String(err).includes('denied') ? 'Camera permission was denied. Allow it in the browser settings.'
            : 'No camera found on this device.')
    })
    return () => { s.stop(); s.destroy(); scanner.current = null }
  }, [])

  useEffect(() => {
    if (!scanner.current) return
    if (paused) scanner.current.pause()
    else scanner.current.start().catch(() => {})
  }, [paused])

  return (
    <div className={cn('relative aspect-square w-full overflow-hidden rounded-xl bg-black sm:aspect-video', className)}>
      <video ref={video} className="size-full object-cover" muted playsInline />
      {error && (
        <div className="absolute inset-0 grid place-items-center bg-muted p-6 text-center text-sm text-muted-foreground">
          <div className="space-y-2">
            <CameraOffIcon className="mx-auto size-6" />
            <p>{error}</p>
          </div>
        </div>
      )}
    </div>
  )
}
