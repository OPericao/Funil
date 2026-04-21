import type { ButtonHTMLAttributes } from "react";

type ButtonVariant = "primary" | "secondary" | "ghost" | "neutral" | "danger";
type ButtonSize = "md" | "lg";

type ButtonClassOptions = {
  variant?: ButtonVariant;
  size?: ButtonSize;
  fullWidth?: boolean;
  className?: string;
};

const baseButtonClass =
  "btn-fill-anim inline-flex items-center justify-center overflow-hidden rounded-control border disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-70";

const variantClassMap: Record<ButtonVariant, string> = {
  primary: "border-brand-700 bg-brand-500 text-white shadow-[0_14px_28px_rgba(19,61,81,0.16)] [--btn-fill:#04586b] [--btn-text-hover:#ffffff]",
  secondary: "border-brand-300 bg-white text-brand-900 shadow-[0_14px_28px_rgba(19,61,81,0.10)] [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]",
  ghost: "border-brand-300 bg-white text-brand-800 shadow-[0_12px_24px_rgba(19,61,81,0.08)] [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]",
  neutral: "border-brand-300 bg-white text-ink-900 shadow-[0_14px_28px_rgba(19,61,81,0.09)] [--btn-fill:#06a89d] [--btn-text-hover:#ffffff]",
  danger: "border-brand-700 bg-brand-500 text-white shadow-[0_14px_28px_rgba(19,61,81,0.16)] [--btn-fill:#04586b] [--btn-text-hover:#ffffff]"
};

const sizeClassMap: Record<ButtonSize, string> = {
  md: "px-3 py-2.5 text-sm font-semibold",
  lg: "px-3 py-3 text-base font-bold sm:py-3.5 sm:text-lg"
};

export function buttonClass({
  variant = "primary",
  size = "md",
  fullWidth = true,
  className
}: ButtonClassOptions = {}) {
  return [
    baseButtonClass,
    variantClassMap[variant],
    sizeClassMap[size],
    fullWidth ? "w-full" : "w-auto",
    className ?? ""
  ]
    .filter(Boolean)
    .join(" ");
}

type ButtonProps = ButtonHTMLAttributes<HTMLButtonElement> & ButtonClassOptions;

export function Button({
  variant = "primary",
  size = "md",
  fullWidth = true,
  className,
  type = "button",
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      className={buttonClass({ variant, size, fullWidth, className })}
      {...props}
    />
  );
}
