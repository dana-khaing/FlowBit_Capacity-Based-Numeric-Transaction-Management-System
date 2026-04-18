const primaryMetrics = [
  { label: "Open Period", value: "April 2026", meta: "1 active period" },
  { label: "Pending TCSO", value: "12", meta: "3 urgent approvals" },
  { label: "Refund Queue", value: "4", meta: "Override required" },
  { label: "Collaborators", value: "18", meta: "Private contacts" },
];

const railItems = [
  { label: "Dashboard", short: "DB", active: true },
  { label: "Tickets", short: "TK" },
  { label: "Overflow", short: "OF" },
  { label: "Ledgers", short: "LG" },
  { label: "Reports", short: "RP" },
  { label: "Audit", short: "AU" },
];

const quickActions = [
  "New ticket",
  "Preview allocation",
  "Approve TCSO",
  "Export collaborator",
];

const liveQueue = [
  {
    identifier: "223",
    title: "Needs collaborator approval",
    amount: "34.40",
    state: "critical",
    note: "Close time is approaching. User can approve with a selected collaborator only.",
  },
  {
    identifier: "234",
    title: "Refund waiting for override",
    amount: "35.00",
    state: "warning",
    note: "Ticket refund is blocked until a valid admin override code is supplied.",
  },
  {
    identifier: "402",
    title: "Reserve capacity available",
    amount: "18.60",
    state: "calm",
    note: "Identifier-specific helper capacity exists and can absorb the next overflow first.",
  },
];

const ledgers = [
  {
    name: "Primary Ledger",
    priority: "P1",
    used: "82%",
    free: "180.00",
    detail: "Main allocation lane. Default auto-fill target for active identifiers.",
  },
  {
    name: "Reserve Overflow",
    priority: "P2",
    used: "56%",
    free: "55.00",
    detail: "Consumes helper-backed identifier capacity created from approved CSO.",
  },
  {
    name: "Archive Catch-Up",
    priority: "P3",
    used: "34%",
    free: "420.00",
    detail: "Lower-priority buffer used for later recovery and archive-side balancing.",
  },
];

const activityFeed = [
  {
    title: "Manual allocation preview is ready",
    detail: "Users can decide how much goes into each ledger before overflow is confirmed.",
  },
  {
    title: "Collaborator exports support CSV and PDF",
    detail: "Reports can sort by identifier or approval time per selected collaborator.",
  },
  {
    title: "Supabase database is live",
    detail: "The backend is already migrated and connected through the hosted Postgres pooler.",
  },
];

const boardColumns = [
  {
    label: "Entry",
    caption: "Touch-friendly on tablet",
    items: ["Ticket scan", "Identifier search", "Manual ledger split"],
  },
  {
    label: "Approval",
    caption: "Fast operator review",
    items: ["TCSO to CSO", "Collaborator select", "Admin override checks"],
  },
  {
    label: "Control",
    caption: "Wide-screen operations",
    items: ["Ledger pressure", "Period timing", "Audit and reports"],
  },
];

