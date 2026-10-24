import { useEffect, useRef, useState } from 'react'
import QrScanner from 'qr-scanner'
import { CameraOffIcon } from 'lucide-react'
import { cn } from '@/lib/utils'

/** A label holds <PUBLIC_URL>/s/<SKU>; a bare SKU (typed, or an older label) also works. */
export function skuFromQr(text: string): string | null {
  const t = text.trim()
  const fromUrl = /\/s\/([A-Za-z0-9-]+)\/?(?:[?#].*)?$/.exec(t)
  if (fromUrl) return decodeURIComponent(fromUrl[1]).toUpperCase()
  return /^[A-Za-z0-9][A-Za-z0-9-]{1,39}$/.test(t) ? t.toUpperCase() : null
}

/** Camera QR scanner. Calls onSku once per distinct code (re-arms after 2.5 s). */
export function Scanner({ onSku, paused = false, className }: { onSku: (sku: string) => void; paused?: boolean; className?: string }) {
  const host = useRef<HTMLDivElement>(null)
  const still = useRef<HTMLCanvasElement>(null)
  const videoRef = useRef<HTMLVideoElement | null>(null)
  const scanner = useRef<QrScanner | null>(null)
  const started = useRef(false)
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const last = useRef<{ sku: string; at: number }>({ sku: '', at: 0 })
  const cb = useRef(onSku)
  cb.current = onSku
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!host.current) return
    // Each scanner gets its own <video>: a previous instance still shutting down (fast remounts, React dev
    // mode) then can't clear the stream of the new one.
    const video = document.createElement('video')
    video.muted = true
    video.playsInline = true
    video.className = 'size-full object-cover'
    host.current.prepend(video)
    videoRef.current = video
    let cancelled = false
    const s = new QrScanner(video, result => {
      const sku = skuFromQr(result.data)
      if (!sku) return
      const now = Date.now()
      if (sku === last.current.sku && now - last.current.at < 2500) return
      last.current = { sku, at: now }
      navigator.vibrate?.(40)
      cb.current(sku)
    }, { preferredCamera: 'environment', highlightScanRegion: true, highlightCodeOutline: true, maxScansPerSecond: 8, returnDetailedScanResult: true })
    scanner.current = s
    s.start().then(() => {
      if (cancelled) return
      started.current = true
      if (pausedRef.current) s.pause()
    }).catch(err => {
      if (cancelled) return
      setError(
        !window.isSecureContext ? 'The camera needs HTTPS. Open the IMS over https:// or use search instead.'
          : err?.name === 'NotAllowedError' || String(err).includes('denied') ? 'Camera permission was denied. Allow it in the browser settings.'
            : 'No camera found on this device.')
    })
    return () => { cancelled = true; started.current = false; s.stop(); s.destroy(); video.remove(); scanner.current = null }
  }, [])

  useEffect(() => {
    const s = scanner.current
    if (!s || !started.current) return
    const v = videoRef.current, c = still.current
    if (paused) {
      // Freeze the frame that was scanned, so the camera area shows what was read instead of going black.
      if (v && c && v.videoWidth) {
        c.width = v.videoWidth; c.height = v.videoHeight
        c.getContext('2d')?.drawImage(v, 0, 0)
        c.style.transform = getComputedStyle(v).transform
        c.hidden = false
      }
      s.pause()
    } else {
      if (c) c.hidden = true
      s.start().catch(() => {})
    }
  }, [paused])

  return (
    <div ref={host} className={cn('relative aspect-square w-full overflow-hidden rounded-xl bg-black sm:aspect-video', className)}>
      <canvas ref={still} hidden className="absolute inset-0 size-full object-cover" aria-hidden />
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
