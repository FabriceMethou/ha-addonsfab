import * as React from 'react';
import { cn } from '../../lib/utils';
import Label from './Label';

export interface FormFieldProps {
  label?: string;
  htmlFor?: string;
  error?: string;
  required?: boolean;
  children: React.ReactNode;
  className?: string;
  helperText?: string;
}

export function FormField({
  label,
  htmlFor,
  error,
  required,
  children,
  className,
  helperText,
}: FormFieldProps) {
  return (
    <div className={cn('space-y-1.5', className)}>
      {label && (
        <Label htmlFor={htmlFor} className={cn(error && 'text-error')}>
          {label}
          {required && <span className="text-error ml-1">*</span>}
        </Label>
      )}
      {children}
      {error && (
        <p className="text-xs text-error mt-1">{error}</p>
      )}
      {!error && helperText && (
        <p className="text-xs text-foreground-muted mt-1">{helperText}</p>
      )}
    </div>
  );
}

// Error message component for standalone use
export function FormError({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="text-xs text-error mt-1">{message}</p>;
}

export default FormField;
