// Local development backend for Bloomie — NOT for production.
//
// A small emulator of the Supabase Auth (GoTrue) and REST (PostgREST) endpoints
// the app uses, backed by PGlite (Postgres compiled to WASM). It runs the real
// migrations in supabase/migrations and executes every request under the
// `anon` / `authenticated` role with JWT claims, so the real Row Level Security
// policies are enforced. Use it when Docker / `supabase start` is unavailable.
//
//   npm run dev:backend      → http://localhost:54321  (data in .dev-db/)
//   GET /__dev/mailbox       → verification & password-reset emails
import { createServer, type IncomingMessage, type ServerResponse } from 'node:http'
import { createHmac, randomBytes, randomUUID, scryptSync, timingSafeEqual, createHash } from 'node:crypto'
import { createDb } from '../tests/db/harness.ts'

const PORT = Number(process.env.DEV_BACKEND_PORT ?? 54321)
const JWT_SECRET = process.env.DEV_JWT_SECRET ?? 'bloomie-local-dev-secret-not-for-production'
const DATA_DIR = process.env.DEV_DB_DIR ?? './.dev-db'
const AUTO_CONFIRM = process.env.DEV_AUTO_CONFIRM === 'true'
const ACCESS_TTL = 3600

// ─── JWT ────────────────────────────────────────────────────────────────────

