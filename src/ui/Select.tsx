"use client";

import { ChevronDown } from "lucide-react";
import { forwardRef, useId, type ReactNode, type SelectHTMLAttributes } from "react";

interface Option {
  value: string;
  label: string;
  disabled?: boolean;
}

interface Props extends SelectHTMLAttributes<HTMLSelectElement> {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  options?: Option[];
  /** Optional placeholder rendered as a disabled option when value is "". */
  placeholder?: string;
}

export const Select = forwardRef<HTMLSelectElement, Props>(function Select(
  { label, description, error, options, placeholder, id, className = "", children, ...rest },
  ref,
) {
  const generatedId = useId();
  const inputId = id || generatedId;
  return (
    <div className="v2-field">
      {label && (
        <label htmlFor={inputId} className="v2-field-label">
          {label}
        </label>
      )}
      <div className={`v2-select-wrap ${error ? "is-error" : ""}`}>
        <select
          id={inputId}
          ref={ref}
          className={`v2-select ${className}`}
          aria-invalid={error ? true : undefined}
          {...rest}
        >
          {placeholder !== undefined && (
            <option value="" disabled>
              {placeholder}
            </option>
          )}
          {options
            ? options.map((o) => (
                <option key={o.value} value={o.value} disabled={o.disabled}>
                  {o.label}
                </option>
              ))
            : children}
        </select>
        <ChevronDown className="v2-select-chev h-3.5 w-3.5" aria-hidden />
      </div>
      {error ? (
        <div className="v2-field-error" role="alert">
          {error}
        </div>
      ) : description ? (
        <div className="v2-field-desc">{description}</div>
      ) : null}
    </div>
  );
});
