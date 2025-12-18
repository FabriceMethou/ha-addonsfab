import * as React from "react"
import { cn } from "../../lib/utils"

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'error' | 'info'
  size?: 'sm' | 'md' | 'lg'
}

const Progress = React.forwardRef<HTMLDivElement, ProgressProps>(
  ({ className, value, max = 100, variant = 'default', size = 'md', ...props }, ref) => {
    const percentage = Math.min(100, Math.max(0, (value / max) * 100))

    const variants = {
      default: 'bg-primary',
      success: 'bg-success',
      warning: 'bg-warning',
      error: 'bg-error',
      info: 'bg-info',
    }

    const sizes = {
      sm: 'h-1.5',
      md: 'h-2',
      lg: 'h-3',
    }

    return (
      <div
        ref={ref}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-surface-hover',
          sizes[size],
          className
        )}
        {...props}
      >
        <div
          className={cn(
            'h-full transition-all duration-300 ease-in-out rounded-full',
            variants[variant]
          )}
          style={{ width: `${percentage}%` }}
        />
      </div>
    )
  }
)
Progress.displayName = "Progress"

export default Progress
