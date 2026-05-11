"use client";

import { ReactNode, useState } from "react";
import { AppHeader } from "@/components/app/app-header";
import { PreCloseOverflowToast } from "@/components/app/pre-close-overflow-toast";
import { AppSideDrawer } from "@/components/app/app-side-drawer";
import { SessionGuard } from "@/components/auth/session-guard";

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);

  return (
    <SessionGuard>
      <main className="min-h-screen bg-[#efede8] text-stone-900">
        <PreCloseOverflowToast />
        <div className="print:hidden">
          <AppSideDrawer open={isDrawerOpen} onClose={() => setIsDrawerOpen(false)} />
        </div>
        <div className="border-b border-stone-900/8 bg-white/90 print:hidden">
          <AppHeader onMenuClick={() => setIsDrawerOpen(true)} />
        </div>
        {children}
      </main>
    </SessionGuard>
  );
}
