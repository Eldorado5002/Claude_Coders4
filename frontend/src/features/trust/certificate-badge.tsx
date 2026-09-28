import { useQuery } from '@tanstack/react-query'
import { ShieldCheck, ShieldOff } from 'lucide-react'
import { Link } from 'react-router'
import { certificateQ } from '@/api/queries'
import { AgentMark } from '@/components/precedent'
import { cn } from '@/lib/utils'
import { decisionsNeeded } from '@/lib/certificate'
import { certificateChip } from './certificate-chip'

/** Is auto-pay statistically earned? One line, linking to the proof on the Learning page. */
export function CertificateBadge() {
  const q = useQuery(certificateQ())
  if (!q.data) return null
  const chip = certificateChip(q.data)
  const need = decisionsNeeded(q.data)
  const progress = chip.tone === 'collecting' && need ? Math.min(1, q.data.decisions / need) : null
  return (
    <Link
      to="/learning#trust"
      className={cn(
        'group inline-flex items-center gap-2 px-2.5 py-1 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring/40',
        chip.tone === 'certified' && 'border-[1.5px] border-foreground font-semibold',
        chip.tone === 'collecting' && 'border border-dashed border-foreground/50',
        chip.tone === 'paused' && 'border border-reject/50 bg-reject-soft text-reject',
      )}
      title="How the autonomy certificate works"
    >
      {chip.tone === 'certified' ? (
        <AgentMark />
      ) : chip.tone === 'paused' ? (
        <ShieldOff className="size-3.5" aria-hidden />
      ) : (
        <ShieldCheck className="size-3.5 text-muted-foreground" aria-hidden />
      )}
      <span className="tracking-[0.02em]">{chip.label}</span>
      <span className="text-muted-foreground">· {chip.detail}</span>
      {progress != null && (
        <span className="ml-1 hidden h-px w-12 bg-rule sm:block" aria-hidden>
          <span className="block h-px bg-foreground" style={{ width: `${progress * 100}%` }} />
        </span>
      )}
    </Link>
  )
}
