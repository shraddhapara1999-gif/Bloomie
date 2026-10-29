// Runs the real Supabase migrations inside PGlite (in-process Postgres) with a
// minimal stand-in for Supabase's `auth` schema and API roles, so Row Level
// Security can be tested exactly as written without a hosted project.
import { PGlite } from '@electric-sql/pglite'
import { pgcrypto } from '@electric-sql/pglite/contrib/pgcrypto'
import { readdirSync, readFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const MIGRATIONS_DIR = join(dirname(fileURLToPath(import.meta.url)), '..', '..', 'supabase', 'migrations')

const AUTH_STUB = `
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;
create schema if not exists extensions;
create schema auth;
create table auth.users (
  id uuid primary key default gen_random_uuid(),
  email text unique,
  raw_user_meta_data jsonb default '{}'::jsonb,
  raw_app_meta_data jsonb default '{}'::jsonb
);
create function auth.jwt() returns jsonb language sql stable as $$
  select coalesce(nullif(current_setting('request.jwt.claims', true), ''), '{}')::jsonb
$$;
create function auth.uid() returns uuid language sql stable as $$
  select nullif(auth.jwt() ->> 'sub', '')::uuid
$$;
grant usage on schema auth, public, extensions to anon, authenticated, service_role;
grant execute on all functions in schema auth to anon, authenticated, service_role;
alter default privileges in schema public grant all on tables to anon, authenticated, service_role;
alter default privileges in schema public grant all on sequences to anon, authenticated, service_role;
alter default privileges in schema public grant execute on functions to anon, authenticated, service_role;
`

export async function createDb(dataDir?: string) {
  // Return date/time columns as plain strings, the way PostgREST serialises them.
  const asText = (v: string) => v
  const options = { extensions: { pgcrypto }, parsers: { 1082: asText, 1083: asText } }
  const db = dataDir ? new PGlite(dataDir, options) : new PGlite(options)
  const ready = await db.query(`select to_regclass('auth.users') as auth, to_regclass('public.profiles') as profiles`)
  const state = ready.rows[0] as { auth: string | null; profiles: string | null }
  if (!state.auth) await db.exec(AUTH_STUB)

  // Track applied migrations so a persisted dev database picks up new ones.
  await db.exec(`create table if not exists auth.dev_migrations (name text primary key, applied_at timestamptz default now())`)
  const files = readdirSync(MIGRATIONS_DIR).filter(f => f.endsWith('.sql')).sort()
  const applied = new Set((await db.query<{ name: string }>('select name from auth.dev_migrations')).rows.map(r => r.name))
  if (state.profiles && applied.size === 0) {
    // Database created before tracking existed: the original three migrations are already in place.
    for (const f of files.slice(0, 3)) { await db.query('insert into auth.dev_migrations (name) values ($1)', [f]); applied.add(f) }
  }
  for (const f of files) {
    if (applied.has(f)) continue
    await db.exec(readFileSync(join(MIGRATIONS_DIR, f), 'utf8'))
    await db.query('insert into auth.dev_migrations (name) values ($1)', [f])
  }
  return db
}

export async function createUser(db: PGlite, email: string, meta: Record<string, unknown> = {}, appMeta: Record<string, unknown> = {}) {
  const res = await db.query<{ id: string }>(
    'insert into auth.users (email, raw_user_meta_data, raw_app_meta_data) values ($1, $2, $3) returning id',
    [email, JSON.stringify(meta), JSON.stringify(appMeta)],
  )
  return res.rows[0].id
}

/** Run `fn` as an API role, the way PostgREST does for a request with a JWT. */
export async function as<T>(
  db: PGlite,
  who: { role: 'anon' | 'authenticated' | 'service_role'; sub?: string; appMeta?: Record<string, unknown> },
  fn: (tx: Pick<PGlite, 'query' | 'exec'>) => Promise<T>,
): Promise<T> {
  const claims = JSON.stringify({ sub: who.sub ?? '', role: who.role, app_metadata: who.appMeta ?? {} })
  return db.transaction(async tx => {
    await tx.query(`select set_config('request.jwt.claims', $1, true)`, [claims])
    await tx.exec(`set local role ${who.role}`)
    return fn(tx as unknown as Pick<PGlite, 'query' | 'exec'>)
  })
}
