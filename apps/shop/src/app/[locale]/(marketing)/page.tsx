import { BuildForSection } from "./_components/build-for-section"
import { BuildWithSection } from "./_components/build-with-section"
import { CapabilitiesSection } from "./_components/capabilities-section"
import { CtaBannerSection } from "./_components/cta-banner-section"
import { HeroSection } from "./_components/hero-section"
import { MarketingFooter } from "./_components/marketing-footer"
import { MarketingHeader } from "./_components/marketing-header"
import { PricingSection } from "./_components/pricing-section"
import { SandboxFeaturesSection } from "./_components/sandbox-features-section"

export default function MarketingPage() {
  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <HeroSection />
      <BuildForSection />
      <SandboxFeaturesSection />
      <CapabilitiesSection />
      <PricingSection />
      <BuildWithSection />
      <CtaBannerSection />
      <MarketingFooter />
    </main>
  )
}
