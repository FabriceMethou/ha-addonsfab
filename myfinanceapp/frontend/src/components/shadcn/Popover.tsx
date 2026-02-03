import * as React from "react"
import { cn } from "../../lib/utils"

interface PopoverProps {
  children: React.ReactNode
}

interface PopoverTriggerProps {
  children: React.ReactNode
  asChild?: boolean
}

interface PopoverContentProps {
  children: React.ReactNode
  className?: string
  align?: "start" | "center" | "end"
  sideOffset?: number
}

const PopoverContext = React.createContext<{
  open: boolean
  setOpen: React.Dispatch<React.SetStateAction<boolean>>
  triggerRef: React.RefObject<HTMLDivElement>
} | null>(null)

export function Popover({ children }: PopoverProps) {
  const [open, setOpen] = React.useState(false)
  const triggerRef = React.useRef<HTMLDivElement>(null)

  return (
    <PopoverContext.Provider value={{ open, setOpen, triggerRef }}>
      <div className="relative inline-block">
        {children}
      </div>
    </PopoverContext.Provider>
  )
}

export function PopoverTrigger({ children, asChild }: PopoverTriggerProps) {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error("PopoverTrigger must be used within Popover")

  const { setOpen, triggerRef } = context

  if (asChild && React.isValidElement(children)) {
    return React.cloneElement(children as React.ReactElement<any>, {
      onClick: (e: React.MouseEvent) => {
        e.stopPropagation()
        setOpen((prev) => !prev)
        const childOnClick = (children as React.ReactElement<any>).props?.onClick
        if (childOnClick) childOnClick(e)
      },
      ref: triggerRef,
    })
  }

  return (
    <div ref={triggerRef} onClick={() => setOpen((prev) => !prev)}>
      {children}
    </div>
  )
}

export function PopoverContent({ children, className, align = "start" }: PopoverContentProps) {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error("PopoverContent must be used within Popover")

  const { open, setOpen } = context
  const contentRef = React.useRef<HTMLDivElement>(null)

  React.useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (contentRef.current && !contentRef.current.contains(event.target as Node)) {
        const trigger = context.triggerRef.current
        if (trigger && trigger.contains(event.target as Node)) return
        setOpen(false)
      }
    }

    if (open) {
      document.addEventListener("mousedown", handleClickOutside)
    }

    return () => {
      document.removeEventListener("mousedown", handleClickOutside)
    }
  }, [open, setOpen, context.triggerRef])

  if (!open) return null

  const alignClasses = {
    start: "left-0",
    center: "left-1/2 -translate-x-1/2",
    end: "right-0",
  }

  return (
    <div
      ref={contentRef}
      className={cn(
        "absolute z-50 mt-2 rounded-md border border-border bg-background-paper p-4 shadow-lg animate-in fade-in-0 zoom-in-95",
        alignClasses[align],
        className
      )}
    >
      {children}
    </div>
  )
}

export function PopoverClose({ children, className }: { children: React.ReactNode; className?: string }) {
  const context = React.useContext(PopoverContext)
  if (!context) throw new Error("PopoverClose must be used within Popover")

  return (
    <button
      type="button"
      onClick={() => context.setOpen(false)}
      className={cn(
        "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
        className
      )}
    >
      {children}
    </button>
  )
}
