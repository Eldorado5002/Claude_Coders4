import { useQuery } from '@tanstack/react-query'
import { Check, ChevronsUpDown, X } from 'lucide-react'
import { useState } from 'react'
import { vendorsQ } from '@/api/queries'
import type { ExceptionType } from '@/api/types'
import { Button } from '@/components/ui/button'
import { Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from '@/components/ui/command'
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover'
import { HARD_CONTROLS, SOFT_TYPES, TYPE_LABEL } from '@/lib/labels'
import { cn } from '@/lib/utils'

type Props = {
  vendor?: string
  type?: ExceptionType
  onVendor: (v?: string) => void
  onType: (t?: ExceptionType) => void
}

function Picker({
  label,
  value,
  options,
  onChange,
  placeholder,
}: {
  label: string
  value?: string
  options: { value: string; label: string; hint?: string }[]
  onChange: (v?: string) => void
  placeholder: string
}) {
  const [open, setOpen] = useState(false)
  const current = options.find((o) => o.value === value)
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="xs"
          className={cn('h-7 max-w-[11rem] justify-between gap-1.5 normal-case tracking-normal font-medium', !current && 'text-muted-foreground')}
          aria-label={label}
        >
          <span className="truncate">{current?.label ?? placeholder}</span>
          <ChevronsUpDown className="opacity-60" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-64 p-0">
        <Command>
          <CommandInput placeholder={`Filter ${label.toLowerCase()}…`} />
          <CommandList>
            <CommandEmpty>No match.</CommandEmpty>
            <CommandGroup>
              {options.map((o) => (
                <CommandItem
                  key={o.value}
                  value={`${o.label} ${o.hint ?? ''}`}
                  onSelect={() => {
                    onChange(o.value === value ? undefined : o.value)
                    setOpen(false)
                  }}
                >
                  <Check className={cn('size-3.5', o.value === value ? 'opacity-100' : 'opacity-0')} />
                  <span className="truncate">{o.label}</span>
                  {o.hint && <span className="ml-auto text-[11px] text-muted-foreground">{o.hint}</span>}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  )
}

export function DocketFilters({ vendor, type, onVendor, onType }: Props) {
  const vendors = useQuery(vendorsQ())
  const types = [...SOFT_TYPES, ...HARD_CONTROLS].map((t) => ({
    value: t,
    label: TYPE_LABEL[t],
    hint: HARD_CONTROLS.includes(t) ? 'control' : undefined,
  }))
  return (
    <div className="flex flex-wrap items-center gap-2">
      <Picker
        label="Vendor"
        placeholder="All vendors"
        value={vendor}
        onChange={onVendor}
        options={(vendors.data ?? []).map((v) => ({ value: v.id, label: v.name, hint: v.city }))}
      />
      <Picker
        label="Type"
        placeholder="All types"
        value={type}
        onChange={(v) => onType(v as ExceptionType | undefined)}
        options={types}
      />
      {(vendor || type) && (
        <Button
          variant="ghost"
          size="xs"
          className="h-7 normal-case tracking-normal"
          onClick={() => {
            onVendor(undefined)
            onType(undefined)
          }}
        >
          <X /> Clear
        </Button>
      )}
    </div>
  )
}
