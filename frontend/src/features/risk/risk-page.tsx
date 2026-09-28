import { PageHeader } from '@/components/precedent'
import { BenfordSection } from './benford-panel'
import { VendorRankingSection } from './vendor-ranking'

export default function RiskPage() {
  return (
    <div className="mx-auto w-full max-w-[1240px] px-5 py-8 md:px-10">
      <div className="space-y-12">
        <PageHeader
          eyebrow="Risk"
          title="Where to look twice."
          description="Each vendor’s score combines fraud signals (bank changes, duplicates), its exception rate and Benford’s law. A screen, not proof."
        />
        <VendorRankingSection />
        <BenfordSection />
      </div>
    </div>
  )
}
