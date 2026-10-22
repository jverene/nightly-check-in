import type { Metadata } from "next";
import { DemoForm } from "./demo-form";

export const metadata: Metadata = {
  title: "Demo — Nightly Check-In",
};

export default function DemoPage() {
  return <DemoForm />;
}
