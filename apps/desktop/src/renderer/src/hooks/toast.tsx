import { createContext, useCallback, useContext, useMemo, useRef, useState } from 'react'
import { CircleAlert, X } from 'lucide-react'
import { errorMessage } from '@/lib/api'

interface Toast {
  id: number
  message: string
}

interface ToastApi {
  /** 显示错误提示，几秒后自动消失 */
  error: (err: unknown) => void
}

const ToastContext = createContext<ToastApi>({ error: (err) => console.error(err) })

export function useToast(): ToastApi {
  return useContext(ToastContext)
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])
  const nextId = useRef(1)

  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), [])

  const api = useMemo<ToastApi>(
    () => ({
      error: (err) => {
        const id = nextId.current++
        setToasts((t) => [...t.slice(-2), { id, message: errorMessage(err) }])
        setTimeout(() => dismiss(id), 6000)
      }
    }),
    [dismiss]
  )

  return (
    <ToastContext.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed right-4 bottom-4 z-[60] flex w-96 flex-col gap-2" aria-live="polite">
        {toasts.map((t) => (
          <div
            key={t.id}
            role="alert"
            className="pointer-events-auto flex items-start gap-2 rounded-md border bg-popover px-3 py-2.5 text-[13px] shadow-lg"
          >
            <CircleAlert className="mt-0.5 size-4 shrink-0 text-destructive" />
            <span className="min-w-0 flex-1 break-words">{t.message}</span>
            <button
              type="button"
              className="rounded p-0.5 text-muted-foreground hover:bg-hover"
              onClick={() => dismiss(t.id)}
              aria-label="关闭"
            >
              <X className="size-3.5" />
            </button>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}
