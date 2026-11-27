"use client";

import { Sidebar } from "@/components/shell/sidebar";
import { Topbar } from "@/components/shell/topbar";
import { cn } from "@/lib/format";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const pathname = usePathname();
  useEffect(() => setMenuOpen(false), [pathname]);

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1600px] gap-2 p-2 sm:p-4">
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:left-4 focus:top-4 focus:z-50 focus:rounded-full focus:bg-ink focus:px-4 focus:py-2 focus:text-white"
      >
        Skip to content
      </a>

      <aside className="sticky top-4 hidden h-[calc(100dvh-2rem)] w-60 shrink-0 rounded-[var(--radius-panel)] bg-surface/40 lg:block">
        <Sidebar />
      </aside>

      {/* Mobile drawer */}
      <div
        className={cn("fixed inset-0 z-40 bg-ink/20 backdrop-blur-sm transition-opacity lg:hidden", menuOpen ? "opacity-100" : "pointer-events-none opacity-0")}
        onClick={() => setMenuOpen(false)}
        aria-hidden
      />
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-64 bg-canvas transition-transform lg:hidden",
          menuOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!menuOpen}
      >
        <Sidebar onNavigate={() => setMenuOpen(false)} />
      </aside>

      <div className="flex min-w-0 flex-1 flex-col px-2 sm:px-4">
        <Topbar onOpenMenu={() => setMenuOpen(true)} />
        <main id="main" className="flex-1 pb-8">
          {children}
        </main>
      </div>
    </div>
  );
}