function stateClasses(state: string) {
  if (state === "critical") {
    return "border-red-300 bg-red-50 text-red-900";
  }
  if (state === "warning") {
    return "border-amber-300 bg-amber-50 text-amber-950";
  }
  return "border-emerald-300 bg-emerald-50 text-emerald-950";
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(248,165,76,0.18),_transparent_24%),radial-gradient(circle_at_bottom_right,_rgba(24,70,105,0.15),_transparent_22%),linear-gradient(180deg,_#f5ecdd_0%,_#efe1cb_45%,_#e4d4bc_100%)] text-stone-900">
      <div className="mx-auto flex min-h-screen max-w-[1700px] flex-col lg:flex-row">
        <aside className="hidden w-[118px] shrink-0 border-r border-stone-900/10 bg-stone-950 text-stone-100 lg:flex lg:flex-col lg:justify-between">
          <div className="px-6 py-8">
            <div className="flex h-14 w-14 items-center justify-center rounded-[22px] bg-gradient-to-br from-amber-300 to-orange-500 font-serif text-2xl text-stone-950">
              F
            </div>
            <div className="mt-10 space-y-3">
              {railItems.map((item) => (
                <button
                  key={item.label}
                  className={`flex w-full flex-col items-center gap-2 rounded-[24px] px-3 py-4 text-xs font-semibold uppercase tracking-[0.18em] transition ${
                    item.active
                      ? "bg-white/12 text-white shadow-[inset_0_1px_0_rgba(255,255,255,0.08)]"
                      : "text-stone-400 hover:bg-white/6 hover:text-white"
                  }`}
                >
                  <span className="flex h-9 w-9 items-center justify-center rounded-full border border-white/10 text-[11px]">
                    {item.short}
                  </span>
                  <span className="[writing-mode:vertical-rl] rotate-180 tracking-[0.25em]">{item.label}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="px-6 py-7 text-center text-[11px] uppercase tracking-[0.24em] text-stone-500">
            POS mode
          </div>
        </aside>

        <div className="flex min-h-screen flex-1 flex-col">
          <header className="border-b border-stone-900/10 px-4 py-4 sm:px-6 lg:px-8">
            <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[18px] bg-stone-950 text-lg font-semibold text-white lg:hidden">
                  F
                </div>
                <div>
                  <div className="inline-flex items-center gap-2 rounded-full border border-amber-700/20 bg-amber-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.24em] text-amber-900">
                    FlowBit Control Deck
                  </div>
                  <h1 className="mt-3 font-serif text-3xl leading-tight text-stone-950 sm:text-4xl">
                    Responsive operations workspace for ledger pressure, overflow approvals, and refund control.
                  </h1>
                  <p className="mt-3 max-w-3xl text-sm leading-7 text-stone-700 sm:text-[15px]">
                    The desktop view should feel like a POS control board, while tablet and mobile keep the same flows
                    in a tighter touch-first layout. The shell below is built for that direction.
                  </p>
                </div>
              </div>

              <div className="grid gap-3 sm:grid-cols-2 xl:w-[420px]">
                {primaryMetrics.map((metric) => (
                  <section
                    key={metric.label}
                    className="rounded-[22px] border border-stone-900/10 bg-white/72 px-4 py-4 shadow-[0_16px_40px_rgba(73,52,26,0.08)] backdrop-blur"
                  >
                    <p className="text-[11px] uppercase tracking-[0.22em] text-stone-500">{metric.label}</p>
                    <p className="mt-2 text-2xl font-semibold text-stone-950">{metric.value}</p>
                    <p className="mt-1 text-sm text-stone-600">{metric.meta}</p>
                  </section>
                ))}
              </div>
            </div>

            <div className="mt-5 flex gap-3 overflow-x-auto pb-1 lg:hidden">
              {railItems.map((item) => (
                <button
                  key={item.label}
                  className={`rounded-full border px-4 py-2 text-xs font-semibold uppercase tracking-[0.18em] whitespace-nowrap ${
                    item.active
                      ? "border-stone-950 bg-stone-950 text-white"
                      : "border-stone-900/10 bg-white/70 text-stone-700"
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </header>

          <div className="flex-1 px-4 py-5 sm:px-6 lg:px-8 lg:py-6">
            <div className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(330px,0.9fr)]">
              <section className="space-y-5">
                <article className="overflow-hidden rounded-[30px] border border-stone-900/10 bg-[#20120c] text-stone-50 shadow-[0_24px_70px_rgba(54,30,8,0.22)]">
                  <div className="grid gap-6 p-5 sm:p-6 2xl:grid-cols-[1.1fr_0.9fr]">
                    <div className="space-y-5">
                      <div>
                        <p className="text-xs uppercase tracking-[0.28em] text-amber-300/80">Operator Flow</p>
                        <h2 className="mt-3 text-3xl font-semibold leading-tight">
                          One screen should show entry, approval pressure, and period control together.
                        </h2>
                      </div>
                      <p className="max-w-2xl text-sm leading-7 text-stone-300">
                        The backend already supports manual allocation preview, collaborator-backed overflow approval,
                        admin override checks, reports, audit logs, and period-ledger rules. The frontend shell should
                        keep those flows close enough that operators do not lose context while moving between them.
                      </p>

                      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                        {quickActions.map((action) => (
                          <button
                            key={action}
                            className="rounded-[20px] border border-white/10 bg-white/6 px-4 py-4 text-left text-sm font-semibold text-white transition hover:border-white/20 hover:bg-white/10"
                          >
                            {action}
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="rounded-[28px] border border-white/10 bg-white/5 p-5">
                      <div className="flex items-center justify-between border-b border-white/10 pb-4">
                        <div>
                          <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Current Period</p>
                          <h3 className="mt-2 text-xl font-semibold">April 2026 Capacity Window</h3>
                        </div>
                        <span className="rounded-full bg-emerald-400/15 px-3 py-1 text-xs font-semibold uppercase tracking-[0.16em] text-emerald-300">
                          Open
                        </span>
                      </div>

                      <dl className="mt-5 grid gap-3 sm:grid-cols-2">
                        <div className="rounded-[22px] bg-white/5 p-4">
                          <dt className="text-[11px] uppercase tracking-[0.18em] text-stone-400">Overflow Exposure</dt>
                          <dd className="mt-2 text-2xl font-semibold">125.00</dd>
                        </div>
                        <div className="rounded-[22px] bg-white/5 p-4">
                          <dt className="text-[11px] uppercase tracking-[0.18em] text-stone-400">Reserve Capacity</dt>
                          <dd className="mt-2 text-2xl font-semibold">55.00</dd>
                        </div>
                        <div className="rounded-[22px] bg-white/5 p-4">
                          <dt className="text-[11px] uppercase tracking-[0.18em] text-stone-400">Collaborator Queue</dt>
                          <dd className="mt-2 text-2xl font-semibold">3 waiting</dd>
                        </div>
                        <div className="rounded-[22px] bg-white/5 p-4">
                          <dt className="text-[11px] uppercase tracking-[0.18em] text-stone-400">Admin Overrides</dt>
                          <dd className="mt-2 text-2xl font-semibold">2 required</dd>
                        </div>
                      </dl>
                    </div>
                  </div>
                </article>

                <article className="rounded-[30px] border border-stone-900/10 bg-white/76 p-5 shadow-[0_18px_50px_rgba(71,48,19,0.08)] backdrop-blur sm:p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Wide-Screen Layout</p>
                      <h2 className="mt-2 text-2xl font-semibold text-stone-950">POS-style board behavior</h2>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-stone-600">
                      Desktop can stay dense and operational, tablet can simplify into two columns, and mobile can stack
                      the same sections without hiding the main actions.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4 lg:grid-cols-3">
                    {boardColumns.map((column) => (
                      <section key={column.label} className="rounded-[24px] border border-stone-900/10 bg-stone-50 p-5">
                        <p className="text-[11px] uppercase tracking-[0.2em] text-stone-500">{column.label}</p>
                        <h3 className="mt-2 text-xl font-semibold text-stone-950">{column.caption}</h3>
                        <ul className="mt-4 space-y-3 text-sm leading-6 text-stone-700">
                          {column.items.map((item) => (
                            <li key={item} className="rounded-2xl bg-white px-4 py-3">
                              {item}
                            </li>
                          ))}
                        </ul>
                      </section>
                    ))}
                  </div>
                </article>

                <article className="rounded-[30px] border border-stone-900/10 bg-white/76 p-5 shadow-[0_18px_50px_rgba(71,48,19,0.08)] backdrop-blur sm:p-6">
                  <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Priority Lanes</p>
                      <h2 className="mt-2 text-2xl font-semibold text-stone-950">Ledger watchlist</h2>
                    </div>
                    <p className="max-w-2xl text-sm leading-6 text-stone-600">
                      Ledger status needs to stay readable on a narrow screen without losing the priority order that drives
                      auto-allocation.
                    </p>
                  </div>

                  <div className="mt-6 grid gap-4">
                    {ledgers.map((ledger) => (
                      <section
                        key={ledger.name}
                        className="grid gap-4 rounded-[24px] border border-stone-900/10 bg-stone-50 p-5 xl:grid-cols-[0.72fr_1.45fr_0.72fr]"
                      >
                        <div>
                          <p className="text-[11px] uppercase tracking-[0.18em] text-stone-500">{ledger.priority}</p>
                          <h3 className="mt-2 text-lg font-semibold text-stone-950">{ledger.name}</h3>
                        </div>
                        <p className="text-sm leading-6 text-stone-600">{ledger.detail}</p>
                        <div className="rounded-[22px] bg-white px-4 py-4">
                          <p className="text-[11px] uppercase tracking-[0.16em] text-stone-500">Used</p>
                          <p className="mt-2 text-xl font-semibold text-stone-950">{ledger.used}</p>
                          <p className="mt-1 text-sm text-stone-600">Free {ledger.free}</p>
                        </div>
                      </section>
                    ))}
                  </div>
                </article>
              </section>

              <aside className="space-y-5">
                <article className="rounded-[30px] border border-stone-900/10 bg-white/76 p-5 shadow-[0_18px_50px_rgba(71,48,19,0.08)] backdrop-blur sm:p-6">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Risk Queue</p>
                      <h2 className="mt-2 text-2xl font-semibold text-stone-950">Live operator queue</h2>
                    </div>
                    <span className="rounded-full bg-stone-950 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.18em] text-white">
                      Live
                    </span>
                  </div>

                  <div className="mt-6 space-y-4">
                    {liveQueue.map((item) => (
                      <section
                        key={`${item.identifier}-${item.title}`}
                        className={`rounded-[24px] border p-4 ${stateClasses(item.state)}`}
                      >
                        <div className="flex items-start justify-between gap-4">
                          <div>
                            <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Identifier {item.identifier}</p>
                            <h3 className="mt-2 text-sm font-semibold">{item.title}</h3>
                          </div>
                          <div className="text-right">
                            <p className="text-[11px] uppercase tracking-[0.18em] opacity-70">Amount</p>
                            <p className="mt-2 text-lg font-semibold">{item.amount}</p>
                          </div>
                        </div>
                        <p className="mt-3 text-sm leading-6 opacity-80">{item.note}</p>
                      </section>
                    ))}
                  </div>
                </article>

                <article className="rounded-[30px] border border-stone-900/10 bg-[#fff8ee] p-5 shadow-[0_18px_50px_rgba(71,48,19,0.08)] sm:p-6">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-500">Activity Thread</p>
                  <h2 className="mt-2 text-2xl font-semibold text-stone-950">Backend-aligned milestones</h2>

                  <ol className="mt-6 space-y-4">
                    {activityFeed.map((item, index) => (
                      <li key={item.title} className="flex gap-4">
                        <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-stone-950 text-sm font-semibold text-white">
                          {index + 1}
                        </div>
                        <div>
                          <p className="text-sm font-semibold text-stone-950">{item.title}</p>
                          <p className="mt-1 text-sm leading-6 text-stone-700">{item.detail}</p>
                        </div>
                      </li>
                    ))}
                  </ol>
                </article>

                <article className="rounded-[30px] border border-stone-900/10 bg-stone-950 p-5 text-stone-50 shadow-[0_24px_70px_rgba(54,30,8,0.22)] sm:p-6">
                  <p className="text-xs uppercase tracking-[0.22em] text-stone-400">Next Build Slices</p>
                  <h2 className="mt-2 text-2xl font-semibold">What the shell should support next</h2>
                  <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-300">
                    <li>Token-based auth entry and role-aware session shell.</li>
                    <li>Ticket and transaction workspace with manual allocation drawer.</li>
                    <li>Overflow board with collaborator selection and refund safeguards.</li>
                    <li>Report and audit screens that adapt from phone to wide desktop.</li>
                  </ul>
                </article>
              </aside>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
