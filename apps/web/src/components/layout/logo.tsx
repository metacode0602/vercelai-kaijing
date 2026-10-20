'use client'

import GPURunFullIcon from '@workspace/ui/components/icons/gpurun-full'
import { cn } from '@workspace/ui/lib/utils'

export function Logo({ className }: { className?: string }) {
  return <GPURunFullIcon className={cn('size-8', className)} />
}
