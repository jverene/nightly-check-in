import { sql } from "drizzle-orm";
import { db } from "@/db";

/**
 * Postgres-backed fixed-window rate limiting. In-memory limiting does not
 * work on serverless; at this study's scale (~45 users) a table is plenty.
 */
export async function rateLimit(
  key: string,
  limit: number,
  windowSeconds = 60,
): Promise<{ ok: boolean; retryAfterSeconds: number }> {
  const database = db();
  if (Math.random() < 0.05) {
    await database.execute(sql`delete from rate_limits where window_start < now() - interval '1 hour'`);
  }
  const rows = await database.execute<{ count: number; retry: number }>(sql`
    insert into rate_limits (key, window_start, count)
    values (
      ${key},
      to_timestamp(floor(extract(epoch from now()) / ${windowSeconds}) * ${windowSeconds}),
      1
    )
    on conflict (key, window_start) do update set count = rate_limits.count + 1
    returning count,
      (ceil((extract(epoch from now()) / ${windowSeconds})) * ${windowSeconds}
        - extract(epoch from now()))::int as retry
  `);
  const row = rows[0];
  return { ok: row.count <= limit, retryAfterSeconds: Math.max(1, row.retry) };
}

export function clientIp(request: Request): string {
  const fwd = request.headers.get("x-forwarded-for");
  return fwd?.split(",")[0]?.trim() || "unknown";
}
