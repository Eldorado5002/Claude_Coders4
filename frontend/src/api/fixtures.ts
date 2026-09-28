/**
 * Fixture mode: answer API calls from ../docs/mocks (real Week 3 data) with no backend.
 * Keeps the UI buildable and the demo safe if the backend is unreachable.
 * Enable with VITE_FIXTURES=1 or ?fixtures=1 (sticky for the tab; ?fixtures=0 turns it off).
 */
import type { Middleware } from 'openapi-fetch'
import type {
  DemoState,
  DemoStageId,
  ExceptionDetail,
  ExceptionPage,
  Lesson,
  ResolveRequest,
  ResolveResult,
  RevokeRequest,
  RevokeResult,
  Settings,
  VendorProfile,
  VendorSummary,
} from './types'

const loaders = import.meta.glob<unknown>('../../../docs/mocks/*.json', { import: 'default' })

async function mock<T>(name: string): Promise<T> {
  const key = Object.keys(loaders).find((k) => k.endsWith(`/${name}.json`))
  if (!key) throw new Error(`fixture ${name} is missing`)
  return structuredClone(await loaders[key]()) as T
}

type Query = Record<string, string>
type State = {
  memory?: boolean
  stage?: DemoStageId
  resolved: Map<string, ResolveResult>
  revoked: Map<string, RevokeRequest>
}
let state: State = { resolved: new Map(), revoked: new Map() }
export function resetFixtureState() {
  state = { resolved: new Map(), revoked: new Map() }
}

const STAGE_ORDER: DemoStageId[] = ['day1', 'week3', 'week8', 'twist']

async function settings(): Promise<Settings> {
  const s = await mock<Settings>('settings')
  return { ...s, memory_enabled: state.memory ?? s.memory_enabled, stage: state.stage ?? s.stage }
}

async function demoState(): Promise<DemoState> {
  const d = await mock<DemoState>('demo-state')
  const stage = state.stage ?? d.stage
  const at = STAGE_ORDER.indexOf(stage)
  return {
    ...d,
    stage,
    sim_date: d.stages.find((s) => s.id === stage)?.sim_date ?? d.sim_date,
    stages: d.stages.map((s) => ({ ...s, reached: STAGE_ORDER.indexOf(s.id) <= at })),
  }
}

async function listExceptions(q: Query): Promise<ExceptionPage> {
  const page = await mock<ExceptionPage>('exceptions')
  const status = q.status ?? 'open'
  const items = page.items
    .map((c) => (state.resolved.has(c.id) ? { ...c, status: 'resolved' as const } : c))
    .filter((c) => status === 'all' || c.status === status)
    .filter((c) => !q.vendor_id || c.vendor.id === q.vendor_id)
    .filter((c) => !q.type || c.primary_type === q.type)
  return { items, total: items.length }
}

async function detail(id: string): Promise<ExceptionDetail | null> {
  const done = state.resolved.get(id)
  if (done) return done.exception
  const [base, page] = await Promise.all([mock<ExceptionDetail>('exception-detail'), mock<ExceptionPage>('exceptions')])
  const s = page.items.find((c) => c.id === id)
  if (!s) return id === base.id ? base : null
  if (s.id === base.id) return base
  // other cases: keep the sample documents, but take this case's identity and verdict
  const rec = base.recommendation
  return {
    ...base,
    ...s,
    recommendation:
      rec && s.recommended_action
        ? { ...rec, action: s.recommended_action, confidence: s.confidence ?? rec.confidence }
        : rec,
    autonomy: { ...base.autonomy, vendor_id: s.vendor.id, vendor_name: s.vendor.name, exception_type: s.primary_type, level: s.autonomy_level },
  }
}

async function resolve(id: string, body: ResolveRequest): Promise<ResolveResult | null> {
  const [d, base] = await Promise.all([detail(id), mock<ResolveResult>('resolve-result')])
  if (!d) return null
  const agent = d.recommendation?.action ?? null
  const pays = (a: string | null) => (a === 'approve' ? 'pay' : a === 'approve_adjusted' ? 'adj' : 'no')
  const agreed = agent ? pays(agent) === pays(body.decision) : null
  const streak = agreed ? d.autonomy.streak + 1 : 0
  const promoted = !!agreed && d.autonomy.level === 'suggest' && streak >= d.autonomy.required_streak
  const autonomy = {
    ...d.autonomy,
    streak,
    accepted: d.autonomy.accepted + (agreed ? 1 : 0),
    overruled: d.autonomy.overruled + (agreed === false ? 1 : 0),
    level: promoted ? ('auto' as const) : d.autonomy.level,
  }
  const result: ResolveResult = {
    ...base,
    exception: {
      ...d,
      status: 'resolved',
      autonomy,
      resolution: {
        decision: body.decision,
        reason: body.reason,
        adjusted_amount: body.decision === 'approve_adjusted' ? (body.adjusted_amount ?? null) : null,
        resolved_by: body.resolved_by ?? 'AP Clerk',
        resolved_at: d.created_at,
        agent_action: agent,
        agreed_with_agent: agreed,
        redacted: [],
        revoked_at: null,
        revoked_by: null,
        revoke_reason: null,
      },
    },
    memory_id: id,
    lesson: `${d.vendor.name} · ${d.primary_type.replace(/_/g, ' ')}: ${body.decision.replace('_', ' ')} — “${body.reason}”`,
    autonomy,
    promoted,
    demoted: agreed === false && d.autonomy.level === 'auto',
  }
  state.resolved.set(id, result)
  return result
}