const b64url = (b: Buffer | string) => Buffer.from(b).toString('base64url')
function signJwt(payload: Record<string, unknown>): string {
  const head = b64url(JSON.stringify({ alg: 'HS256', typ: 'JWT' }))
  const body = b64url(JSON.stringify(payload))
  const sig = createHmac('sha256', JWT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}
function verifyJwt(token: string): Record<string, unknown> | null {
  const [h, b, s] = token.split('.')
  if (!h || !b || !s) return null
  const expected = createHmac('sha256', JWT_SECRET).update(`${h}.${b}`).digest()
  const given = Buffer.from(s, 'base64url')
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null
  const payload = JSON.parse(Buffer.from(b, 'base64url').toString())
  if (typeof payload.exp === 'number' && payload.exp < Date.now() / 1000) return null
  return payload
}

export const ANON_KEY = signJwt({ role: 'anon', iss: 'bloomie-dev', iat: 1700000000, exp: 4102444800 })

// ─── Database ───────────────────────────────────────────────────────────────

const db = await createDb(DATA_DIR)
await db.exec(`
  alter table auth.users add column if not exists encrypted_password text;
  alter table auth.users add column if not exists email_confirmed_at timestamptz;
  alter table auth.users add column if not exists created_at timestamptz default now();
  create table if not exists auth.dev_tokens (token text primary key, kind text not null, user_id uuid references auth.users(id) on delete cascade, data jsonb, created_at timestamptz default now());
`)
const PUBLIC_TABLES = new Set(((await db.query<{ t: string }>(`select tablename t from pg_tables where schemaname = 'public'`)).rows).map(r => r.t))
const mailbox: { to: string; subject: string; link: string; at: string }[] = []

interface DbUser { id: string; email: string; raw_user_meta_data: Record<string, unknown>; raw_app_meta_data: Record<string, unknown>; email_confirmed_at: string | null; encrypted_password: string | null; created_at: string }

const hashPassword = (pw: string) => { const salt = randomBytes(16); return `${salt.toString('hex')}:${scryptSync(pw, salt, 32).toString('hex')}` }
const checkPassword = (pw: string, stored: string | null) => {
  if (!stored) return false
  const [salt, hash] = stored.split(':')
  return timingSafeEqual(scryptSync(pw, Buffer.from(salt, 'hex'), 32), Buffer.from(hash, 'hex'))
}

function userJson(u: DbUser) {
  return {
    id: u.id, aud: 'authenticated', role: 'authenticated', email: u.email,
    email_confirmed_at: u.email_confirmed_at, confirmed_at: u.email_confirmed_at,
    app_metadata: { provider: 'email', providers: ['email'], ...u.raw_app_meta_data },
    user_metadata: u.raw_user_meta_data ?? {}, identities: [], created_at: u.created_at, updated_at: u.created_at,
  }
}

async function issueSession(u: DbUser) {
  const now = Math.floor(Date.now() / 1000)
  const access = signJwt({
    sub: u.id, role: 'authenticated', aud: 'authenticated', email: u.email, iat: now, exp: now + ACCESS_TTL,
    app_metadata: { provider: 'email', ...u.raw_app_meta_data }, user_metadata: u.raw_user_meta_data, session_id: randomUUID(),
  })
  const refresh = randomBytes(24).toString('base64url')
  await db.query(`insert into auth.dev_tokens (token, kind, user_id) values ($1, 'refresh', $2)`, [refresh, u.id])
  return { access_token: access, token_type: 'bearer', expires_in: ACCESS_TTL, expires_at: now + ACCESS_TTL, refresh_token: refresh, user: userJson(u) }
}

const findUserByEmail = async (email: string) => (await db.query<DbUser>(`select * from auth.users where lower(email) = lower($1)`, [email])).rows[0]
const findUserById = async (id: string) => (await db.query<DbUser>(`select * from auth.users where id = $1`, [id])).rows[0]

async function sendLink(kind: 'signup' | 'recovery', u: DbUser, redirectTo: string, challenge?: string) {
  const code = randomUUID()
  await db.query(`insert into auth.dev_tokens (token, kind, user_id, data) values ($1, $2, $3, $4)`, [code, kind, u.id, JSON.stringify({ challenge: challenge ?? null })])
  const link = `${redirectTo}${redirectTo.includes('?') ? '&' : '?'}code=${code}`
  const mail = { to: u.email, subject: kind === 'signup' ? 'Confirm your Bloomie account' : 'Reset your Bloomie password', link, at: new Date().toISOString() }
  mailbox.unshift(mail)
  console.log(`\n✉️  [dev mailbox] ${mail.subject} → ${mail.to}\n    ${link}\n`)
}

// ─── HTTP helpers ───────────────────────────────────────────────────────────

function cors(req: IncomingMessage, res: ServerResponse) {
  res.setHeader('Access-Control-Allow-Origin', req.headers.origin ?? '*')
  res.setHeader('Access-Control-Allow-Credentials', 'true')
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PATCH,PUT,DELETE,OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', req.headers['access-control-request-headers'] ?? '*')
  res.setHeader('Access-Control-Expose-Headers', 'Content-Range, X-Total-Count')
}
function send(res: ServerResponse, status: number, body?: unknown, headers: Record<string, string> = {}) {
  res.writeHead(status, { 'Content-Type': 'application/json', ...headers })
  res.end(body === undefined ? '' : JSON.stringify(body))
}
const authErr = (res: ServerResponse, status: number, error_code: string, msg: string) => send(res, status, { code: status, error_code, msg })
async function readBody(req: IncomingMessage): Promise<unknown> {
  const chunks: Buffer[] = []
  for await (const c of req) chunks.push(c as Buffer)
  const raw = Buffer.concat(chunks).toString()
  return raw ? JSON.parse(raw) : undefined
}
function claimsFor(req: IncomingMessage): { role: 'anon' | 'authenticated'; sub?: string; claims: Record<string, unknown> } | null {
  const bearer = (req.headers.authorization ?? '').replace(/^Bearer\s+/i, '') || String(req.headers.apikey ?? '')
  const claims = verifyJwt(bearer)
  if (!claims) return null
  if (claims.role === 'authenticated' && typeof claims.sub === 'string') return { role: 'authenticated', sub: claims.sub, claims }
  return { role: 'anon', claims }
}

// ─── Auth (GoTrue subset) ───────────────────────────────────────────────────

async function handleAuth(req: IncomingMessage, res: ServerResponse, url: URL) {
  const path = url.pathname.replace('/auth/v1', '')
  const body = (await readBody(req)) as Record<string, any> | undefined

  if (path === '/settings') return send(res, 200, { external: { email: true, google: false }, disable_signup: false, mailer_autoconfirm: AUTO_CONFIRM })

  if (path === '/signup' && req.method === 'POST') {
    const email = String(body?.email ?? '').trim().toLowerCase()
    const password = String(body?.password ?? '')
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return authErr(res, 400, 'validation_failed', 'Unable to validate email address: invalid format')
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) return authErr(res, 422, 'weak_password', 'Password should contain letters and digits and be at least 8 characters')
    if (await findUserByEmail(email)) return authErr(res, 422, 'user_already_exists', 'User already registered')
    const meta = body?.data ?? body?.options?.data ?? {}
    const { rows } = await db.query<DbUser>(
      `insert into auth.users (email, raw_user_meta_data, encrypted_password, email_confirmed_at) values ($1, $2, $3, $4) returning *`,
      [email, JSON.stringify(meta), hashPassword(password), AUTO_CONFIRM ? new Date().toISOString() : null])
    const u = rows[0]
    if (AUTO_CONFIRM) return send(res, 200, await issueSession(u))
    await sendLink('signup', u, url.searchParams.get('redirect_to') ?? 'http://localhost:5173/auth/callback', body?.code_challenge)
    return send(res, 200, userJson(u))
  }

  if (path === '/resend' && req.method === 'POST') {
    const u = await findUserByEmail(String(body?.email ?? ''))
    if (u && !u.email_confirmed_at) await sendLink('signup', u, url.searchParams.get('redirect_to') ?? 'http://localhost:5173/auth/callback', body?.code_challenge)
    return send(res, 200, {})
  }

  if (path === '/recover' && req.method === 'POST') {
    const u = await findUserByEmail(String(body?.email ?? ''))
    if (u) await sendLink('recovery', u, url.searchParams.get('redirect_to') ?? 'http://localhost:5173/reset-password', body?.code_challenge)
    return send(res, 200, {})
  }

  if (path === '/token' && req.method === 'POST') {
    const grant = url.searchParams.get('grant_type')
    if (grant === 'password') {
      const u = await findUserByEmail(String(body?.email ?? ''))
      if (!u || !checkPassword(String(body?.password ?? ''), u.encrypted_password)) return authErr(res, 400, 'invalid_credentials', 'Invalid login credentials')
      if (!u.email_confirmed_at) return authErr(res, 400, 'email_not_confirmed', 'Email not confirmed')
      return send(res, 200, await issueSession(u))
    }
    if (grant === 'refresh_token') {
      const { rows } = await db.query<{ user_id: string }>(`delete from auth.dev_tokens where token = $1 and kind = 'refresh' returning user_id`, [String(body?.refresh_token ?? '')])
      const u = rows[0] && await findUserById(rows[0].user_id)
      if (!u) return authErr(res, 400, 'refresh_token_not_found', 'Invalid Refresh Token: Refresh Token Not Found')
      return send(res, 200, await issueSession(u))
    }
    if (grant === 'pkce') {
      const { rows } = await db.query<{ user_id: string; kind: string; data: { challenge: string | null } }>(
        `delete from auth.dev_tokens where token = $1 and kind in ('signup','recovery') returning user_id, kind, data`, [String(body?.auth_code ?? '')])
      const t = rows[0]
      if (!t) return authErr(res, 400, 'flow_state_not_found', 'invalid flow state, no valid flow state found')
      if (t.data?.challenge) {
        const verifier = String(body?.code_verifier ?? '')
        const computed = createHash('sha256').update(verifier).digest('base64url')
        if (computed !== t.data.challenge && verifier !== t.data.challenge) return authErr(res, 400, 'bad_code_verifier', 'code challenge does not match previously saved code verifier')
      }
      if (t.kind === 'signup') await db.query(`update auth.users set email_confirmed_at = coalesce(email_confirmed_at, now()) where id = $1`, [t.user_id])
      return send(res, 200, await issueSession((await findUserById(t.user_id))!))
    }
    return authErr(res, 400, 'unsupported_grant_type', 'Unsupported grant type')
  }

  const who = claimsFor(req)
  if (path === '/user') {
    if (who?.role !== 'authenticated') return authErr(res, 401, 'no_authorization', 'This endpoint requires a valid Bearer token')
    let u = await findUserById(who.sub!)
    if (!u) return authErr(res, 404, 'user_not_found', 'User from sub claim in JWT does not exist')
    if (req.method === 'PUT') {
      if (body?.password) {
        const pw = String(body.password)
        if (pw.length < 8 || !/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return authErr(res, 422, 'weak_password', 'Password should contain letters and digits and be at least 8 characters')
        await db.query(`update auth.users set encrypted_password = $1 where id = $2`, [hashPassword(pw), u.id])
      }
      if (body?.data) await db.query(`update auth.users set raw_user_meta_data = raw_user_meta_data || $1::jsonb where id = $2`, [JSON.stringify(body.data), u.id])
      u = (await findUserById(u.id))!
    }
    return send(res, 200, userJson(u))
  }
  if (path === '/logout') {
    if (who?.sub) await db.query(`delete from auth.dev_tokens where user_id = $1 and kind = 'refresh'`, [who.sub])
    res.writeHead(204); return res.end()
  }
  return authErr(res, 404, 'not_found', `Dev backend does not implement ${req.method} ${path}`)
}

// ─── REST (PostgREST subset) ────────────────────────────────────────────────

const IDENT = /^[a-z_][a-z0-9_]*$/
const ident = (s: string) => { if (!IDENT.test(s)) throw Object.assign(new Error(`Invalid identifier: ${s}`), { code: 'PGRST100' }); return `"${s}"` }

function parseFilters(params: URLSearchParams, args: unknown[]): string[] {
  const where: string[] = []
  const reserved = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'])
  for (const [key, raw] of params) {
    if (reserved.has(key)) continue
    const col = ident(key)
    const m = raw.match(/^(not\.)?(eq|neq|gt|gte|lt|lte|in|cs|is|like|ilike|wfts|fts|plfts)(\([a-z]+\))?\.(.*)$/s)
    if (!m) throw Object.assign(new Error(`Unsupported filter ${key}=${raw}`), { code: 'PGRST100' })
    const [, not, op, , value] = m
    let clause: string
    const p = () => { args.push(value); return `$${args.length}` }
    switch (op) {
      case 'eq': clause = `${col} = ${p()}`; break
      case 'neq': clause = `${col} <> ${p()}`; break
      case 'gt': clause = `${col} > ${p()}`; break
      case 'gte': clause = `${col} >= ${p()}`; break
      case 'lt': clause = `${col} < ${p()}`; break
      case 'lte': clause = `${col} <= ${p()}`; break
      case 'like': args.push(value.replace(/\*/g, '%')); clause = `${col} like $${args.length}`; break
      case 'ilike': args.push(value.replace(/\*/g, '%')); clause = `${col} ilike $${args.length}`; break
      case 'is': clause = `${col} is ${value === 'null' ? 'null' : value === 'true' ? 'true' : 'false'}`; break
      case 'in': {
        const items = value.replace(/^\(|\)$/g, '').split(',').map(s => s.replace(/^"|"$/g, ''))
        args.push(JSON.stringify(items)); clause = `${col}::text in (select jsonb_array_elements_text($${args.length}::jsonb))`; break
      }
      case 'cs': {
        const items = value.replace(/^\{|\}$/g, '').split(',').filter(Boolean).map(s => s.replace(/^"|"$/g, ''))
        args.push(JSON.stringify(items)); clause = `${col}::text[] @> array(select jsonb_array_elements_text($${args.length}::jsonb))`; break
      }
      default: { // full-text search
        const fn = op === 'wfts' ? 'websearch_to_tsquery' : op === 'plfts' ? 'plainto_tsquery' : 'to_tsquery'
        args.push(decodeURIComponent(value)); clause = `${col} @@ ${fn}('simple', $${args.length})`
      }
    }
    where.push(not ? `not (${clause})` : clause)
  }
  return where
}

function parseOrder(order: string | null): string {
  if (!order) return ''
  return ' order by ' + order.split(',').map(part => {
    const [c, dir, nulls] = part.split('.')
    return `${ident(c)} ${dir === 'desc' ? 'desc' : 'asc'}${nulls === 'nullsfirst' ? ' nulls first' : nulls === 'nullslast' ? ' nulls last' : ''}`
  }).join(', ')
}

function projection(select: string | null, rows: Record<string, unknown>[]) {
  if (!select || select.trim() === '*') return rows
  const cols = select.split(',').map(s => s.trim()).filter(Boolean)
  if (cols.includes('*')) return rows
  cols.forEach(c => ident(c))
  return rows.map(r => Object.fromEntries(cols.map(c => [c, r[c]])))
}

function pgError(res: ServerResponse, e: any, role: string) {
  const code = e?.code ?? 'PGRST000'
  const status = code === '42501' ? (role === 'anon' ? 401 : 403) : code === '23505' || code === '23503' ? 409 : code === 'PGRST116' ? 406 : code === 'PGRST100' ? 400 : 400
  return send(res, status, { code, message: e?.message ?? 'error', details: e?.detail ?? null, hint: e?.hint ?? null })
}

async function asRole<T>(who: { role: string; claims: Record<string, unknown> }, fn: (tx: any) => Promise<T>): Promise<T> {
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [JSON.stringify(who.claims)])
    await tx.exec(`set local role ${who.role === 'authenticated' ? 'authenticated' : 'anon'}`)
    return fn(tx)
  })
}

