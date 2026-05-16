"use client";

import Link from "next/link";
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import {
  faArrowUpRightFromSquare,
  faCalendarDays,
  faFileLines,
  faGear,
  faTicket,
  faShieldHalved,
  faUsersGear,
} from "@fortawesome/free-solid-svg-icons";
import { WorkspaceShell } from "@/components/app/workspace-shell";
import { AdminAccessGuard } from "@/components/admin/admin-access-guard";
import { getApiBaseUrl } from "@/lib/api";

const buildAdminLinks = () => {
  const apiBaseUrl = getApiBaseUrl();
  const backendBaseUrl = apiBaseUrl.replace(/\/api$/, "");

  return [
    {
      title: "User management",
      description: "Review users, roles, and access state inside the app.",
      href: "/admin/users",
      icon: faUsersGear,
      external: false,
    },
    {
      title: "Override codes",
      description: "Create or rotate admin override codes safely.",
      href: "/admin/override-codes",
      icon: faGear,
      external: false,
    },
    {
      title: "Audit logs",
      description: "Inspect approvals, refunds, period changes, and admin actions.",
      href: "/admin/audit-logs",
      icon: faFileLines,
      external: false,
    },
    {
      title: "Periods",
      description: "Open, adjust, pre-close, and review period control settings.",
      href: "/periods",
      icon: faCalendarDays,
      external: false,
    },
    {
      title: "Lucky Number Announce",
      description: "Open the period workspace to set reveal time, announce the lucky number, or review winner state.",
      href: "/periods",
      icon: faTicket,
      external: false,
    },
    {
      title: "API docs",
      description: "Open the protected backend API documentation.",
      href: `${backendBaseUrl}/api/docs/`,
      icon: faArrowUpRightFromSquare,
      external: true,
    },
    {
      title: "Django admin",
      description: "Open the full backend admin console for maintenance tasks.",
      href: `${backendBaseUrl}/admin/`,
      icon: faShieldHalved,
      external: true,
    },
  ];
};

export function AdminPanelPage() {
  return (
    <AdminAccessGuard>
      {(user) => (
        <WorkspaceShell>
          <div className="mx-auto w-full max-w-[1800px] px-4 py-3 sm:px-6 lg:px-8 lg:py-5">
            <div className="space-y-5">
              <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
                <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-400">Admin</p>
                <h1 className="mt-2 text-3xl font-semibold text-stone-950">Admin Panel</h1>
                <p className="mt-3 max-w-3xl text-sm leading-6 text-stone-500">
                  Central access for operational controls, audit review, user management, and backend maintenance.
                </p>
                <div className="mt-5 flex flex-wrap gap-3 text-sm text-stone-500">
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f1ea] px-3 py-2">
                    Signed in as {user.full_name || user.username}
                  </span>
                  <span className="inline-flex items-center gap-2 rounded-full bg-[#f5f1ea] px-3 py-2">
                    Administrator access
                  </span>
                </div>
              </section>

              <section className="grid gap-5 lg:grid-cols-2 xl:grid-cols-3">
                {buildAdminLinks().map((item) =>
                  item.external ? (
                    <a
                      key={item.title}
                      href={item.href}
                      target="_blank"
                      rel="noreferrer"
                      className="rounded-[26px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:bg-stone-50"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f1ea] text-stone-700">
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold text-stone-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
                    </a>
                  ) : (
                    <Link
                      key={item.title}
                      href={item.href}
                      className="rounded-[26px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] transition hover:bg-stone-50"
                    >
                      <span className="inline-flex h-11 w-11 items-center justify-center rounded-2xl bg-[#f5f1ea] text-stone-700">
                        <FontAwesomeIcon icon={item.icon} className="h-4 w-4" />
                      </span>
                      <h2 className="mt-4 text-xl font-semibold text-stone-950">{item.title}</h2>
                      <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
                    </Link>
                  ),
                )}
              </section>
            </div>
          </div>
        </WorkspaceShell>
      )}
    </AdminAccessGuard>
  );
}
