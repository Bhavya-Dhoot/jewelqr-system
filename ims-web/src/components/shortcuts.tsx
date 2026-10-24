import { useEffect, useRef } from 'react'
import { useNavigate } from 'react-router'
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Kbd } from '@/components/ui/kbd'
import { useMovementDialog } from '@/components/movement-dialog'

// Two-key "go to" chords and single-key actions, in the spirit of Medusa's admin keybinds.
const GO: Record<string, { to: string; label: string; manager?: boolean }> = {
  d: { to: '/', label: 'Dashboard' },
  i: { to: '/inventory', label: 'Inventory' },
  m: { to: '/movements', label: 'Stock movements' },
  s: { to: '/scan', label: 'Scan' },
  l: { to: '/locations', label: 'Locations' },
  c: { to: '/count', label: 'Stock count', manager: true },
  ',': { to: '/settings', label: 'Settings' },
}

const typingIn = (el: EventTarget | null) =>
  el instanceof HTMLElement && (el.isContentEditable || ['INPUT', 'TEXTAREA', 'SELECT'].includes(el.tagName) || el.getAttribute('role') === 'combobox')

export function Shortcuts({ helpOpen, setHelpOpen, isManager }: { helpOpen: boolean; setHelpOpen: (o: boolean) => void; isManager: boolean }) {
  const navigate = useNavigate()
  const { openMovement } = useMovementDialog()
  const pendingG = useRef<number>(0)

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey || typingIn(e.target) || document.querySelector('[role="dialog"]')) return
      const k = e.key.toLowerCase()
      if (Date.now() - pendingG.current < 1200 && GO[k] && (!GO[k].manager || isManager)) {
        pendingG.current = 0
        e.preventDefault()
        navigate(GO[k].to)
        return
      }
      if (k === 'g') { pendingG.current = Date.now(); return }
      if (k === '?') { e.preventDefault(); setHelpOpen(true) }
      else if (k === 'n') { e.preventDefault(); navigate('/inventory/new') }
      else if (k === 'r') { e.preventDefault(); openMovement({ action: 'receive' }) }
      else if (k === 'x') { e.preventDefault(); openMovement({ action: 'sell' }) }
      else if (k === 't') { e.preventDefault(); openMovement({ action: 'move' }) }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [navigate, openMovement, setHelpOpen, isManager])

  const rows: [string[], string][] = [
    [['Ctrl', 'K'], 'Search pieces'],
    [['N'], 'New piece'],
    [['R'], 'Receive stock'],
    [['X'], 'Record a sale'],
    [['T'], 'Move between locations'],
    ...Object.entries(GO).filter(([, v]) => !v.manager || isManager).map(([k, v]) => [['G', k === ',' ? ',' : k.toUpperCase()], `Go to ${v.label}`] as [string[], string]),
    [['?'], 'Show this list'],
  ]

  return (
    <Dialog open={helpOpen} onOpenChange={setHelpOpen}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Keyboard shortcuts</DialogTitle>
          <DialogDescription>Work without the mouse. Shortcuts pause while you type in a field.</DialogDescription>
        </DialogHeader>
        <ul className="divide-y border-t border-foreground text-sm">
          {rows.map(([keys, label]) => (
            <li key={label} className="flex items-center justify-between py-2">
              <span>{label}</span>
              <span className="flex gap-1">{keys.map((key, i) => <Kbd key={i}>{key}</Kbd>)}</span>
            </li>
          ))}
        </ul>
      </DialogContent>
    </Dialog>
  )
}
