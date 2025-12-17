import * as React from "react"
import { cn } from "../../lib/utils"

interface TabsProps {
  value: number | string
  onValueChange: (value: number | string) => void
  children: React.ReactNode
  className?: string
}

interface TabsListProps {
  children: React.ReactNode
  className?: string
}

interface TabsTriggerProps {
  value: number | string
  children: React.ReactNode
  className?: string
  disabled?: boolean
}

interface TabsContentProps {
  value: number | string
  children: React.ReactNode
  className?: string
}

const TabsContext = React.createContext<{
  value: number | string
  onValueChange: (value: number | string) => void
} | null>(null)

export function Tabs({ value, onValueChange, children, className }: TabsProps) {
  return (
    <TabsContext.Provider value={{ value, onValueChange }}>
      <div className={cn("", className)}>
        {children}
      </div>
    </TabsContext.Provider>
  )
}

export function TabsList({ children, className }: TabsListProps) {
  return (
    <div
      className={cn(
        "inline-flex h-10 items-center justify-start gap-1 rounded-md bg-surface p-1 text-foreground-muted border-b border-border",
        className
      )}
    >
      {children}
    </div>
  )
}

export function TabsTrigger({ value, children, className, disabled = false }: TabsTriggerProps) {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error("TabsTrigger must be used within Tabs")

  const isSelected = context.value === value

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isSelected}
      disabled={disabled}
      onClick={() => context.onValueChange(value)}
      className={cn(
        "inline-flex items-center justify-center whitespace-nowrap rounded-sm px-3 py-1.5 text-sm font-medium ring-offset-background transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
        isSelected
          ? "bg-background text-foreground shadow-sm border-b-2 border-primary"
          : "text-foreground-muted hover:text-foreground hover:bg-surface-hover",
        className
      )}
    >
      {children}
    </button>
  )
}

export function TabsContent({ value, children, className }: TabsContentProps) {
  const context = React.useContext(TabsContext)
  if (!context) throw new Error("TabsContent must be used within Tabs")

  if (context.value !== value) return null

  return (
    <div
      role="tabpanel"
      className={cn(
        "mt-2 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2",
        className
      )}
    >
      {children}
    </div>
  )
}
