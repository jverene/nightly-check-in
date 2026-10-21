import { redirect } from "next/navigation";
import { requireStaff } from "@/lib/session";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const staff = await requireStaff("SPONSOR");
  if (!staff) redirect("/login");
  return <>{children}</>;
}
