import * as React from "react"
import { cn } from "../../lib/utils"

interface BadgeProps extends React.HTMLAttributes<HTMLSpanElement> {
  variant?: 'default' | 'success' | 'error' | 'warning' | 'info' | 'outline' | 'destructive' | 'secondary'
  size?: 'sm' | 'md'
}

const Badge = React.forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'default', size = 'md', ...props }, ref) => {
    const variants = {
      default: 'bg-primary/20 text-primary-300 border-primary/30',
      success: 'bg-success-light text-success border-success/30',
      error: 'bg-error-light text-error border-error/30',
      destructive: 'bg-error-light text-error border-error/30',
      warning: 'bg-warning-light text-warning border-warning/30',
      info: 'bg-info-light text-info border-info/30',
      outline: 'bg-transparent border-border-strong text-foreground-muted',
      secondary: 'bg-surface-hover text-foreground border-border',
    }

    const sizes = {
      sm: 'text-xs px-1.5 py-0.5',
      md: 'text-sm px-2.5 py-0.5',
    }

    return (
      <span
        ref={ref}
        className={cn(
          'inline-flex items-center rounded-full font-medium border',
          variants[variant],
          sizes[size],
          className
        )}
        {...props}
      />
    )
  }
)
Badge.displayName = "Badge"

export default Badge
