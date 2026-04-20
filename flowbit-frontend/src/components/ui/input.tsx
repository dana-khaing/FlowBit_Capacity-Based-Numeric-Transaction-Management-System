import * as React from "react";
import { cn } from "@/lib/utils";

export type InputProps = React.InputHTMLAttributes<HTMLInputElement>;

export const Input = React.forwardRef<HTMLInputElement, InputProps>(function Input(
  { className, ...props },
  ref,
) {
  return (
    <input
      ref={ref}
      className={cn(
        "flex h-12 w-full rounded-[18px] border border-stone-900/10 bg-stone-50 px-4 py-3 text-base text-stone-950 outline-none transition placeholder:text-stone-400 focus:border-stone-950",
        className,
      )}
      {...props}
    />
  );
});
