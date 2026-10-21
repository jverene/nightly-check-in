"use client";

export function PrintButton() {
  return (
    <button className="btn" style={{ width: "auto" }} onClick={() => window.print()}>
      Print
    </button>
  );
}
