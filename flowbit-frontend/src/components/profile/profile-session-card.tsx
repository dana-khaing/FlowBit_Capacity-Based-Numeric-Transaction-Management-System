import { type AuthUser } from "@/lib/auth-client";

type ProfileSessionCardProps = {
  user: AuthUser;
};

function formatDateTime(value: string | null) {
  if (!value) {
    return "Not available";
  }

  try {
    return new Intl.DateTimeFormat("en-GB", {
      dateStyle: "medium",
      timeStyle: "short",
    }).format(new Date(value));
  } catch {
    return value;
  }
}

const buildSessionRows = (user: AuthUser) => [
  { label: "Active role", value: user.role || "Not available" },
  { label: "Last login", value: formatDateTime(user.last_login) },
  { label: "Last activity", value: formatDateTime(user.last_activity) },
  { label: "Member since", value: formatDateTime(user.date_joined) },
];

export function ProfileSessionCard({ user }: ProfileSessionCardProps) {
  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Session</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Activity and access</h2>
      </div>

      <div className="mt-5 divide-y divide-stone-900/8 rounded-[24px] border border-stone-900/8 bg-[#f8f6f2]">
        {buildSessionRows(user).map((row) => (
          <div key={row.label} className="grid gap-2 px-5 py-4 sm:grid-cols-[160px_minmax(0,1fr)] sm:items-center">
            <p className="text-sm font-medium capitalize text-stone-500">{row.label}</p>
            <p className="text-base text-stone-900">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
