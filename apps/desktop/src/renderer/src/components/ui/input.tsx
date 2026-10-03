import * as React from 'react'
import { cn } from '@/lib/utils'

function Input({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn(
        'h-8 w-full min-w-0 rounded-md border border-input bg-background px-2.5 text-[13px] outline-none placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/30 disabled:opacity-50',
        className
      )}
      {...props}
    />
  )
}

/** 没有边框的输入框，用在表格单元格和弹出框顶部 */
function BareInput({ className, ...props }: React.ComponentProps<'input'>) {
  return (
    <input
      className={cn('w-full min-w-0 bg-transparent outline-none placeholder:text-muted-foreground', className)}
      {...props}
    />
  )
}

/** 原生下拉框，用在过滤和排序编辑器里 */
function Select({ className, ...props }: React.ComponentProps<'select'>) {
  return (
    <select
      className={cn(
        'h-7 min-w-0 rounded border border-input bg-background px-1.5 text-[13px] outline-none focus-visible:border-ring',
        className
      )}
      {...props}
    />
  )
}

export { BareInput, Input, Select }
