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
          Pick the courses you&rsquo;re taking (up to 8). You can change this later.
        </p>
      </div>
      <SetupForm />
    </div>
  );
}
