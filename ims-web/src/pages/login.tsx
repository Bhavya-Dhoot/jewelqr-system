import { useState, type FormEvent } from 'react'
import { useNavigate, useSearchParams } from 'react-router'
import { useQueryClient } from '@tanstack/react-query'
import { GemIcon } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Field, FieldGroup, FieldLabel } from '@/components/ui/field'
import { Spinner } from '@/components/ui/spinner'
import { api } from '@/lib/api'
import { keys } from '@/hooks/api'
import type { User } from '@/lib/types'

export default function LoginPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const qc = useQueryClient()
  // The demo build fills in its sample manager account.
  const [email, setEmail] = useState(import.meta.env.VITE_DEMO ? 'manager@esmecrystal.local' : '')
  const [password, setPassword] = useState(import.meta.env.VITE_DEMO ? 'Manager@Demo2026' : '')
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(e: FormEvent) {
    e.preventDefault()
    setBusy(true)
    setError(null)
    try {
      const { user } = await api.post<{ user: User }>('/auth/login', { email, password })
      qc.setQueryData(keys.me, user)
      const next = params.get('next')
      navigate(next && next.startsWith('/') && !next.startsWith('//') ? next : '/', { replace: true })
    } catch (err) {
      setError((err as Error).message)
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="flex min-h-dvh flex-col justify-between p-6 sm:p-10">
      <div className="flex items-center gap-2 font-semibold">
        <div className="grid size-8 place-items-center rounded-lg bg-primary text-primary-foreground"><GemIcon className="size-4" /></div>
        Esme Crystal
      </div>
      <form onSubmit={submit} className="mx-auto w-full max-w-sm space-y-6 py-12">
        <div className="space-y-1">
          <h1 className="text-2xl font-semibold tracking-tight">Sign in to Inventory</h1>
          <p className="text-sm text-muted-foreground">{import.meta.env.VITE_DEMO ? 'Demo: sign in as the manager, or as staff@esmecrystal.local with Staff@Demo2026.' : 'Use your ERPNext account.'}</p>
        </div>
        <FieldGroup>
          <Field>
            <FieldLabel htmlFor="email">Email</FieldLabel>
            <Input id="email" type="text" autoComplete="username" required autoFocus value={email} onChange={e => setEmail(e.target.value)} />
          </Field>
          <Field>
            <FieldLabel htmlFor="password">Password</FieldLabel>
            <Input id="password" type="password" autoComplete="current-password" required value={password} onChange={e => setPassword(e.target.value)} />
          </Field>
        </FieldGroup>
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <Button type="submit" className="w-full" disabled={busy}>{busy && <Spinner />}Sign in</Button>
      </form>
      <p className="text-xs text-muted-foreground">Accounts and roles are managed in ERPNext.</p>
    </div>
  )
}