async function vendor(id: string): Promise<VendorProfile | null> {
  const [base, list] = await Promise.all([mock<VendorProfile>('vendor-profile'), mock<VendorSummary[]>('vendors')])
  const v = list.find((x) => x.id === id)
  if (!v) return null
  return id === base.id ? base : { ...base, ...v, learned: [], playbook: null, recent: [], autonomy: [] }
}

async function lessons(q: Query): Promise<Lesson[]> {
  const all = await mock<Lesson[]>('lessons')
  return all
    .map((l) => {
      const r = state.revoked.get(l.case_id)
      return r ? { ...l, revoked: true, revoked_by: r.revoked_by ?? 'AP Lead', revoke_reason: r.reason } : l
    })
    .filter((l) => !q.vendor_id || l.vendor.id === q.vendor_id)
    .filter((l) => q.include_revoked !== 'false' || !l.revoked)
}

async function revoke(caseId: string, body: RevokeRequest): Promise<RevokeResult | null> {
  const [all, base] = await Promise.all([mock<Lesson[]>('lessons'), mock<RevokeResult>('revoke-result')])
  const found = all.find((l) => l.case_id === caseId)
  if (!found) return null
  state.revoked.set(caseId, body)
  return {
    ...base,
    lesson: { ...found, revoked: true, revoked_by: body.revoked_by ?? 'AP Lead', revoke_reason: body.reason },
  }
}

type Handler = (m: RegExpMatchArray, q: Query, body: never) => Promise<unknown>
const routes: [string, RegExp, Handler][] = [
  ['GET', /^\/api\/health$/, () => mock('health')],
  ['GET', /^\/api\/settings$/, () => settings()],
  [
    'PATCH',
    /^\/api\/settings$/,
    (_m, _q, b: { memory_enabled?: boolean | null }) => {
      if (b?.memory_enabled != null) state.memory = b.memory_enabled
      return settings()
    },
  ],
  ['GET', /^\/api\/exceptions$/, (_m, q) => listExceptions(q)],
  ['GET', /^\/api\/exceptions\/([^/]+)$/, (m) => detail(m[1])],
  ['POST', /^\/api\/exceptions\/([^/]+)\/recommend$/, (m) => detail(m[1])],
  ['POST', /^\/api\/exceptions\/([^/]+)\/resolve$/, (m, _q, b: ResolveRequest) => resolve(m[1], b)],
  ['GET', /^\/api\/vendors$/, () => mock('vendors')],
  ['GET', /^\/api\/vendors\/([^/]+)$/, (m) => vendor(m[1])],
  ['GET', /^\/api\/autonomy$/, () => mock('autonomy')],
  ['GET', /^\/api\/metrics$/, () => mock('metrics')],
  ['GET', /^\/api\/memory\/recent$/, () => mock('memory-recent')],
  ['GET', /^\/api\/memory\/policy$/, () => mock('policy')],
  ['GET', /^\/api\/lessons$/, (_m, q) => lessons(q)],
  ['POST', /^\/api\/lessons\/([^/]+)\/revoke$/, (m, _q, b: RevokeRequest) => revoke(m[1], b)],
  ['POST', /^\/api\/copilot\/ask$/, () => mock('copilot-answer')],
  ['POST', /^\/api\/invoices\/capture$/, () => mock('capture-result')],
  ['GET', /^\/api\/demo\/state$/, () => demoState()],
  [
    'POST',
    /^\/api\/demo\/advance$/,
    (_m, _q, b: { stage: DemoStageId }) => {
      state.stage = b.stage
      return demoState()
    },
  ],
  [
    'POST',
    /^\/api\/demo\/reset$/,
    () => {
      resetFixtureState()
      state.stage = 'day1'
      return demoState()
    },
  ],
]

/** Pure router used by the middleware (and tests). null = 404. */
export async function fixtureResponse(method: string, path: string, query: Query = {}, body?: unknown): Promise<unknown> {
  for (const [m, rx, handler] of routes) {
    const hit = m === method.toUpperCase() ? path.match(rx) : null
    if (hit) return (await handler(hit, query, body as never)) ?? null
  }
  return null
}

const FIXTURE_KEY = 'precedent:fixtures'

export function fixturesEnabled(): boolean {
  if (import.meta.env.VITE_FIXTURES === '1') return true
  if (typeof window === 'undefined') return false
  const flag = new URLSearchParams(window.location.search).get('fixtures')
  try {
    if (flag === '1') sessionStorage.setItem(FIXTURE_KEY, '1')
    if (flag === '0') sessionStorage.removeItem(FIXTURE_KEY)
    return sessionStorage.getItem(FIXTURE_KEY) === '1'
  } catch {
    return flag === '1'
  }
}

const json = (data: unknown, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } })

export const fixtureMiddleware: Middleware = {
  async onRequest({ request }) {
    const url = new URL(request.url)
    let body: unknown
    if (request.method !== 'GET' && request.headers.get('content-type')?.includes('application/json')) {
      body = await request.clone().json()
    }
    const data = await fixtureResponse(request.method, url.pathname, Object.fromEntries(url.searchParams), body)
    await new Promise((r) => setTimeout(r, 250 + Math.random() * 350))
    return data === null ? json({ detail: 'Not available in fixture mode' }, 404) : json(data)
  },
}
