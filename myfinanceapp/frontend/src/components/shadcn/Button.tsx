import * as React from "react"
import { cn } from "../../lib/utils"
import { Loader2 } from "lucide-react"

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'secondary' | 'outline' | 'ghost' | 'destructive' | 'success' | 'warning' | 'link'
  size?: 'sm' | 'md' | 'lg' | 'icon'
  loading?: boolean
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant = 'default', size = 'md', loading = false, children, disabled, ...props }, ref) => {
    const variants = {
      default: 'bg-primary text-white hover:bg-primary-600 shadow-sm',
      secondary: 'bg-surface-hover text-foreground hover:bg-surface-hover/80',
      outline: 'border border-border bg-transparent hover:bg-surface-hover text-foreground',
      ghost: 'bg-transparent hover:bg-surface-hover text-foreground',
      destructive: 'bg-error text-white hover:bg-error-dark shadow-sm',
      success: 'bg-success text-white hover:bg-success-dark shadow-sm',
      warning: 'bg-warning text-white hover:bg-warning/80 shadow-sm',
      link: 'text-primary underline-offset-4 hover:underline bg-transparent',
    }

    const sizes = {
      sm: 'h-8 px-3 text-xs',
      md: 'h-10 px-4 text-sm',
      lg: 'h-12 px-6 text-base',
      icon: 'h-10 w-10',
    }

    return (
      <button
        ref={ref}
        className={cn(
          'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background disabled:pointer-events-none disabled:opacity-50',
          variants[variant],
          sizes[size],
          className
        )}
        disabled={disabled || loading}
        {...props}
      >
        {loading && <Loader2 className="h-4 w-4 animate-spin" />}
        {children}
      </button>
    )
  }
)
Button.displayName = "Button"

export default Button
