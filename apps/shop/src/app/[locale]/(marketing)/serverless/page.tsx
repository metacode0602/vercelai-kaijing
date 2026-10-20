import { MarketingFooter } from "../_components/marketing-footer"
import { MarketingHeader } from "../_components/marketing-header"
import { ServerlessApiSection } from "./_components/serverless-api-section"
import { ServerlessCapabilitiesSection } from "./_components/serverless-capabilities-section"
import { ServerlessCtaSection } from "./_components/serverless-cta-section"
import { ServerlessGlobalSection } from "./_components/serverless-global-section"
import { ServerlessHeroSection } from "./_components/serverless-hero-section"
import { ServerlessPricingSection } from "./_components/serverless-pricing-section"

export default function ServerlessPage() {
  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <ServerlessHeroSection />
      <ServerlessPricingSection />
      <ServerlessApiSection />
      <ServerlessCapabilitiesSection />
      <ServerlessGlobalSection />
      <ServerlessCtaSection />
      <MarketingFooter />
    </main>
  )
}
