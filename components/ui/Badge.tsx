import { HTMLAttributes } from "react";

type Tone = "neutral" | "success" | "warning" | "danger" | "primary";

const toneClasses: Record<Tone, string> = {
  neutral: "bg-surface-muted text-foreground/70 border-border",
  success: "bg-success-soft text-success border-success/20",
  warning: "bg-warning-soft text-warning border-warning/20",
  danger: "bg-danger-soft text-danger border-danger/20",
  primary: "bg-primary-soft text-primary border-primary/20",
};

export function Badge({
  tone = "neutral",
  className = "",
  ...props
}: HTMLAttributes<HTMLSpanElement> & { tone?: Tone }) {
  return (
    <span
      className={`inline-flex items-center rounded-full border px-2 py-0.5 text-xs font-semibold ${toneClasses[tone]} ${className}`}
      {...props}
    />
  );
}
