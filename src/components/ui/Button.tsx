"use client";

import { cn } from "@/lib/utils";
import { ButtonHTMLAttributes, forwardRef } from "react";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: "primary" | "secondary" | "outline" | "ghost";
  size?: "sm" | "md" | "lg";
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = "primary", size = "md", children, ...props }, ref) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center font-medium transition-colors rounded-lg focus:outline-none focus:ring-2 focus:ring-italia-gold focus:ring-offset-2 disabled:opacity-50 disabled:pointer-events-none",
          {
            "bg-italia-red text-white hover:bg-italia-red-dark":
              variant === "primary",
            "bg-italia-green text-white hover:bg-italia-green-dark":
              variant === "secondary",
            "border-2 border-italia-red text-italia-red hover:bg-italia-red hover:text-white":
              variant === "outline",
            "text-italia-dark hover:bg-italia-cream-dark":
              variant === "ghost",
          },
          {
            "text-sm px-3 py-1.5": size === "sm",
            "text-base px-5 py-2.5": size === "md",
            "text-lg px-7 py-3.5": size === "lg",
          },
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
