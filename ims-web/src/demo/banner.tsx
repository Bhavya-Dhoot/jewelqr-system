import { RotateCcwIcon } from 'lucide-react'
import { resetDemo } from '@/demo/server'

/** Shown only in the demo build: says what this is, and puts the sample data back. */
export default function DemoBanner() {
  return (
    <div className="ml-auto flex shrink-0 items-center gap-2 text-xs">
      <span className="text-muted-foreground"><b className="font-semibold text-foreground">Demo</b><span className="max-lg:hidden"> · sample data · changes stay in this browser</span></span>
      <button type="button" onClick={resetDemo} className="inline-flex items-center gap-1 border px-2 py-1 font-medium hover:bg-muted focus-visible:outline-2 focus-visible:outline-ring">
        <RotateCcwIcon className="size-3" aria-hidden />Reset
      </button>
    </div>
  )
}
