"use client";

import Link from "next/link";

export function AdminNav() {
  async function signOut() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <nav className="nav-row">
      <Link href="/admin">Admin home</Link>
      <a
        href="#"
        onClick={(e) => {
          e.preventDefault();
          signOut();
        }}
      >
        Sign out
      </a>
    </nav>
  );
}
