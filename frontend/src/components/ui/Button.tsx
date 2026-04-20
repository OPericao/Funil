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
  primary: "border-transparent bg-[#13505B] text-[#F0F0F0] [--btn-fill:#13505B] [--btn-text-hover:#F0F0F0]",
  secondary: "border-white/90 bg-[linear-gradient(180deg,rgba(255,248,241,0.96)_0%,rgba(230,244,255,0.9)_100%)] backdrop-blur-sm text-[#0C7489] shadow-[0_14px_28px_rgba(15,23,42,0.08)] [--btn-fill:#13505B] [--btn-text-hover:#ffffff]",
  ghost: "border-white/85 bg-[linear-gradient(180deg,rgba(255,248,242,0.94)_0%,rgba(228,242,255,0.86)_100%)] text-brand-700 shadow-[0_12px_24px_rgba(15,23,42,0.06)] [--btn-fill:#13505B]",
  neutral: "border-white/85 bg-[linear-gradient(180deg,rgba(255,248,243,0.94)_0%,rgba(236,243,252,0.88)_100%)] backdrop-blur-sm text-ink-900 shadow-[0_14px_28px_rgba(15,23,42,0.07)] [--btn-fill:#E6F4FF]",
  danger: "border-rose-600 bg-rose-500 text-white [--btn-fill:#E11D48]"
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
