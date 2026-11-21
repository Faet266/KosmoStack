import type { Pool } from "pg"
export function postgresPool(): Pool
export function preparePostgres(pool: Pool): Promise<void>
