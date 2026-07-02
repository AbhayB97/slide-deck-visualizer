import { ReactNode } from "react";

export function DotGridBackground({ children }: { children: ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_top,#eef2ff_0%,#f8fafc_45%,#f1f5f9_100%)]">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(rgba(15,23,42,0.045)_1px,transparent_1px),linear-gradient(90deg,rgba(15,23,42,0.045)_1px,transparent_1px)] bg-[size:22px_22px]" />
      <div className="relative">{children}</div>
    </div>
  );
}
