"use client";

import { forwardRef, useId, type InputHTMLAttributes, type ReactNode, type TextareaHTMLAttributes } from "react";

interface FieldProps {
  label?: ReactNode;
  description?: ReactNode;
  error?: ReactNode;
  /** Visual content rendered inside the input on the left (e.g. icon). */
  leadingAdornment?: ReactNode;
  trailingAdornment?: ReactNode;
}

interface InputProps extends InputHTMLAttributes<HTMLInputElement>, FieldProps {}

export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { label, description, error, leadingAdornment, trailingAdornment, id, className = "", ...rest },
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
      <div className={`v2-input-wrap ${error ? "is-error" : ""}`}>
        {leadingAdornment && <span className="v2-input-adorn v2-input-adorn-leading">{leadingAdornment}</span>}
        <input
          id={inputId}
          ref={ref}
          className={`v2-input ${className}`}
          aria-invalid={error ? true : undefined}
          aria-describedby={
            error
              ? `${inputId}-error`
              : description
                ? `${inputId}-desc`
                : undefined
          }
          {...rest}
        />
        {trailingAdornment && <span className="v2-input-adorn v2-input-adorn-trailing">{trailingAdornment}</span>}
      </div>
      {error ? (
        <div id={`${inputId}-error`} role="alert" className="v2-field-error">
          {error}
        </div>
      ) : description ? (
        <div id={`${inputId}-desc`} className="v2-field-desc">
          {description}
        </div>
      ) : null}
    </div>
  );
});

interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement>, FieldProps {}

export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { label, description, error, id, className = "", rows = 3, ...rest },
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
      <textarea
        id={inputId}
        ref={ref}
        rows={rows}
        className={`v2-input v2-textarea ${error ? "is-error" : ""} ${className}`}
        aria-invalid={error ? true : undefined}
        {...rest}
      />
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
