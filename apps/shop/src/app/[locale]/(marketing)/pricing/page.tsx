import { CtaBannerSection } from "../_components/cta-banner-section"
import { MarketingFooter } from "../_components/marketing-footer"
import { MarketingHeader } from "../_components/marketing-header"
import { PricingGpuSection } from "../_components/pricing-gpu-section"
import { PricingHeroSection } from "../_components/pricing-hero-section"
import { PricingModelsSection } from "../_components/pricing-models-section"
import { PricingSandboxSection } from "../_components/pricing-sandbox-section"

export default function PricingPage() {
  return (
    <main className="relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <PricingHeroSection />
      <PricingModelsSection />
      <PricingGpuSection />
      <PricingSandboxSection />
      <CtaBannerSection />
      <MarketingFooter />
    </main>
  )
}
