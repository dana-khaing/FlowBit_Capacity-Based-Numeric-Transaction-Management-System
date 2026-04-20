import * as React from "react";
import { cn } from "@/lib/utils";

type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: "default" | "outline" | "ghost";
  size?: "default" | "lg" | "icon";
};

const variantClasses: Record<NonNullable<ButtonProps["variant"]>, string> = {
  default: "bg-stone-950 text-white hover:bg-stone-800",
  outline: "border border-stone-900/10 bg-white text-stone-700 hover:bg-stone-50",
  ghost: "bg-transparent text-stone-600 hover:bg-stone-100",
};

const sizeClasses: Record<NonNullable<ButtonProps["size"]>, string> = {
  default: "px-5 py-3 text-sm",
  lg: "px-5 py-4 text-sm",
  icon: "h-11 w-11",
};

export function Button({
  className,
  variant = "default",
  size = "default",
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={cn(
        "inline-flex items-center justify-center gap-2 rounded-[20px] font-semibold transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-stone-950/20 disabled:pointer-events-none disabled:opacity-60",
        variantClasses[variant],
        sizeClasses[size],
        className,
      )}
      {...props}
    />
  );
}
