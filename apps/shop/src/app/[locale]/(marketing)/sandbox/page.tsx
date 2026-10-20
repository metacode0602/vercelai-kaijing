import { MarketingFooter } from "../_components/marketing-footer"
import { MarketingHeader } from "../_components/marketing-header"
import { AgentSandboxCapabilitiesSection } from "./_components/agent-sandbox-capabilities-section"
import { AgentSandboxCtaSection } from "./_components/agent-sandbox-cta-section"
import { AgentSandboxHeroSection } from "./_components/agent-sandbox-hero-section"
import { AgentSandboxPricingSection } from "./_components/agent-sandbox-pricing-section"
import { AgentSandboxQuickStartSection } from "./_components/agent-sandbox-quickstart-section"
import { AgentSandboxValuePropsSection } from "./_components/agent-sandbox-value-props-section"
import { AgentSandboxWorkloadsSection } from "./_components/agent-sandbox-workloads-section"

export default function AgentSandboxPage() {
  return (
    <main className="marketing-glow relative max-w-full overflow-x-clip bg-background">
      <MarketingHeader />
      <AgentSandboxHeroSection />
      <AgentSandboxWorkloadsSection />
      <AgentSandboxValuePropsSection />
      <AgentSandboxCapabilitiesSection />
      <AgentSandboxPricingSection />
      <AgentSandboxQuickStartSection />
      <AgentSandboxCtaSection />
      <MarketingFooter />
    </main>
  )
}
