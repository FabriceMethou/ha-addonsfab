import { AlertTriangle, RefreshCw } from 'lucide-react';
import Button from './shadcn/Button';

interface QueryErrorProps {
  message?: string;
  onRetry?: () => void;
  compact?: boolean;
}

export default function QueryError({
  message = 'Failed to load data.',
  onRetry,
  compact = false,
}: QueryErrorProps) {
  if (compact) {
    return (
      <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-error/10 border border-error/20 text-sm text-error">
        <AlertTriangle className="w-4 h-4 flex-shrink-0" />
        <span className="flex-1">{message}</span>
        {onRetry && (
          <button
            onClick={onRetry}
            className="text-xs underline hover:no-underline"
          >
            Retry
          </button>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center py-10 px-6 text-center">
      <div className="w-12 h-12 rounded-xl bg-error/10 border border-error/20 flex items-center justify-center mb-3">
        <AlertTriangle className="w-6 h-6 text-error" />
      </div>
      <p className="text-sm font-medium text-foreground mb-1">Something went wrong</p>
      <p className="text-xs text-foreground-muted mb-4">{message}</p>
      {onRetry && (
        <Button variant="outline" size="sm" onClick={onRetry}>
          <RefreshCw className="w-3 h-3 mr-1.5" />
          Retry
        </Button>
      )}
    </div>
  );
}