async function handleRest(req: IncomingMessage, res: ServerResponse, url: URL) {
  const who = claimsFor(req)
  if (!who) return send(res, 401, { code: 'PGRST301', message: 'JWT expired', details: null, hint: null })
  const rest = url.pathname.replace('/rest/v1/', '')
  const prefer = String(req.headers.prefer ?? '')
  // Like PostgREST, only use RETURNING when the client asked for the rows back
  // (RETURNING needs SELECT permission, which write-only tables don't grant).
  const returning = prefer.includes('return=representation') ? ' returning *' : ''
  const wantsObject = String(req.headers.accept ?? '').includes('vnd.pgrst.object')
  const params = url.searchParams

  try {
    // RPC
    if (rest.startsWith('rpc/')) {
      const fn = ident(rest.slice(4))
      const body = ((await readBody(req)) ?? {}) as Record<string, unknown>
      const keys = Object.keys(body)
      const args = keys.map(k => body[k])
      const sql = `select * from public.${fn}(${keys.map((k, i) => `${ident(k)} => $${i + 1}`).join(', ')})`
      const rows = await asRole(who, async tx => (await tx.query(sql, args)).rows)
      return send(res, 200, rows)
    }

    const table = rest.split('/')[0]
    if (!PUBLIC_TABLES.has(table)) return send(res, 404, { code: '42P01', message: `relation "public.${table}" does not exist`, details: null, hint: null })
    const t = `public.${ident(table)}`
    const args: unknown[] = []
    let rows: Record<string, unknown>[] = []
    let total: number | null = null

    if (req.method === 'GET' || req.method === 'HEAD') {
      const where = parseFilters(params, args)
      const w = where.length ? ` where ${where.join(' and ')}` : ''
      const limit = params.get('limit'), offset = params.get('offset')
      const page = `${limit ? ` limit ${Number(limit)}` : ''}${offset ? ` offset ${Number(offset)}` : ''}`
      await asRole(who, async tx => {
        rows = (await tx.query(`select * from ${t}${w}${parseOrder(params.get('order'))}${page}`, args)).rows
        if (prefer.includes('count=exact')) total = Number((await tx.query(`select count(*)::int n from ${t}${w}`, args)).rows[0].n)
      })
    } else if (req.method === 'POST') {
      const body = await readBody(req)
      const list = (Array.isArray(body) ? body : [body]) as Record<string, unknown>[]
      const cols = [...new Set(list.flatMap(r => Object.keys(r)))]
      cols.forEach(ident)
      const colSql = cols.map(c => `"${c}"`).join(', ')
      args.push(JSON.stringify(list))
      let conflict = ''
      const onConflict = params.get('on_conflict')
      if (onConflict) {
        const target = onConflict.split(',').map(ident).join(', ')
        conflict = prefer.includes('ignore-duplicates')
          ? ` on conflict (${target}) do nothing`
          : ` on conflict (${target}) do update set ${cols.map(c => `"${c}" = excluded."${c}"`).join(', ')}`
      }
      rows = await asRole(who, async tx => (await tx.query(
        `insert into ${t} (${colSql}) select ${colSql} from jsonb_populate_recordset(null::${t}, $1::jsonb)${conflict}${returning}`, args)).rows)
    } else if (req.method === 'PATCH') {
      const body = ((await readBody(req)) ?? {}) as Record<string, unknown>
      const cols = Object.keys(body)
      cols.forEach(ident)
      args.push(JSON.stringify(body))
      const where = parseFilters(params, args)
      const set = cols.map(c => `"${c}" = (jsonb_populate_record(null::${t}, $1::jsonb))."${c}"`).join(', ')
      rows = await asRole(who, async tx => (await tx.query(`update ${t} set ${set}${where.length ? ` where ${where.join(' and ')}` : ''}${returning}`, args)).rows)
    } else if (req.method === 'DELETE') {
      const where = parseFilters(params, args)
      if (!where.length) return send(res, 400, { code: '21000', message: 'DELETE requires a WHERE clause', details: null, hint: null })
      rows = await asRole(who, async tx => (await tx.query(`delete from ${t} where ${where.join(' and ')}${returning}`, args)).rows)
    }

    const out = projection(params.get('select'), rows)
    const headers: Record<string, string> = {}
    if (total !== null || req.method === 'GET') {
      const start = Number(params.get('offset') ?? 0)
      headers['Content-Range'] = `${out.length ? `${start}-${start + out.length - 1}` : '*'}/${total ?? '*'}`
    }
    if (wantsObject) {
      if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'JSON object requested, multiple (or no) rows returned', details: `The result contains ${out.length} rows`, hint: null })
      return send(res, 200, out[0], headers)
    }
    if (req.method !== 'GET' && !prefer.includes('return=representation')) { res.writeHead(req.method === 'POST' ? 201 : 204, headers); return res.end() }
    return send(res, req.method === 'POST' ? 201 : 200, out, headers)
  } catch (e) {
    return pgError(res, e, who.role)
  }
}

