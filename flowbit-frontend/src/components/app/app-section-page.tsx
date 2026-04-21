import { ReactNode } from "react";
import { WorkspaceShell } from "@/components/app/workspace-shell";

type AppSectionPageProps = {
  eyebrow: string;
  title: string;
  description: string;
  children?: ReactNode;
};

export function AppSectionPage({ eyebrow, title, description, children }: AppSectionPageProps) {
  return (
    <WorkspaceShell>
      <div className="mx-auto w-full max-w-[1800px] px-4 py-5 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
          <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">{eyebrow}</p>
          <h1 className="mt-3 text-4xl font-semibold tracking-[-0.02em] text-stone-950 sm:text-5xl">{title}</h1>
          <p className="mt-4 max-w-3xl text-base leading-7 text-stone-500 sm:text-lg">{description}</p>
        </section>

        <section className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1.5fr)_minmax(320px,0.9fr)]">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Workspace</p>
            <div className="mt-4">{children}</div>
          </article>

          <aside className="rounded-[28px] border border-stone-900/8 bg-[#f3f0ea] p-5 shadow-[0_8px_24px_rgba(28,24,20,0.03)] sm:p-6">
            <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Coming next</p>
            <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-500">
              <li>Connect this screen to the live backend endpoint for its operational data.</li>
              <li>Keep actions in reusable cards, tables, and forms instead of page-level hardcoding.</li>
              <li>Use the same drawer navigation and header controls across every section.</li>
            </ul>
          </aside>
        </section>
      </div>
    </WorkspaceShell>
  );
}
