import { eq, and, gt, lt } from "drizzle-orm";
import { cookies } from "next/headers";
import { db } from "@/db";
import { adminUsers, sessions, slots, type AdminUser, type Slot } from "@/db/schema";
import { generateSessionId } from "./codes";

export const SESSION_COOKIE = "nc_session";
const SESSION_DAYS = 30;
const RENEW_WITHIN_DAYS = 15;

export type StudentSession = { kind: "student"; sessionId: string; slot: Slot };
export type StaffSession = { kind: "staff"; sessionId: string; admin: AdminUser };
export type AnySession = StudentSession | StaffSession;

async function createSession(row: { participantCode?: string; adminUserId?: string }) {
  const id = generateSessionId();
  const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await db().insert(sessions).values({ id, expiresAt, ...row });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, id, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    expires: expiresAt,
  });
  return id;
}

export function createStudentSession(participantCode: string) {
  return createSession({ participantCode });
}

export function createStaffSession(adminUserId: string) {
  return createSession({ adminUserId });
}

/**
 * Reads the session cookie and resolves it. Sliding expiration: sessions past
 * half-life are renewed in the DB; the cookie itself is re-set by route
 * handlers (server components cannot set cookies).
 */
export async function getSession(): Promise<AnySession | null> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (!id) return null;

  const rows = await db().select().from(sessions).where(eq(sessions.id, id)).limit(1);
  const session = rows[0];
  if (!session) return null;
  if (session.expiresAt.getTime() < Date.now()) {
    await db().delete(sessions).where(eq(sessions.id, id));
    return null;
  }

  if (session.expiresAt.getTime() < Date.now() + RENEW_WITHIN_DAYS * 86_400_000) {
    const expiresAt = new Date(Date.now() + SESSION_DAYS * 86_400_000);
    await db().update(sessions).set({ expiresAt }).where(eq(sessions.id, id));
    // Best-effort cookie refresh; silently skipped in server components.
    try {
      jar.set(SESSION_COOKIE, id, {
        httpOnly: true,
        sameSite: "lax",
        secure: process.env.NODE_ENV === "production",
        path: "/",
        expires: expiresAt,
      });
    } catch {
      /* read-only context */
    }
  }

  if (session.participantCode) {
    const slotRows = await db()
      .select()
      .from(slots)
      .where(eq(slots.participantCode, session.participantCode))
      .limit(1);
    if (!slotRows[0]) return null;
    return { kind: "student", sessionId: id, slot: slotRows[0] };
  }
  if (session.adminUserId) {
    const adminRows = await db()
      .select()
      .from(adminUsers)
      .where(eq(adminUsers.id, session.adminUserId))
      .limit(1);
    if (!adminRows[0]) return null;
    return { kind: "staff", sessionId: id, admin: adminRows[0] };
  }
  return null;
}

export async function requireStudent(): Promise<StudentSession | null> {
  const s = await getSession();
  return s?.kind === "student" ? s : null;
}

/** role "SPONSOR" excludes teachers; omit to allow any staff. */
export async function requireStaff(role?: "TEACHER" | "SPONSOR"): Promise<StaffSession | null> {
  const s = await getSession();
  if (s?.kind !== "staff") return null;
  if (role && s.admin.role !== role) return null;
  return s;
}

export async function destroySession(): Promise<void> {
  const jar = await cookies();
  const id = jar.get(SESSION_COOKIE)?.value;
  if (id) await db().delete(sessions).where(eq(sessions.id, id));
  jar.delete(SESSION_COOKIE);
}

/** Token rotation and withdrawal both invalidate every login for a code. */
export async function destroySessionsForParticipant(participantCode: string): Promise<void> {
  await db().delete(sessions).where(eq(sessions.participantCode, participantCode));
}

/** Occasional sweeps keep the table small. */
export async function sweepExpiredSessions(): Promise<void> {
  await db().delete(sessions).where(lt(sessions.expiresAt, new Date()));
}

export async function hasActiveSessionFor(participantCode: string): Promise<boolean> {
  const rows = await db()
    .select({ id: sessions.id })
    .from(sessions)
    .where(and(eq(sessions.participantCode, participantCode), gt(sessions.expiresAt, new Date())))
    .limit(1);
  return rows.length > 0;
}
