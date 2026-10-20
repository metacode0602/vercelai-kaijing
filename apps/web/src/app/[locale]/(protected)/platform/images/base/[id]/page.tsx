'use client'

import { useParams } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, Loader2 } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { AppShell } from '@/components/dashboard/app-shell'
import { BaseImageVersionsContent } from '../../../_components/base-image-versions-content'
import { trpc } from '@/lib/trpc/client'

export default function BaseImageDetailPage() {
  const { id } = useParams<{ id: string }>()

  const { data: image, isLoading } = trpc.admin.baseImage.getById.useQuery({ id })

  if (isLoading) {
    return (
      <AppShell>
        <div className="flex items-center justify-center py-16 text-muted-foreground">
          <Loader2 className="size-5 animate-spin mr-2" />
          加载中…
        </div>
      </AppShell>
    )
  }

  if (!image) {
    return (
      <AppShell>
        <div className="space-y-4">
          <Button variant="ghost" size="sm" asChild>
            <Link href="/platform/images/base">
              <ArrowLeft className="size-4 mr-2" />
              返回基础镜像列表
            </Link>
          </Button>
          <p className="text-muted-foreground">镜像不存在</p>
        </div>
      </AppShell>
    )
  }

  return (
    <AppShell>
      <div className="space-y-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/platform/images/base">
            <ArrowLeft className="size-4 mr-2" />
            返回基础镜像列表
          </Link>
        </Button>
        <BaseImageVersionsContent baseImageId={id} baseImageName={image.displayName || image.name} />
      </div>
    </AppShell>
  )
}
