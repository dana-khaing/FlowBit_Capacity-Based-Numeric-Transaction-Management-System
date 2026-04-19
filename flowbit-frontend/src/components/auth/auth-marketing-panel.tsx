import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faDatabase, faKey, faShieldHalved } from "@fortawesome/free-solid-svg-icons";
import { Card, CardContent } from "@/components/ui/card";

const authHighlights = [
  {
    icon: faKey,
    text: "Username/password login for daily operations",
  },
  {
    icon: faShieldHalved,
    text: "Google sign-in ready for frontend integration",
  },
  {
    icon: faDatabase,
    text: "Admin override and audit-protected backend flows",
  },
];

const envChecks = [
  { label: "API", value: "Backend ready" },
  { label: "Auth", value: "Token endpoints live" },
  { label: "DB", value: "Supabase connected" },
];

export function AuthMarketingPanel() {
  return (
    <Card className="bg-[#1f1712] p-6 text-stone-50 shadow-[0_20px_60px_rgba(54,30,8,0.18)] sm:p-8 lg:w-[46%]">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
        FlowBit Workspace
      </div>
      <h1 className="mt-5 font-serif text-4xl leading-tight text-white sm:text-5xl">
        Sign in to manage periods, ledgers, overflow approvals, and reports.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-300 sm:text-[15px]">
        This screen should feel calm and direct. Operators can sign in with their FlowBit account now, and the same
        entry point can later attach the Google flow without changing the layout.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {envChecks.map((item) => (
          <Card key={item.label} className="rounded-[22px] border-white/10 bg-white/6">
            <CardContent className="px-4 py-4">
              <p className="text-[11px] uppercase tracking-[0.18em] text-stone-400">{item.label}</p>
              <p className="mt-2 text-lg font-medium text-white">{item.value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Card className="mt-8 rounded-[26px] border-white/10 bg-white/6">
        <CardContent className="p-5">
        <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">Included in backend</p>
        <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-300">
          {authHighlights.map((item) => (
            <li key={item.text} className="flex gap-3">
              <span className="mt-0.5 flex h-8 w-8 items-center justify-center rounded-full bg-white/8 text-amber-300">
                <FontAwesomeIcon icon={item.icon} className="h-3.5 w-3.5" />
              </span>
              <span>{item.text}</span>
            </li>
          ))}
        </ul>
        </CardContent>
      </Card>
    </Card>
  );
}
