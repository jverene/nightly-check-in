import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/session";
import { SetupForm } from "./setup-form";

export const dynamic = "force-dynamic";

export default async function SetupPage() {
  const session = await requireStudent();
  if (!session) redirect("/login");

  return (
    <div className="stack">
      <div>
        <h1>Your courses</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          {session.slot.arm === "INTERVENTION"
            ? "Pick the courses you're taking and add any test dates you know. You can change this later."
            : "Optional: add test dates so the study has a test calendar for your class. You won't see countdowns or planning."}
        </p>
      </div>
      <SetupForm arm={session.slot.arm} />
    </div>
  );
}
