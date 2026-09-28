import type { DocketSort as Sort } from '@/api/keys'
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group'
import { SORTS } from './docket-view'

/** Newest · MSME deadline · Amount at risk: the order the server returns the docket in. */
export function DocketSort({ value, onChange }: { value: Sort; onChange: (s: Sort) => void }) {
  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span id="docket-sort-label" className="text-[11px] text-muted-foreground">
        Sort
      </span>
      <ToggleGroup
        type="single"
        variant="outline"
        spacing={1}
        value={value}
        onValueChange={(v) => v && onChange(v as Sort)}
        aria-labelledby="docket-sort-label"
        className="flex-wrap"
      >
        {SORTS.map((s) => (
          <ToggleGroupItem
            key={s.id}
            value={s.id}
            className="h-7 px-2.5 text-[11px] tracking-[0.06em] data-[state=on]:border-foreground"
          >
            {s.label}
          </ToggleGroupItem>
        ))}
      </ToggleGroup>
    </div>
  )
}
