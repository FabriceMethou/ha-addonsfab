import * as React from "react"
import { ChevronDown } from "lucide-react"
import { cn } from "../../lib/utils"

interface AccordionProps {
  children: React.ReactNode
  className?: string
}

interface AccordionItemProps {
  children: React.ReactNode
  className?: string
  defaultOpen?: boolean
}

interface AccordionTriggerProps {
  children: React.ReactNode
  className?: string
}

interface AccordionContentProps {
  children: React.ReactNode
  className?: string
}

const AccordionContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
} | null>(null)

export function Accordion({ children, className }: AccordionProps) {
  return (
    <div className={cn("space-y-2", className)}>
      {children}
    </div>
  )
}

export function AccordionItem({ children, className, defaultOpen = false }: AccordionItemProps) {
  const [open, setOpen] = React.useState(defaultOpen)

  return (
    <AccordionContext.Provider value={{ open, setOpen }}>
      <div className={cn("rounded-lg border border-border bg-surface overflow-hidden", className)}>
        {children}
      </div>
    </AccordionContext.Provider>
  )
}

export function AccordionTrigger({ children, className }: AccordionTriggerProps) {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error("AccordionTrigger must be used within AccordionItem")

  const { open, setOpen } = context

  return (
    <button
      type="button"
      onClick={() => setOpen(!open)}
      className={cn(
        "flex w-full items-center justify-between px-4 py-3 text-left font-medium transition-all hover:bg-surface-hover",
        className
      )}
    >
      {children}
      <ChevronDown
        className={cn(
          "h-4 w-4 shrink-0 transition-transform duration-200",
          open && "rotate-180"
        )}
      />
    </button>
  )
}

export function AccordionContent({ children, className }: AccordionContentProps) {
  const context = React.useContext(AccordionContext)
  if (!context) throw new Error("AccordionContent must be used within AccordionItem")

  const { open } = context

  if (!open) return null

  return (
    <div className={cn("border-t border-border px-4 py-3", className)}>
      {children}
    </div>
  )
}
