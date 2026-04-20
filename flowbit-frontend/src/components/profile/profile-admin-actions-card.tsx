import { getApiBaseUrl } from "@/lib/api";
import { type AuthUser } from "@/lib/auth-client";

type ProfileAdminActionsCardProps = {
  user: AuthUser;
};

const buildAdminLinks = () => {
  const apiBaseUrl = getApiBaseUrl();
  const backendBaseUrl = apiBaseUrl.replace(/\/api$/, "");

  return [
    {
      label: "User management",
      href: `${apiBaseUrl}/users/`,
      description: "Review users, roles, and admin account setup.",
    },
    {
      label: "Audit logs",
      href: `${apiBaseUrl}/audit-logs/`,
      description: "Inspect operational audit entries and recent changes.",
    },
    {
      label: "API docs",
      href: `${backendBaseUrl}/api/docs/`,
      description: "Open the protected API reference and testing surface.",
    },
    {
      label: "Django admin",
      href: `${backendBaseUrl}/admin/`,
      description: "Access the full admin console for maintenance tasks.",
    },
  ];
};

export function ProfileAdminActionsCard({ user }: ProfileAdminActionsCardProps) {
  if (user.role !== "admin") {
    return null;
  }

  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Admin</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Admin actions</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          Your account has administrator access. These links open the backend tools used for user and audit operations.
        </p>
      </div>

      <div className="mt-5 grid gap-4">
        {buildAdminLinks().map((item) => (
          <a
            key={item.label}
            href={item.href}
            target="_blank"
            rel="noreferrer"
            className="rounded-[22px] border border-stone-900/8 bg-[#f8f6f2] px-4 py-4 transition hover:bg-stone-100"
          >
            <p className="text-base font-semibold text-stone-900">{item.label}</p>
            <p className="mt-2 text-sm leading-6 text-stone-500">{item.description}</p>
          </a>
        ))}
      </div>
    </section>
  );
}
