import { SectionLabel } from "../../_components/section-label"
import { MapPin, Globe } from "lucide-react"

export function ServerlessGlobalSection() {
  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>全球部署</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">全球部署</h2>
          <p className="marketing-subheading">
            通过我们的全球网络在离用户更近的地方部署 GPU 实例。确保最小延迟和快速访问，无论您的用户或团队在哪里
          </p>
        </div>

        <div className="mt-12 glass-panel p-12">
          <div className="flex flex-col items-center gap-12">
            <div className="grid grid-cols-1 gap-12 md:grid-cols-2">
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
                  <MapPin className="size-10 text-primary" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-5xl font-bold text-foreground">20+</span>
                  <span className="text-lg text-muted-foreground">全球位置</span>
                </div>
              </div>
              <div className="flex flex-col items-center gap-4 text-center">
                <div className="flex size-20 items-center justify-center rounded-full bg-primary/10">
                  <Globe className="size-10 text-primary" />
                </div>
                <div className="flex flex-col gap-2">
                  <span className="text-5xl font-bold text-foreground">4+</span>
                  <span className="text-lg text-muted-foreground">大洲覆盖</span>
                </div>
              </div>
            </div>

            <div className="grid w-full grid-cols-2 gap-4 text-center text-sm text-muted-foreground md:grid-cols-4">
              <div className="rounded-lg bg-muted/30 p-3">北美</div>
              <div className="rounded-lg bg-muted/30 p-3">欧洲</div>
              <div className="rounded-lg bg-muted/30 p-3">亚太</div>
              <div className="rounded-lg bg-muted/30 p-3">中国大陆</div>
            </div>
          </div>
        </div>
      </div>
    </section>
  )
}
