const summaryCards = [
  {
    label: "Total entries today",
    value: "48",
    meta: "+12 since yesterday",
    tone: "default",
  },
  {
    label: "Capacity used",
    value: "62%",
    meta: "620k / 1.0m",
    tone: "default",
  },
  {
    label: "Overflow pending",
    value: "3",
    meta: "Needs approval",
    tone: "critical",
  },
  {
    label: "Active ledgers",
    value: "2",
    meta: "Ledger A · Ledger B",
    tone: "default",
  },
];

const hotNumbers = [
  { identifier: "234", amount: "88k units", progress: "88%" },
  { identifier: "678", amount: "74k units", progress: "74%" },
  { identifier: "456", amount: "69k units", progress: "69%" },
  { identifier: "901", amount: "61k units", progress: "61%" },
  { identifier: "789", amount: "55k units", progress: "55%" },
  { identifier: "124", amount: "50k units", progress: "50%" },
  { identifier: "012", amount: "43k units", progress: "43%" },
  { identifier: "345", amount: "39k units", progress: "39%" },
  { identifier: "567", amount: "31k units", progress: "31%" },
  { identifier: "892", amount: "22k units", progress: "22%" },
];

const almostFull = [
  { identifier: "234", remaining: "2k remaining", progress: "96%", tone: "critical" },
  { identifier: "789", remaining: "4k remaining", progress: "92%", tone: "critical" },
  { identifier: "456", remaining: "6k remaining", progress: "88%", tone: "critical" },
  { identifier: "123", remaining: "8k remaining", progress: "84%", tone: "critical" },
  { identifier: "567", remaining: "9k remaining", progress: "82%", tone: "warning" },
  { identifier: "890", remaining: "12k remaining", progress: "76%", tone: "warning" },
];

const recentEntries = [
  { identifier: "121", ticket: "FB-000121", amount: "→ 4,300", time: "10:38" },
  { identifier: "345", ticket: "FB-000120", amount: "→ 1,000", time: "10:35" },
  { identifier: "678", ticket: "FB-000119", amount: "→ 500", time: "10:30" },
  { identifier: "234", ticket: "FB-000118", amount: "→ 2,500", time: "10:28" },
  { identifier: "901", ticket: "FB-000117", amount: "→ 1,800", time: "10:25" },
  { identifier: "456", ticket: "FB-000116", amount: "→ 3,200", time: "10:22" },
];

const footerGroups = [
  {
    title: "Navigation",
    items: ["Dashboard", "Entries log", "Entries history", "Draw flow"],
  },
  {
    title: "Ledgers",
    items: ["Create ledger", "Ledger history", "Export PDF", "Period settings"],
  },
  {
    title: "Admin",
    items: ["User management", "Role permissions", "Audit trail", "Master override"],
  },
  {
    title: "Support",
    items: ["Documentation", "Changelog", "Report issue", "Profile settings"],
  },
];

function summaryValueClass(tone: string) {
  return tone === "critical" ? "text-red-700" : "text-stone-900";
}

function panelToneClass(tone: string) {
  return tone === "critical"
    ? "border-red-200 bg-red-50"
    : "border-amber-200 bg-amber-50";
}

function barToneClass(tone: string) {
  return tone === "critical" ? "bg-red-700" : "bg-amber-700";
}

