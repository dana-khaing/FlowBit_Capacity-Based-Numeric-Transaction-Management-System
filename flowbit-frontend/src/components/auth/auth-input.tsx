type AuthInputProps = {
  label: string;
  type: "text" | "password";
  placeholder: string;
};

export function AuthInput({ label, type, placeholder }: AuthInputProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-600">{label}</span>
      <input
        type={type}
        placeholder={placeholder}
        className="mt-2 w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950"
      />
    </label>
  );
}
