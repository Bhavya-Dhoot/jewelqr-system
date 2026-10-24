export class ApiError extends Error {
  status: number
  constructor(status: number, message: string) {
    super(message)
    this.status = status
  }
}

type Body = Record<string, unknown> | unknown[] | FormData | undefined

async function request<T>(method: string, path: string, body?: Body): Promise<T> {
  let status: number
  let data: { error?: string } | undefined
  if (import.meta.env.VITE_DEMO) {
    // Demo build: an in-browser stand-in for the gateway and ERPNext (src/demo), left out of normal builds.
    ;({ status, data } = (await (await import('@/demo/server')).handle(method, path, body)) as { status: number; data: typeof data })
  } else {
    let res: Response
    try {
      res = await fetch(`/api${path}`, {
        method,
        credentials: 'same-origin',
        headers: body instanceof FormData || body === undefined ? undefined : { 'Content-Type': 'application/json' },
        body: body instanceof FormData ? body : body === undefined ? undefined : JSON.stringify(body),
      })
    } catch {
      throw new ApiError(0, 'Cannot reach the server. Check your connection.')
    }
    status = res.status
    data = status === 204 ? undefined : await res.json().catch(() => ({}))
  }
  if (status === 204) return undefined as T
  if (status >= 400) {
    if (status === 401 && !path.startsWith('/auth/') && !path.startsWith('/public/')) {
      window.dispatchEvent(new Event('ims:unauthorized'))
    }
    throw new ApiError(status, data?.error || `Request failed (${status})`)
  }
  return data as T
}

export const api = {
  get: <T>(path: string) => request<T>('GET', path),
  post: <T>(path: string, body?: Body) => request<T>('POST', path, body),
  put: <T>(path: string, body?: Body) => request<T>('PUT', path, body),
  del: <T>(path: string) => request<T>('DELETE', path),
}

/** Build a query string, dropping empty values. */
export function qs(params: Record<string, string | number | boolean | null | undefined>) {
  const q = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) if (v !== '' && v != null) q.set(k, String(v))
  const s = q.toString()
  return s ? `?${s}` : ''
}