// ─── Edge functions (local stand-ins) ───────────────────────────────────────

async function handleFunctions(req: IncomingMessage, res: ServerResponse, url: URL) {
  const name = url.pathname.replace('/functions/v1/', '')
  const who = claimsFor(req)
  if (name === 'delete-account') {
    if (who?.role !== 'authenticated') return send(res, 401, { error: 'Not authenticated' })
    const body = (await readBody(req)) as { confirm?: boolean } | undefined
    if (body?.confirm !== true) return send(res, 400, { error: 'Confirmation required' })
    await db.query(`delete from auth.users where id = $1`, [who.sub])
    return send(res, 200, { ok: true })
  }
  if (name === 'ai-journal-prompt') return send(res, 503, { error: 'AI features are not configured on this server.', code: 'not_configured' })
  return send(res, 404, { error: `Function ${name} is not available in the local dev backend` })
}

// ─── Server ─────────────────────────────────────────────────────────────────

createServer(async (req, res) => {
  cors(req, res)
  if (req.method === 'OPTIONS') { res.writeHead(204); return res.end() }
  const url = new URL(req.url ?? '/', `http://localhost:${PORT}`)
  try {
    if (url.pathname.startsWith('/auth/v1')) return await handleAuth(req, res, url)
    if (url.pathname.startsWith('/rest/v1/')) return await handleRest(req, res, url)
    if (url.pathname.startsWith('/functions/v1/')) return await handleFunctions(req, res, url)
    if (url.pathname === '/__dev/mailbox') return send(res, 200, mailbox)
    return send(res, 404, { error: 'not found' })
  } catch (e) {
    console.error('[dev-backend] error', (e as Error).message)
    return send(res, 500, { error: 'internal error' })
  }
}).listen(PORT, () => {
  console.log(`🌱 Bloomie dev backend (PGlite + real RLS) on http://localhost:${PORT}`)
  console.log(`   VITE_SUPABASE_URL=http://localhost:${PORT}`)
  console.log(`   VITE_SUPABASE_ANON_KEY=${ANON_KEY}`)
  console.log(`   Mailbox: http://localhost:${PORT}/__dev/mailbox   (auto-confirm: ${AUTO_CONFIRM})`)
})
