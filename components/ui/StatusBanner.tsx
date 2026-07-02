import { ReactNode } from "react";
import { AlertCircle, CheckCircle2, Info } from "lucide-react";

type Tone = "info" | "success" | "warning" | "danger";

const toneConfig: Record<Tone, { classes: string; icon: ReactNode }> = {
  info: {
    classes: "border-primary/20 bg-primary-soft text-primary",
    icon: <Info size={20} className="mt-0.5 shrink-0" />,
  },
  success: {
    classes: "border-success/20 bg-success-soft text-success",
    icon: <CheckCircle2 size={20} className="mt-0.5 shrink-0" />,
  },
  warning: {
    classes: "border-warning/20 bg-warning-soft text-warning",
    icon: <AlertCircle size={20} className="mt-0.5 shrink-0" />,
  },
  danger: {
    classes: "border-danger/20 bg-danger-soft text-danger",
    icon: <AlertCircle size={20} className="mt-0.5 shrink-0" />,
  },
};

export function StatusBanner({
  tone = "info",
  title,
  children,
}: {
  tone?: Tone;
  title?: string;
  children?: ReactNode;
}) {
  const { classes, icon } = toneConfig[tone];
  return (
    <div className={`rounded-2xl border px-6 py-5 shadow-sm ${classes}`}>
      <div className="flex items-start gap-3">
        {icon}
        <div className="text-foreground">
          {title && <p className="text-base font-semibold">{title}</p>}
          {children && <div className="mt-1 text-sm text-foreground/80">{children}</div>}
        </div>
      </div>
    </div>
  );
}
