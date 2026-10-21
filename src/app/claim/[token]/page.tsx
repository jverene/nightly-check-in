import { eq } from "drizzle-orm";
import { db } from "@/db";
import { slots } from "@/db/schema";
import { ClaimForm } from "./claim-form";

export const dynamic = "force-dynamic";

export default async function ClaimPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const rows = await db().select().from(slots).where(eq(slots.claimToken, token)).limit(1);
  const slot = rows[0];

  if (!slot) {
    return (
      <div className="card stack">
        <h1>This link isn&rsquo;t valid</h1>
        <p className="muted small">
          Check the link on your claim strip and try again, or ask the sponsor for a new one.
        </p>
      </div>
    );
  }

  return (
    <div className="stack">
      <div>
        <h1>{slot.claimedAt ? "Welcome back" : "Claim your spot"}</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          {slot.claimedAt
            ? "Enter your PIN to sign in on this device."
            : "Choose a 4-digit PIN. You'll use it with your code to sign in."}
        </p>
      </div>
      <ClaimForm token={token} claimed={!!slot.claimedAt} locked={slot.locked} />
    </div>
  );
}
