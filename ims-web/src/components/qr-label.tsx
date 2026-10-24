import { useEffect, useState } from 'react'
import QRCode from 'qrcode'
import { DownloadIcon, PrinterIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { formatINR } from '@/lib/format'

export interface LabelData { sku: string; name: string; url: string; price?: number | null }

const esc = (s: string) => s.replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]!))

/** Print one or many 50 x 25 mm thermal labels (QR + SKU + name + price). */
export async function printLabels(labels: LabelData[]) {
  const svgs = await Promise.all(labels.map(l => QRCode.toString(l.url, { type: 'svg', errorCorrectionLevel: 'M', margin: 0 })))
  const w = window.open('', '_blank', 'width=480,height=640')
  if (!w) return
  w.document.write(`<!doctype html><html><head><title>Labels</title><style>
    @page { size: 50mm 25mm; margin: 0 }
    * { box-sizing: border-box; margin: 0 }
    body { font: 600 7pt/1.15 system-ui, sans-serif; color: #111 }
    .l { width: 50mm; height: 25mm; padding: 1.5mm 2mm; display: flex; gap: 2mm; align-items: center; page-break-after: always; overflow: hidden }
    .q { width: 21mm; height: 21mm; flex: none } .q svg { width: 100%; height: 100% }
    .t { min-width: 0; display: flex; flex-direction: column; gap: 1mm }
    .s { font: 700 8.5pt ui-monospace, monospace; letter-spacing: .02em }
    .n { font-weight: 500; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; overflow: hidden }
    .p { font-size: 9pt; font-weight: 700 }
  </style></head><body>${labels.map((l, i) => `<div class="l"><div class="q">${svgs[i]}</div><div class="t"><div class="s">${esc(l.sku)}</div><div class="n">${esc(l.name)}</div>${l.price ? `<div class="p">${esc(formatINR(l.price))}</div>` : ''}</div></div>`).join('')}
  <script>window.onload = () => { window.print(); setTimeout(() => window.close(), 300) }<\/script></body></html>`)
  w.document.close()
}

export function QrLabel({ data }: { data: LabelData }) {
  const [svg, setSvg] = useState('')
  useEffect(() => {
    QRCode.toString(data.url, { type: 'svg', errorCorrectionLevel: 'M', margin: 1, color: { dark: '#111111', light: '#ffffff' } }).then(setSvg)
  }, [data.url])

  async function download() {
    const url = await QRCode.toDataURL(data.url, { errorCorrectionLevel: 'M', margin: 2, width: 1024 })
    const a = document.createElement('a')
    a.href = url
    a.download = `${data.sku}-qr.png`
    a.click()
  }

  return (
    <div className="flex items-center gap-4">
      <div className="size-28 shrink-0 overflow-hidden rounded-lg border bg-white p-1.5" dangerouslySetInnerHTML={{ __html: svg }} aria-label={`QR code for ${data.sku}`} role="img" />
      <div className="min-w-0 space-y-2">
        <p className="text-xs text-muted-foreground">Scanning opens this piece. Works with older JewelQR labels too.</p>
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => printLabels([data])}><PrinterIcon />Print label</Button>
          <Button size="sm" variant="outline" onClick={download}><DownloadIcon />PNG</Button>
        </div>
      </div>
    </div>
  )
}
