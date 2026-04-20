import { ReactNode } from "react";
import { AppHeader } from "@/components/app/app-header";
import { SessionGuard } from "@/components/auth/session-guard";

type WorkspaceShellProps = {
  children: ReactNode;
};

export function WorkspaceShell({ children }: WorkspaceShellProps) {
  return (
    <SessionGuard>
      <main className="min-h-screen bg-[#efede8] text-stone-900">
        <div className="border-b border-stone-900/8 bg-white/90">
          <AppHeader />
        </div>
        {children}
      </main>
    </SessionGuard>
  );
}
