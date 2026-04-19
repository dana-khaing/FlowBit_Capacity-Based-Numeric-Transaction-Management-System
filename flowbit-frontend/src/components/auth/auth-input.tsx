import { Input } from "@/components/ui/input";

type AuthInputProps = {
  label: string;
  type: "text" | "password";
  placeholder: string;
};

export function AuthInput({ label, type, placeholder }: AuthInputProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-600">{label}</span>
      <Input type={type} placeholder={placeholder} className="mt-2" />
    </label>
  );
}
