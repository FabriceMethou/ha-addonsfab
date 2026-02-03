import { cn } from '../../lib/utils'

interface SkeletonProps extends React.HTMLAttributes<HTMLDivElement> {}

function Skeleton({ className, ...props }: SkeletonProps) {
  return (
    <div
      className={cn(
        'animate-pulse rounded-md bg-muted/50',
        className
      )}
      {...props}
    />
  )
}

// Table skeleton with configurable rows and columns
interface TableSkeletonProps {
  rows?: number
  columns?: number
  showHeader?: boolean
}

function TableSkeleton({ rows = 5, columns = 5, showHeader = true }: TableSkeletonProps) {
  return (
    <div className="w-full">
      {showHeader && (
        <div className="flex gap-4 p-4 border-b border-border">
          {Array.from({ length: columns }).map((_, i) => (
            <Skeleton key={i} className="h-4 flex-1" />
          ))}
        </div>
      )}
      {Array.from({ length: rows }).map((_, rowIndex) => (
        <div key={rowIndex} className="flex gap-4 p-4 border-b border-border">
          {Array.from({ length: columns }).map((_, colIndex) => (
            <Skeleton
              key={colIndex}
              className="h-4 flex-1"
              style={{ maxWidth: colIndex === 0 ? '200px' : undefined }}
            />
          ))}
        </div>
      ))}
    </div>
  )
}

// Card skeleton
interface CardSkeletonProps {
  showHeader?: boolean
  showFooter?: boolean
  lines?: number
}

function CardSkeleton({ showHeader = true, showFooter = false, lines = 3 }: CardSkeletonProps) {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-4">
      {showHeader && (
        <div className="space-y-2">
          <Skeleton className="h-5 w-1/3" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      )}
      <div className="space-y-2">
        {Array.from({ length: lines }).map((_, i) => (
          <Skeleton key={i} className="h-4" style={{ width: `${100 - i * 15}%` }} />
        ))}
      </div>
      {showFooter && (
        <div className="pt-4 border-t border-border">
          <Skeleton className="h-8 w-24" />
        </div>
      )}
    </div>
  )
}

// Chart skeleton
interface ChartSkeletonProps {
  height?: number | string
  type?: 'bar' | 'line' | 'pie' | 'area'
}

function ChartSkeleton({ height = 300, type = 'bar' }: ChartSkeletonProps) {
  if (type === 'pie') {
    return (
      <div className="flex items-center justify-center" style={{ height }}>
        <Skeleton className="w-48 h-48 rounded-full" />
      </div>
    )
  }

  return (
    <div className="w-full p-4" style={{ height }}>
      <div className="h-full flex items-end gap-2">
        {Array.from({ length: 12 }).map((_, i) => (
          <Skeleton
            key={i}
            className="flex-1 rounded-t"
            style={{ height: `${30 + Math.random() * 60}%` }}
          />
        ))}
      </div>
    </div>
  )
}

// List skeleton
interface ListSkeletonProps {
  items?: number
  showAvatar?: boolean
  showAction?: boolean
}

function ListSkeleton({ items = 5, showAvatar = false, showAction = false }: ListSkeletonProps) {
  return (
    <div className="space-y-3">
      {Array.from({ length: items }).map((_, i) => (
        <div key={i} className="flex items-center gap-4 p-3 rounded-lg border border-border">
          {showAvatar && <Skeleton className="w-10 h-10 rounded-full flex-shrink-0" />}
          <div className="flex-1 space-y-2">
            <Skeleton className="h-4 w-3/4" />
            <Skeleton className="h-3 w-1/2" />
          </div>
          {showAction && <Skeleton className="w-8 h-8 rounded flex-shrink-0" />}
        </div>
      ))}
    </div>
  )
}

// KPI/Stat card skeleton
function StatSkeleton() {
  return (
    <div className="rounded-xl border border-border bg-card p-6 space-y-3">
      <div className="flex items-center justify-between">
        <Skeleton className="h-4 w-24" />
        <Skeleton className="w-10 h-10 rounded-lg" />
      </div>
      <Skeleton className="h-8 w-32" />
      <Skeleton className="h-3 w-20" />
    </div>
  )
}

