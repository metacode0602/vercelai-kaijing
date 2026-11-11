import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent } from '@workspace/ui/components/card'
import { Construction } from 'lucide-react'

export function ComingSoon({
  title,
  description,
}: {
  title: string
  description: string
}) {
  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{title}</h1>
        <p className="text-muted-foreground mt-1 text-sm">{description}</p>
      </div>

      <Card className="border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 px-6 py-16 text-center">
          <div className="bg-muted flex size-12 items-center justify-center rounded-full">
            <Construction className="text-muted-foreground size-6" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-center gap-2">
              <p className="font-medium">功能建设中</p>
              <Badge variant="secondary">即将上线</Badge>
            </div>
            <p className="text-muted-foreground max-w-sm text-sm">
              该模块已接入运营后台导航，具体功能将在后续版本开放。
            </p>
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
