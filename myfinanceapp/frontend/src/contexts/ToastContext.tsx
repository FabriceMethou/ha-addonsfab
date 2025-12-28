import { createContext, useContext, useState, useCallback, ReactNode } from 'react'
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
  getToastIcon,
} from '../components/shadcn/Toast'

type ToastVariant = 'default' | 'success' | 'error' | 'warning' | 'info'

interface ToastMessage {
  id: string
  title?: string
  description: string
  variant: ToastVariant
  duration?: number
}

interface ToastContextValue {
  showToast: (message: Omit<ToastMessage, 'id'>) => void
  success: (description: string, title?: string) => void
  error: (description: string, title?: string) => void
  warning: (description: string, title?: string) => void
  info: (description: string, title?: string) => void
}

const ToastContext = createContext<ToastContextValue | undefined>(undefined)

export function ToastContextProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastMessage[]>([])

  const showToast = useCallback(
    ({ title, description, variant = 'default', duration = 5000 }: Omit<ToastMessage, 'id'>) => {
      const id = Math.random().toString(36).substring(2, 9)
      setToasts((prev) => [...prev, { id, title, description, variant, duration }])
    },
    []
  )

  const success = useCallback(
    (description: string, title?: string) => {
      showToast({ description, title, variant: 'success' })
    },
    [showToast]
  )

  const error = useCallback(
    (description: string, title?: string) => {
      showToast({ description, title, variant: 'error' })
    },
    [showToast]
  )

  const warning = useCallback(
    (description: string, title?: string) => {
      showToast({ description, title, variant: 'warning' })
    },
    [showToast]
  )

  const info = useCallback(
    (description: string, title?: string) => {
      showToast({ description, title, variant: 'info' })
    },
    [showToast]
  )

  const removeToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((toast) => toast.id !== id))
  }, [])

  return (
    <ToastContext.Provider value={{ showToast, success, error, warning, info }}>
      <ToastProvider>
        {children}
        {toasts.map((toast) => (
          <Toast
            key={toast.id}
            variant={toast.variant}
            duration={toast.duration}
            onOpenChange={(open) => {
              if (!open) removeToast(toast.id)
            }}
          >
            <div className="flex gap-3">
              {getToastIcon(toast.variant)}
              <div className="grid gap-1">
                {toast.title && <ToastTitle>{toast.title}</ToastTitle>}
                <ToastDescription>{toast.description}</ToastDescription>
              </div>
            </div>
            <ToastClose />
          </Toast>
        ))}
        <ToastViewport />
      </ToastProvider>
    </ToastContext.Provider>
  )
}

export function useToast() {
  const context = useContext(ToastContext)
  if (context === undefined) {
    throw new Error('useToast must be used within a ToastContextProvider')
  }
  return context
}
