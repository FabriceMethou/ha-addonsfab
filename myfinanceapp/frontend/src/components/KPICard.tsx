import { TrendingUp, TrendingDown } from 'lucide-react';
import { Card, Spinner } from './shadcn';

interface KPICardProps {
  title: string;
  value: string;
  change?: number;
  changeLabel?: string;
  icon: React.ReactNode;
  /** Tailwind bg color class e.g. "bg-blue-500" */
  iconColor: string;
  loading?: boolean;
  /** If true, renders with primary-card styling (brighter, colored top border) */
  primary?: boolean;
  /** Extra tailwind classes */
  className?: string;
}

export default function KPICard({
  title,
  value,
  change,
  changeLabel,
  icon,
  iconColor,
  loading,
  primary = false,
  className = '',
}: KPICardProps) {
  const isPositive = change !== undefined && change > 0;
  const isNegative = change !== undefined && change < 0;

  return (
    <Card
      className={`relative overflow-hidden p-4 sm:p-6 rounded-xl border bg-card/70 backdrop-blur-sm ${
        primary
          ? 'border-t-2 border-border shadow-md'
          : 'border-border'
      } ${className}`}
    >
      {/* Background glow circle */}
      <div
        className={`absolute top-0 right-0 w-32 h-32 ${iconColor} opacity-[0.12] blur-3xl rounded-full pointer-events-none`}
      />

      <div className="relative">
        <div className="flex items-start justify-between mb-2 sm:mb-4">
          <div
            className={`p-2 sm:p-3 rounded-lg ${iconColor} bg-opacity-10 [&>svg]:w-5 [&>svg]:h-5 sm:[&>svg]:w-6 sm:[&>svg]:h-6`}
          >
            {icon}
          </div>
          {change !== undefined && (
            <div
              className={`flex items-center gap-1 px-1.5 sm:px-2 py-0.5 sm:py-1 rounded-md text-[10px] sm:text-xs font-medium ${
                isPositive
                  ? 'bg-success/10 text-success'
                  : isNegative
                    ? 'bg-error/10 text-error'
                    : 'bg-foreground-muted/10 text-foreground-muted'
              }`}
            >
              {isPositive && <TrendingUp size={10} className="sm:w-3 sm:h-3" />}
              {isNegative && <TrendingDown size={10} className="sm:w-3 sm:h-3" />}
              <span>
                {change > 0 ? '+' : ''}
                {change.toFixed(1)}%
              </span>
            </div>
          )}
        </div>

        <div>
          <p className="text-xs sm:text-sm text-foreground-muted mb-0.5 sm:mb-1">
            {title}
          </p>
          {loading ? (
            <div className="h-6 sm:h-8 flex items-center">
              <Spinner className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
          ) : (
            <p className="text-lg sm:text-2xl font-bold text-foreground truncate">
              {value}
            </p>
          )}
          {changeLabel && (
            <p className="text-[10px] sm:text-xs text-foreground-muted mt-0.5 sm:mt-1">
              {changeLabel}
            </p>
          )}
        </div>
      </div>
    </Card>
  );
}
