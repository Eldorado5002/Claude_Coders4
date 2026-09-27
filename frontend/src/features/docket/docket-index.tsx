import { Inbox } from 'lucide-react'
import { EmptyState } from '@/components/precedent'

export default function DocketIndex() {
  return <EmptyState icon={<Inbox />} title="Pick a case from the docket." />
}
