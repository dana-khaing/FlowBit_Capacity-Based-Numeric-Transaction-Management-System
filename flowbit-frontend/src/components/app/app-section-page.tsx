import { ReactNode } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";

type AppSectionPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
  aside?: ReactNode;
  showDefaultAside?: boolean;
  workspaceLabel?: string;
  headerClassName?: string;
  layoutClassName?: string;
  workspaceClassName?: string;
  asideClassName?: string;
};

export function AppSectionPage({
  title,
  children,
  aside,
  showDefaultAside = true,
  workspaceLabel,
  layoutClassName,
  workspaceClassName,
  asideClassName,
}: AppSectionPageProps) {
  const hasAside = Boolean(aside) || showDefaultAside;

  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
        <section className={`${hasAside ? "grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]" : ""} ${layoutClassName ?? ""}`}>
          <article className={`rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6 ${workspaceClassName ?? ""}`}>
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">{workspaceLabel ?? title}</p>
            <div className="mt-4">{children}</div>
          </article>

          {aside ? (
            <div className={asideClassName}>{aside}</div>
          ) : showDefaultAside ? (
            <aside className="rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
              <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Coming next</p>
              <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-500">
                <li>Connect this screen to the live backend endpoint for its operational data.</li>
                <li>Keep actions in reusable cards, tables, and forms instead of page-level hardcoding.</li>
                <li>Use the same drawer navigation and header controls across every section.</li>
              </ul>
            </aside>
          ) : null}
        </section>
      </div>
    </WorkspaceShell>
  );
}
