import { createHash, createHmac, randomBytes, timingSafeEqual } from "node:crypto"
import { mkdirSync } from "node:fs"
import { dirname, resolve } from "node:path"
import { DatabaseSync } from "node:sqlite"

export const sessionSeconds = 7 * 24 * 60 * 60
export const codeSeconds = 10 * 60
const maxAttempts = 5
const hash = (token: string) => createHash("sha256").update(token).digest("hex")
const newToken = () => randomBytes(32).toString("hex")
const validToken = (token?: string): token is string => Boolean(token && /^[0-9a-f]{64}$/u.test(token))
const codeHash = (token: string, code: string) => createHmac("sha256", token).update(code).digest()

const databaseKey = Symbol.for("kosmostack.auth.sqlite")
const cache = globalThis as typeof globalThis & { [databaseKey]?: DatabaseSync }
function database() {
  if (cache[databaseKey]) return cache[databaseKey]
  const filename = resolve(process.env.AUTH_DB_PATH || "data/auth.sqlite")
  mkdirSync(dirname(filename), { recursive: true })
  const db = new DatabaseSync(filename)
  try {
    db.exec(`
      PRAGMA busy_timeout = 4000;
      PRAGMA journal_mode = WAL;
      PRAGMA foreign_keys = ON;
      CREATE TABLE IF NOT EXISTS auth_users (
        id INTEGER PRIMARY KEY,
        email TEXT NOT NULL UNIQUE,
        full_name TEXT NOT NULL,
        created_at INTEGER NOT NULL,
        last_login_at INTEGER NOT NULL
      ) STRICT;
      CREATE TABLE IF NOT EXISTS auth_challenges (
        token_hash TEXT PRIMARY KEY,
        email TEXT NOT NULL,
        full_name TEXT NOT NULL,
        code_hash TEXT NOT NULL,
        attempts INTEGER NOT NULL DEFAULT 0,
        created_at INTEGER NOT NULL,
        expires_at INTEGER NOT NULL,
        used_at INTEGER
      ) STRICT;
      CREATE INDEX IF NOT EXISTS auth_challenges_email_time ON auth_challenges(email,created_at);
      CREATE INDEX IF NOT EXISTS auth_challenges_time ON auth_challenges(created_at);
      CREATE TABLE IF NOT EXISTS auth_sessions (
        token_hash TEXT PRIMARY KEY,
        user_id INTEGER NOT NULL REFERENCES auth_users(id) ON DELETE CASCADE,
        expires_at INTEGER NOT NULL
      ) STRICT;
      CREATE INDEX IF NOT EXISTS auth_sessions_expiry ON auth_sessions(expires_at);
    `)
  } catch (error) {
    db.close()
    throw error
  }
  cache[databaseKey] = db
  return db
}

function transaction<T>(run: (db: DatabaseSync) => T): T {
  const db = database()
  db.exec("BEGIN IMMEDIATE")
  try {
    const result = run(db)
    db.exec("COMMIT")
    return result
  } catch (error) {
    db.exec("ROLLBACK")
    throw error
  }
}

function screenCode(token: string) {
  const value = createHmac("sha256", token).update("local-screen-code").digest().readUInt32BE()
  return String(value % 1_000_000).padStart(6, "0")
}

export function activeLogin(token?: string) {
  if (!validToken(token)) return null
  const row = database().prepare(`SELECT email,full_name,code_hash FROM auth_challenges
    WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND attempts<?`).get(hash(token), Date.now(), maxAttempts) as
    { email: string; full_name: string; code_hash: string } | undefined
  if (!row) return null
  const code = screenCode(token)
  if (!timingSafeEqual(codeHash(token, code), Buffer.from(row.code_hash, "hex"))) return null
  return { email: row.email, fullName: row.full_name, code }
}

export function beginLogin(email: string, fullName: string, previousToken?: string) {
  const token = newToken()
  const code = screenCode(token)
  const now = Date.now()
  return transaction((db) => {
    db.prepare("DELETE FROM auth_challenges WHERE created_at <= ?").run(now - 24 * 60 * 60 * 1000)
    db.prepare("DELETE FROM auth_sessions WHERE expires_at <= ?").run(now)
    const rate = db.prepare(`SELECT count(*) FILTER (WHERE email=?) AS by_email,count(*) AS total
      FROM auth_challenges WHERE created_at > ?`).get(email, now - codeSeconds * 1000) as { by_email: number; total: number }
    if (rate.by_email >= 8 || rate.total >= 50) return null
    if (validToken(previousToken)) db.prepare("UPDATE auth_challenges SET used_at=? WHERE token_hash=? AND used_at IS NULL")
      .run(now, hash(previousToken))
    db.prepare(`INSERT INTO auth_challenges(token_hash,email,full_name,code_hash,created_at,expires_at)
      VALUES (?,?,?,?,?,?)`).run(hash(token), email, fullName, codeHash(token, code).toString("hex"), now, now + codeSeconds * 1000)
    return { token, code }
  })
}

export function finishLogin(token: string | undefined, code: string) {
  if (!validToken(token)) return null
  return transaction((db) => {
    const key = hash(token)
    const now = Date.now()
    const challenge = db.prepare(`SELECT email,full_name,code_hash FROM auth_challenges
      WHERE token_hash=? AND used_at IS NULL AND expires_at>? AND attempts<?`).get(key, now, maxAttempts) as
      { email: string; full_name: string; code_hash: string } | undefined
    if (!challenge) return null
    if (!timingSafeEqual(codeHash(token, code), Buffer.from(challenge.code_hash, "hex"))) {
      db.prepare("UPDATE auth_challenges SET attempts=attempts+1 WHERE token_hash=?").run(key)
      return null
    }
    db.prepare("UPDATE auth_challenges SET used_at=? WHERE token_hash=?").run(now, key)
    const user = db.prepare(`INSERT INTO auth_users(email,full_name,created_at,last_login_at) VALUES (?,?,?,?)
      ON CONFLICT(email) DO UPDATE SET full_name=excluded.full_name,last_login_at=excluded.last_login_at
      RETURNING id`).get(challenge.email, challenge.full_name, now, now) as { id: number }
    const session = newToken()
    db.prepare("INSERT INTO auth_sessions(token_hash,user_id,expires_at) VALUES (?,?,?)")
      .run(hash(session), user.id, now + sessionSeconds * 1000)
    return session
  })
}

export function isSignedIn(token?: string) {
  return validToken(token) && Boolean(database().prepare("SELECT 1 FROM auth_sessions WHERE token_hash=? AND expires_at>?")
    .get(hash(token), Date.now()))
}

export function signOut(token?: string) {
  if (validToken(token)) database().prepare("DELETE FROM auth_sessions WHERE token_hash=?").run(hash(token))
}

export function authAccount(token?: string) {
  if (!validToken(token)) return null
  const user = database().prepare(
    "SELECT u.email,u.full_name FROM auth_sessions s JOIN auth_users u ON u.id=s.user_id WHERE s.token_hash=? AND s.expires_at>?"
  ).get(hash(token), Date.now()) as { email: string; full_name: string } | undefined
  return user ? { id: hash(user.email), email: user.email, name: user.full_name } : null
}
