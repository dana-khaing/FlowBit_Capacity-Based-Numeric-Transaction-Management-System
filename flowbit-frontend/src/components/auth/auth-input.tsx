import { Input } from "@/components/ui/input";

import { ChangeEventHandler } from "react";

type AuthInputProps = {
  label: string;
  type: "text" | "password";
  placeholder: string;
  value?: string;
  onChange?: ChangeEventHandler<HTMLInputElement>;
  name?: string;
  autoComplete?: string;
};

export function AuthInput({ label, type, placeholder, ...props }: AuthInputProps) {
  return (
    <label className="block">
      <span className="text-sm font-medium text-stone-600">{label}</span>
      <Input type={type} placeholder={placeholder} className="mt-2" {...props} />
    </label>
  );
}
