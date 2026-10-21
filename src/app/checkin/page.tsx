import { redirect } from "next/navigation";
import { requireStudent } from "@/lib/session";
import { CheckinForm } from "./checkin-form";

export const dynamic = "force-dynamic";

export default async function CheckinPage() {
  const session = await requireStudent();
  if (!session) redirect("/login");
  return <CheckinForm />;
}