export default function Home() {
  return (
    <main className="min-h-screen bg-[#efede8] text-stone-900">
      <div className="border-b border-stone-900/8 bg-white/90">
        <div className="mx-auto flex w-full max-w-[1800px] items-center justify-between gap-4 px-4 py-4 sm:px-6 lg:px-8">
          <div className="flex items-center gap-4">
            <button className="flex h-11 w-11 items-center justify-center rounded-2xl border border-stone-900/10 bg-white text-2xl text-stone-500">
              ≡
            </button>
            <div>
              <p className="text-[15px] font-medium text-stone-500">FlowBit Admin</p>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <div className="hidden rounded-full border border-stone-900/10 bg-stone-50 px-4 py-2 text-sm text-stone-500 sm:block">
              Period: Mar 1–16
            </div>
            <div className="flex h-11 w-11 items-center justify-center rounded-full bg-[#d97a35] text-sm font-semibold text-white">
              DK
            </div>
          </div>
        </div>
      </div>

      <div className="mx-auto w-full max-w-[1800px] px-4 py-4 sm:px-6 lg:px-8 lg:py-8">
        <section className="rounded-[28px] border border-stone-900/8 bg-white px-5 py-6 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:px-8 sm:py-8">
          <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
            <div>
              <p className="text-sm font-medium uppercase tracking-[0.2em] text-stone-400">Next Draw</p>
              <h1 className="mt-3 font-sans text-6xl font-light tracking-[0.18em] text-stone-950 sm:text-7xl">
                000 — 000
              </h1>
              <p className="mt-4 text-2xl font-light text-stone-500">16 March 2026 · 3:00 AM</p>
            </div>

            <div className="text-left xl:text-right">
              <div className="inline-flex rounded-2xl bg-[#f5e7c8] px-5 py-3 text-xl font-medium text-[#9d5a18]">
                Draw in 3d 10h
              </div>
              <p className="mt-5 text-xl font-light text-stone-400">Previous: 456 · 1 Mar 2026</p>
            </div>
          </div>
        </section>

        <section className="mt-5 grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          {summaryCards.map((card) => (
            <article
              key={card.label}
              className="rounded-[24px] border border-stone-900/8 bg-[#f3f0ea] px-5 py-5 shadow-[0_6px_18px_rgba(28,24,20,0.03)]"
            >
              <p className="text-[15px] text-stone-500">{card.label}</p>
              <p className={`mt-3 text-5xl font-light ${summaryValueClass(card.tone)}`}>{card.value}</p>
              <p className="mt-2 text-[15px] text-stone-400">{card.meta}</p>
            </article>
          ))}
        </section>

        <section className="mt-5 grid gap-5 2xl:grid-cols-3">
          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-lime-600" />
              <div>
                <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Hot Numbers</h2>
                <p className="mt-1 text-[15px] text-stone-400">Total units entered · Mar 1–16</p>
              </div>
            </div>

            <div className="mt-6 space-y-5">
              {hotNumbers.map((item) => (
                <div key={item.identifier} className="grid items-center gap-3 sm:grid-cols-[64px_minmax(0,1fr)_120px]">
                  <div className="text-2xl font-medium text-stone-900">{item.identifier}</div>
                  <div className="h-3 rounded-full bg-stone-100">
                    <div className="h-full rounded-full bg-lime-600" style={{ width: item.progress }} />
                  </div>
                  <div className="text-right text-[15px] text-stone-400">{item.amount}</div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-red-700" />
              <div>
                <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">Almost Full</h2>
                <p className="mt-1 text-[15px] text-stone-400">Least remaining capacity · action needed</p>
              </div>
            </div>

            <div className="mt-6 space-y-4">
              {almostFull.map((item) => (
                <div key={item.identifier} className={`rounded-[22px] border px-4 py-4 ${panelToneClass(item.tone)}`}>
                  <div className="flex items-center justify-between gap-3">
                    <div className="text-2xl font-medium text-stone-900">{item.identifier}</div>
                    <div className="text-xl font-medium text-stone-700">{item.remaining}</div>
                  </div>
                  <div className="mt-3 h-2.5 rounded-full bg-white/60">
                    <div className={`h-full rounded-full ${barToneClass(item.tone)}`} style={{ width: item.progress }} />
                  </div>
                </div>
              ))}
            </div>
          </article>

          <article className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
            <div className="flex items-center gap-3">
              <span className="h-3 w-3 rounded-full bg-amber-700" />
              <div>
                <h2 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-600">My Recent Entries</h2>
                <p className="mt-1 text-[15px] text-stone-400">Your submissions this session</p>
              </div>
            </div>

            <div className="mt-6 divide-y divide-stone-900/8">
              {recentEntries.map((entry) => (
                <div key={entry.ticket} className="grid gap-3 py-4 sm:grid-cols-[1fr_auto] sm:items-center">
                  <div>
                    <p className="text-2xl font-medium text-stone-900">{entry.identifier}</p>
                    <p className="mt-1 text-[15px] text-stone-400">{entry.ticket}</p>
                  </div>
                  <div className="text-left sm:text-right">
                    <p className="text-2xl font-light text-stone-700">{entry.amount}</p>
                    <p className="mt-1 text-[15px] text-stone-400">{entry.time}</p>
                  </div>
                </div>
              ))}
            </div>
          </article>
        </section>

        <section className="mt-8 grid gap-8 border-t border-stone-900/8 pt-8 md:grid-cols-2 xl:grid-cols-4">
          {footerGroups.map((group) => (
            <div key={group.title}>
              <h3 className="text-[17px] font-medium uppercase tracking-[0.08em] text-stone-500">{group.title}</h3>
              <ul className="mt-4 space-y-3 text-[18px] font-light text-stone-500">
                {group.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            </div>
          ))}
        </section>
      </div>
    </main>
  );
}
