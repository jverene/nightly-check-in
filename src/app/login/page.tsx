import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";

export default async function LoginPage() {
  const session = await getSession();
  if (session?.kind === "student") redirect("/checkin");
  if (session?.kind === "staff") redirect(session.admin.role === "SPONSOR" ? "/admin" : "/roster");

  return (
    <div className="stack">
      <div>
        <h1>Sign in</h1>
        <p className="muted small" style={{ marginTop: 6 }}>
          Use the short code from your claim strip, or open your claim link again.
        </p>
      </div>
      <LoginForm />
    </div>
  );
}
