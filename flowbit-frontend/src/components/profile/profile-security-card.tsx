const securityNotes = [
  "Use the password reset flow if you need to replace your current password.",
  "If your email or phone number is incorrect, contact an administrator to update your account details.",
  "Your role controls which actions and reports are available inside FlowBit.",
];

export function ProfileSecurityCard() {
  return (
    <section className="rounded-[28px] border border-stone-900/8 bg-white p-5 shadow-[0_8px_24px_rgba(28,24,20,0.04)] sm:p-6">
      <div>
        <p className="text-[12px] font-semibold uppercase tracking-[0.18em] text-stone-500">Security</p>
        <h2 className="mt-2 text-2xl font-semibold text-stone-950">Account access</h2>
      </div>

      <ul className="mt-5 space-y-3 text-sm leading-6 text-stone-600">
        {securityNotes.map((note) => (
          <li key={note} className="rounded-[20px] border border-stone-900/8 bg-[#f8f6f2] px-4 py-3">
            {note}
          </li>
        ))}
      </ul>
    </section>
  );
}
