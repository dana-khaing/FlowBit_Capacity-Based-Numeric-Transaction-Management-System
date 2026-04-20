import { type AuthUser } from "@/lib/auth-client";

type ProfileDetailsCardProps = {
  user: AuthUser;
};

const accountRows = (user: AuthUser) => [
  { label: "Full name", value: user.full_name || "Not provided" },
  { label: "Username", value: user.username },
  { label: "Email address", value: user.email || "Not provided" },
  { label: "Phone number", value: user.phone_number || "Not provided" },
];

export function ProfileDetailsCard({ user }: ProfileDetailsCardProps) {
  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Account Details</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Profile information</h2>
        <p className="mt-2 text-sm leading-6 text-stone-500">
          This page shows the account details currently linked to your FlowBit session.
        </p>
      </div>

      <div className="mt-6 divide-y divide-stone-900/8 rounded-[24px] border border-stone-900/8 bg-[#f8f6f2]">
        {accountRows(user).map((row) => (
          <div key={row.label} className="grid gap-2 px-5 py-4 sm:grid-cols-[180px_minmax(0,1fr)] sm:items-center">
            <p className="text-sm font-medium text-stone-500">{row.label}</p>
            <p className="text-base text-stone-900">{row.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}
