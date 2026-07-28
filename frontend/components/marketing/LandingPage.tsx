import { MarketingNav } from "@/components/marketing/MarketingNav";
import { Hero } from "@/components/marketing/Hero";
import { TrustStrip } from "@/components/marketing/TrustStrip";
import { ProblemSolution } from "@/components/marketing/ProblemSolution";
import { RoleShowcase } from "@/components/marketing/RoleShowcase";
import { FeatureGrid } from "@/components/marketing/FeatureGrid";
import { HowItWorks } from "@/components/marketing/HowItWorks";
import { CtaBand } from "@/components/marketing/CtaBand";
import { MarketingFooter } from "@/components/marketing/MarketingFooter";

export function LandingPage() {
  return (
    <div className="flex min-h-full flex-1 flex-col">
      <MarketingNav />
      <main className="flex-1">
        <Hero />
        <TrustStrip />
        <ProblemSolution />
        <RoleShowcase />
        <FeatureGrid />
        <HowItWorks />
        <CtaBand />
      </main>
      <MarketingFooter />
    </div>
  );
}
