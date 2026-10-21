import { redirect } from "next/navigation";
import { getSession } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function Home() {
  const session = await getSession();
  if (session?.kind === "student") redirect("/checkin");
  if (session?.kind === "staff") redirect(session.admin.role === "SPONSOR" ? "/admin" : "/roster");
  redirect("/login");
}
