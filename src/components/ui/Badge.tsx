import { cn } from "@/lib/utils";

interface BadgeProps {
  children: React.ReactNode;
  variant?: "default" | "green" | "red" | "gold";
  className?: string;
}

export function Badge({ children, variant = "default", className }: BadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium",
        {
          "bg-gray-100 text-gray-700": variant === "default",
          "bg-green-100 text-green-800": variant === "green",
          "bg-red-100 text-red-800": variant === "red",
          "bg-amber-100 text-amber-800": variant === "gold",
        },
        className
      )}
    >
      {children}
    </span>
  );
}
