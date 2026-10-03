import { useState } from 'react'
import {
  ArrowUpDown,
  CalendarDays,
  Copy,
  Eye,
  Filter,
  GalleryVerticalEnd,
  Group,
  Kanban,
  List,
  MoreHorizontal,
  Plus,
  Sheet,
  Trash2
} from 'lucide-react'
import type { Schema, ViewDef, ViewType } from '@shared/db'
import { OptionTag } from '@/components/properties/PropertyValue'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger
} from '@/components/ui/dropdown-menu'
import { Input } from '@/components/ui/input'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { allFields, fieldInfo, toggleColumn, visibleColumns } from '@/lib/fields'
import { cn } from '@/lib/utils'
import { VIEW_TYPE_LABELS, countConditions } from '@/lib/view-logic'
import { FilterEditor, SortEditor } from './FilterEditor'

export const VIEW_ICONS: Record<ViewType, typeof Sheet> = {
  table: Sheet,
  board: Kanban,
  calendar: CalendarDays,
  list: List,
  gallery: GalleryVerticalEnd
}

// ---------------------------------------------------------------- 视图标签

interface TabsProps {
  views: ViewDef[]
  current: string
  /** 有临时修改的视图 */
  dirty: Set<string>
  onSelect: (name: string) => void
  onRename: (from: string, to: string) => void
  onAdd: (type: ViewType) => void
}

