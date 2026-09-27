import createClient from 'openapi-fetch'
import { fixtureMiddleware, fixturesEnabled } from './fixtures'
import type { paths } from './schema'

export const API_BASE = ((import.meta.env.VITE_API_BASE_URL as string | undefined) || 'http://localhost:8000').replace(
  /\/$/,
  '',
)

/** true when every call is answered from docs/mocks (no backend) */
export const FIXTURES = fixturesEnabled()

export const api = createClient<paths>({ baseUrl: API_BASE })
if (FIXTURES) api.use(fixtureMiddleware)

export class ApiError extends Error {
  status: number
  detail: string
  constructor(status: number, detail: string) {
    super(detail)
    this.name = 'ApiError'
    this.status = status
    this.detail = detail
  }
}

function detailOf(err: unknown): string | undefined {
  if (typeof err === 'string') return err
  if (!err || typeof err !== 'object') return undefined
  const d = (err as { detail?: unknown }).detail
  if (typeof d === 'string') return d
  if (Array.isArray(d)) {
    return d
      .map((x) => (x && typeof x === 'object' ? (x as { msg?: string }).msg : undefined))
      .filter(Boolean)
      .join('; ')
  }
  return undefined
}

type Res<T> = { data?: T; error?: unknown; response: Response }

/** openapi-fetch result → data, or throw ApiError with FastAPI's `detail`. */
export async function unwrap<T>(p: Promise<Res<T>>): Promise<T> {
  let r: Res<T>
  try {
    r = await p
  } catch {
    throw new ApiError(0, 'Cannot reach the Precedent API')
  }
  if (r.error !== undefined || !r.response.ok) {
    throw new ApiError(r.response.status, detailOf(r.error) ?? (r.response.statusText || 'Request failed'))
  }
  return r.data as T
}
