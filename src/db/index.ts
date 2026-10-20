import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

let client: postgres.Sql | null = null;

function getClient() {
  if (!client) {
    const url = process.env.DATABASE_URL;
    if (!url) throw new Error("DATABASE_URL is not set");
    // prepare:false is required for pooled connections (Neon/Supabase PgBouncer).
    client = postgres(url, { prepare: false, max: 3 });
  }
  return client;
}

let database: ReturnType<typeof drizzle<typeof schema>> | null = null;

export function db() {
  if (!database) database = drizzle(getClient(), { schema });
  return database;
}

export { schema };