export function ViewTabs({ views, current, dirty, onSelect, onRename, onAdd }: TabsProps) {
  const [renaming, setRenaming] = useState<string | null>(null)
  const [text, setText] = useState('')

  return (
    <div className="flex min-w-0 items-center gap-0.5 overflow-x-auto overflow-y-hidden" role="tablist">
      {views.map((v) => {
        const Icon = VIEW_ICONS[v.type] ?? Sheet
        const active = v.name === current
        if (renaming === v.name) {
          return (
            <Input
              key={v.name}
              autoFocus
              className="h-7 w-36"
              value={text}
              onChange={(e) => setText(e.target.value)}
              onFocus={(e) => e.target.select()}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  if (text.trim() && text.trim() !== v.name) onRename(v.name, text.trim())
                  setRenaming(null)
                }
                if (e.key === 'Escape') setRenaming(null)
              }}
              onBlur={() => setRenaming(null)}
            />
          )
        }
        return (
          <button
            key={v.name}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onSelect(v.name)}
            onDoubleClick={() => {
              setText(v.name)
              setRenaming(v.name)
            }}
            title="双击重命名"
            className={cn(
              'relative flex h-8 shrink-0 items-center gap-1.5 px-2 text-[13px] whitespace-nowrap',
              active
                ? 'font-medium text-foreground after:absolute after:inset-x-1 after:-bottom-px after:h-0.5 after:rounded-full after:bg-foreground'
                : 'text-muted-foreground hover:text-foreground'
            )}
          >
            <Icon className="size-3.5" />
            {v.name}
            {dirty.has(v.name) && <span className="size-1.5 rounded-full bg-primary" aria-label="有未保存的修改" />}
          </button>
        )
      })}
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 shrink-0 text-muted-foreground" aria-label="新建视图">
            <Plus />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent>
          <DropdownMenuLabel>新建视图</DropdownMenuLabel>
          {(Object.keys(VIEW_TYPE_LABELS) as ViewType[]).map((t) => {
            const Icon = VIEW_ICONS[t]
            return (
              <DropdownMenuItem key={t} onSelect={() => onAdd(t)}>
                <Icon />
                {VIEW_TYPE_LABELS[t]}
              </DropdownMenuItem>
            )
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

// ---------------------------------------------------------------- 工具按钮

interface ToolsProps {
  schema: Schema
  view: ViewDef
  onChange: (view: ViewDef) => void
  onDuplicate: () => void
  onDelete: () => void
}

function ToolButton({ active, children, ...props }: React.ComponentProps<typeof Button> & { active?: boolean }) {
  return (
    <Button
      variant="ghost"
      size="sm"
      className={cn('text-muted-foreground', active && 'text-primary hover:text-primary')}
      {...props}
    >
      {children}
    </Button>
  )
}

/** 过滤、排序、分组、属性、视图设置：都只改临时视图，保存后才写回 schema */
export function ViewTools({ schema, view, onChange, onDuplicate, onDelete }: ToolsProps) {
  const filterCount = countConditions(view.filter)
  const sortCount = view.sort?.length ?? 0
  const keep = (e: Event): void => e.preventDefault() // 勾选后菜单不关闭

  const groupable = allFields(schema).filter((f) =>
    view.type === 'board'
      ? f.kind === 'select' || f.kind === 'status'
      : !['title', 'mtime', 'progress', 'count', 'number', 'text', 'url', 'recurrence'].includes(f.kind)
  )
  const groupDef = view.group ? fieldInfo(schema, view.group)?.def : undefined
  const shown = visibleColumns(schema, view)

  return (
    <div className="flex shrink-0 items-center gap-0.5">
      <Popover>
        <PopoverTrigger asChild>
          <ToolButton active={filterCount > 0}>
            <Filter />
            过滤{filterCount > 0 && ` ${filterCount}`}
          </ToolButton>
        </PopoverTrigger>
        <PopoverContent align="end">
          <FilterEditor schema={schema} filter={view.filter ?? []} onChange={(filter) => onChange({ ...view, filter })} />
        </PopoverContent>
      </Popover>

      <Popover>
        <PopoverTrigger asChild>
          <ToolButton active={sortCount > 0}>
            <ArrowUpDown />
            排序{sortCount > 0 && ` ${sortCount}`}
          </ToolButton>
        </PopoverTrigger>
        <PopoverContent align="end">
          <SortEditor schema={schema} sort={view.sort ?? []} onChange={(sort) => onChange({ ...view, sort })} />
        </PopoverContent>
      </Popover>

      {view.type !== 'calendar' && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <ToolButton active={!!view.group}>
              <Group />
              分组{view.group && `：${fieldInfo(schema, view.group)?.label ?? view.group}`}
            </ToolButton>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuLabel>按字段分组</DropdownMenuLabel>
            {view.type !== 'board' && (
              <DropdownMenuCheckboxItem checked={!view.group} onCheckedChange={() => onChange({ ...view, group: undefined })}>
                不分组
              </DropdownMenuCheckboxItem>
            )}
            {groupable.map((f) => (
              <DropdownMenuCheckboxItem
                key={f.key}
                checked={view.group === f.key}
                onCheckedChange={() => onChange({ ...view, group: f.key, hide: view.type === 'board' ? undefined : view.hide })}
              >
                {f.label}
              </DropdownMenuCheckboxItem>
            ))}
            {view.type === 'board' && groupDef?.options?.length ? (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuLabel>显示的列</DropdownMenuLabel>
                {groupDef.options.map((o) => {
                  const hidden = view.hide?.includes(o) ?? false
                  return (
                    <DropdownMenuCheckboxItem
                      key={o}
                      checked={!hidden}
                      onSelect={keep}
                      onCheckedChange={() => {
                        const hide = hidden ? (view.hide ?? []).filter((x) => x !== o) : [...(view.hide ?? []), o]
                        onChange({ ...view, hide: hide.length ? hide : undefined })
                      }}
                    >
                      <OptionTag def={groupDef} value={o} />
                    </DropdownMenuCheckboxItem>
                  )
                })}
              </>
            ) : null}
          </DropdownMenuContent>
        </DropdownMenu>
      )}

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <ToolButton>
            <Eye />
            属性
          </ToolButton>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>{view.type === 'table' ? '显示的列' : '卡片上显示的属性'}</DropdownMenuLabel>
          {allFields(schema)
            .filter((f) => f.key !== 'name')
            .map((f) => (
              <DropdownMenuCheckboxItem
                key={f.key}
                checked={shown.includes(f.key)}
                onSelect={keep}
                onCheckedChange={() => onChange(toggleColumn(schema, view, f.key))}
              >
                {f.label}
              </DropdownMenuCheckboxItem>
            ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="size-7 text-muted-foreground" aria-label="视图设置">
            <MoreHorizontal />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-52">
          <DropdownMenuLabel>视图类型</DropdownMenuLabel>
          {(Object.keys(VIEW_TYPE_LABELS) as ViewType[]).map((t) => {
            const Icon = VIEW_ICONS[t]
            return (
              <DropdownMenuCheckboxItem key={t} checked={view.type === t} onCheckedChange={() => onChange(changeType(schema, view, t))}>
                <span className="flex items-center gap-2">
                  <Icon className="size-4 opacity-70" />
                  {VIEW_TYPE_LABELS[t]}
                </span>
              </DropdownMenuCheckboxItem>
            )
          })}
          {view.type === 'calendar' && (
            <FieldChoice
              label="日期字段"
              fields={allFields(schema).filter((f) => f.def?.type === 'date' && schema.fields[f.key])}
              value={view.date}
              onPick={(date) => onChange({ ...view, date })}
            />
          )}
          {view.type === 'gallery' && (
            <FieldChoice
              label="封面图片"
              fields={allFields(schema).filter((f) => f.kind === 'url' || f.kind === 'text')}
              value={view.cover}
              onPick={(cover) => onChange({ ...view, cover })}
              allowNone
            />
          )}
          {schema.fields.archived?.type === 'checkbox' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuCheckboxItem
                checked={view.include_archived === true}
                onCheckedChange={(on) => onChange({ ...view, include_archived: on === true ? true : undefined })}
              >
                显示已归档的条目
              </DropdownMenuCheckboxItem>
            </>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={onDuplicate}>
            <Copy />
            复制视图
          </DropdownMenuItem>
          <DropdownMenuItem destructive onSelect={onDelete}>
            <Trash2 />
            删除视图
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  )
}

function FieldChoice({
  label,
  fields,
  value,
  onPick,
  allowNone
}: {
  label: string
  fields: { key: string; label: string }[]
  value: string | undefined
  onPick: (key: string | undefined) => void
  allowNone?: boolean
}) {
  return (
    <>
      <DropdownMenuSeparator />
      <DropdownMenuLabel>{label}</DropdownMenuLabel>
      {allowNone && (
        <DropdownMenuCheckboxItem checked={!value} onCheckedChange={() => onPick(undefined)}>
          无
        </DropdownMenuCheckboxItem>
      )}
      {fields.map((f) => (
        <DropdownMenuCheckboxItem key={f.key} checked={value === f.key} onCheckedChange={() => onPick(f.key)}>
          {f.label}
        </DropdownMenuCheckboxItem>
      ))}
    </>
  )
}

/** 切换视图类型时补上新类型需要的设置 */
function changeType(schema: Schema, view: ViewDef, type: ViewType): ViewDef {
  const next: ViewDef = { ...view, type }
  const fields = Object.entries(schema.fields)
  if (type === 'board') {
    const t = view.group ? schema.fields[view.group]?.type : undefined
    if (t !== 'select' && t !== 'status') {
      next.group = (fields.find(([, f]) => f.type === 'status') ?? fields.find(([, f]) => f.type === 'select'))?.[0]
    }
    next.hide = undefined
  } else if (view.type === 'board') {
    next.hide = undefined
  }
  if (type === 'calendar' && schema.fields[view.date ?? '']?.type !== 'date') {
    next.date = fields.find(([, f]) => f.type === 'date')?.[0]
  }
  return next
}

// ---------------------------------------------------------------- 未保存的修改

interface DirtyProps {
  onReset: () => void
  onSave: () => void
  onSaveAs: (name: string) => void
  suggestName: string
}

export function DirtyBar({ onReset, onSave, onSaveAs, suggestName }: DirtyProps) {
  const [name, setName] = useState(suggestName)
  const [open, setOpen] = useState(false)
  return (
    <div className="flex items-center gap-1 text-[13px]">
      <span className="mr-1 text-muted-foreground">视图已修改</span>
      <Button variant="ghost" size="sm" onClick={onReset}>
        重置
      </Button>
      <Popover
        open={open}
        onOpenChange={(o) => {
          setOpen(o)
          if (o) setName(suggestName)
        }}
      >
        <PopoverTrigger asChild>
          <Button variant="outline" size="sm">
            另存为新视图
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-64 p-3">
          <form
            className="space-y-2"
            onSubmit={(e) => {
              e.preventDefault()
              if (!name.trim()) return
              onSaveAs(name.trim())
              setOpen(false)
            }}
          >
            <label className="block text-[13px] text-muted-foreground" htmlFor="save-as-name">
              新视图的名字
            </label>
            <Input id="save-as-name" autoFocus value={name} onChange={(e) => setName(e.target.value)} />
            <Button type="submit" size="sm" className="w-full">
              保存
            </Button>
          </form>
        </PopoverContent>
      </Popover>
      <Button size="sm" onClick={onSave}>
        保存
      </Button>
    </div>
  )
}
