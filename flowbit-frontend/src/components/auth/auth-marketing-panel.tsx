import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faChartLine, faClock, faUsers } from "@fortawesome/free-solid-svg-icons";
import { Card, CardContent } from "@/components/ui/card";

const authHighlights = [
  {
    icon: faChartLine,
    text: "Monitor daily activity, capacity usage, and pending work from one place.",
  },
  {
    icon: faUsers,
    text: "Review entries, collaborator activity, and reports in a consistent workspace.",
  },
  {
    icon: faClock,
    text: "Stay aligned with the current period and respond quickly to operational changes.",
  },
];

const infoCards = [
  { label: "Workspace", value: "FlowBit Admin" },
  { label: "Access", value: "Secure sign-in" },
  { label: "Support", value: "Need help? Contact your administrator" },
];

export function AuthMarketingPanel() {
  return (
    <Card className="bg-[#1f1712] p-6 text-stone-50 shadow-[0_20px_60px_rgba(54,30,8,0.18)] sm:p-8 lg:w-[46%]">
      <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/6 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-200">
        FlowBit Workspace
      </div>
      <h1 className="mt-5 font-serif text-4xl leading-tight text-white sm:text-5xl">
        Sign in to continue to your FlowBit workspace.
      </h1>
      <p className="mt-4 max-w-xl text-sm leading-7 text-stone-300 sm:text-[15px]">
        Access your daily dashboard, review activity, and continue the work assigned to your account with a simple,
        focused sign-in experience.
      </p>

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {infoCards.map((item) => (
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
        <p className="text-[11px] uppercase tracking-[0.2em] text-stone-400">What You Can Do</p>
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
