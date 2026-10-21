import { db } from "@/db";
import { auditLog } from "@/db/schema";

export type ActorRole = "STUDENT" | "TEACHER" | "SPONSOR" | "SYSTEM";

/** Sponsor actions, exports, deletions, rotations, and auth failures all land here. */
export async function audit(
  actorRole: ActorRole,
  action: string,
  participantCode?: string | null,
  meta?: Record<string, unknown>,
): Promise<void> {
  await db().insert(auditLog).values({
    actorRole,
    action,
    participantCode: participantCode ?? null,
    meta: meta ?? null,
  });
}
