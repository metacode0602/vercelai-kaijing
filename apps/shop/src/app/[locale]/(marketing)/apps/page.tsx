import { MarketingFooter } from "../_components/marketing-footer"
import { MarketingHeader } from "../_components/marketing-header"
import { AppsCtaSection } from "./_components/apps-cta-section"
import { AppsHeroSection } from "./_components/apps-hero-section"
import { AppsTemplatesSection } from "./_components/apps-templates-section"

export default function AppsPage() {
  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <AppsHeroSection />
      <AppsTemplatesSection />
      <AppsCtaSection />
      <MarketingFooter />
    </main>
  )
}
