import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

/**
 * The public demo is the landing page for now: anyone who opens the app sees
 * the nightly flow instead of a login screen. Students and staff still reach
 * their own pages through /login.
 */
export default function Home() {
  redirect("/demo");
}
