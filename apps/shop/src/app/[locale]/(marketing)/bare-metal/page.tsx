import { MarketingFooter } from "../_components/marketing-footer"
import { MarketingHeader } from "../_components/marketing-header"
import { BareMetalCtaSection } from "./_components/bare-metal-cta-section"
import { BareMetalHeroSection } from "./_components/bare-metal-hero-section"
import { BareMetalSolutionsSection } from "./_components/bare-metal-solutions-section"
import { BareMetalWhySection } from "./_components/bare-metal-why-section"

export default function BareMetalPage() {
  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <BareMetalHeroSection />
      <BareMetalSolutionsSection />
      <BareMetalWhySection />
      <BareMetalCtaSection />
      <MarketingFooter />
    </main>
  )
}