// Dashboard grid skeleton
function DashboardSkeleton() {
  return (
    <div className="space-y-6">
      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Charts Row */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <ChartSkeleton height={250} type="area" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-32 mb-4" />
          <ChartSkeleton height={250} type="pie" />
        </div>
      </div>

      {/* Recent transactions */}
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <ListSkeleton items={5} showAction />
      </div>
    </div>
  )
}

// Transactions page skeleton
function TransactionsSkeleton() {
  return (
    <div className="space-y-4">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 rounded-xl border border-border bg-card">
        <Skeleton className="h-10 w-48" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <TableSkeleton rows={10} columns={6} />
      </div>
    </div>
  )
}

// Accounts page skeleton
function AccountsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Accounts list */}
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-32 mb-4" />
        <ListSkeleton items={6} showAvatar showAction />
      </div>
    </div>
  )
}

// Categories page skeleton
function CategoriesSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <ListSkeleton items={8} showAction />
      </div>
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-40 mb-4" />
        <ListSkeleton items={8} showAction />
      </div>
    </div>
  )
}

// Investments page skeleton
function InvestmentsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Portfolio summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Holdings table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-5 w-32" />
        </div>
        <TableSkeleton rows={8} columns={7} showHeader />
      </div>
    </div>
  )
}

// Budgets page skeleton
function BudgetsSkeleton() {
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-4">
            <div className="flex items-center justify-between">
              <Skeleton className="h-5 w-24" />
              <Skeleton className="h-6 w-16 rounded-full" />
            </div>
            <Skeleton className="h-3 w-full rounded-full" />
            <div className="flex justify-between">
              <Skeleton className="h-4 w-20" />
              <Skeleton className="h-4 w-20" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Debts page skeleton
function DebtsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Debts list */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {Array.from({ length: 4 }).map((_, i) => (
          <CardSkeleton key={i} showHeader showFooter lines={2} />
        ))}
      </div>
    </div>
  )
}

// Envelopes page skeleton
function EnvelopesSkeleton() {
  return (
    <div className="space-y-6">
      {/* Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <StatSkeleton key={i} />
        ))}
      </div>

      {/* Envelopes grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-border bg-card p-6 space-y-4">
            <Skeleton className="h-5 w-32" />
            <Skeleton className="h-2 w-full rounded-full" />
            <div className="flex justify-between">
              <Skeleton className="h-6 w-24" />
              <Skeleton className="h-6 w-24" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// Recurring page skeleton
function RecurringSkeleton() {
  return (
    <div className="space-y-6">
      {/* Pending section */}
      <div className="rounded-xl border border-border bg-card p-6">
        <Skeleton className="h-5 w-48 mb-4" />
        <ListSkeleton items={3} showAction />
      </div>

      {/* Templates table */}
      <div className="rounded-xl border border-border bg-card overflow-hidden">
        <div className="p-4 border-b border-border">
          <Skeleton className="h-5 w-40" />
        </div>
        <TableSkeleton rows={6} columns={5} />
      </div>
    </div>
  )
}

// Reports page skeleton
function ReportsSkeleton() {
  return (
    <div className="space-y-6">
      {/* Filters */}
      <div className="flex flex-wrap gap-4 p-4 rounded-xl border border-border bg-card">
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-36" />
        <Skeleton className="h-10 w-24" />
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <ChartSkeleton height={300} type="bar" />
        </div>
        <div className="rounded-xl border border-border bg-card p-6">
          <Skeleton className="h-5 w-40 mb-4" />
          <ChartSkeleton height={300} type="pie" />
        </div>
      </div>
    </div>
  )
}

export {
  Skeleton,
  TableSkeleton,
  CardSkeleton,
  ChartSkeleton,
  ListSkeleton,
  StatSkeleton,
  DashboardSkeleton,
  TransactionsSkeleton,
  AccountsSkeleton,
  CategoriesSkeleton,
  InvestmentsSkeleton,
  BudgetsSkeleton,
  DebtsSkeleton,
  EnvelopesSkeleton,
  RecurringSkeleton,
  ReportsSkeleton,
}
