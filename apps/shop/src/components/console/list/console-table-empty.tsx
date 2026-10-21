import { Empty, EmptyDescription, EmptyHeader, EmptyTitle } from '@workspace/ui/components/empty'

export function ConsoleTableEmpty({
  title = '无匹配结果',
  description = '调整筛选条件后再试',
}: {
  title?: string
  description?: string
}) {
  return (
    <Empty className="border-0 py-12">
      <EmptyHeader>
        <EmptyTitle>{title}</EmptyTitle>
        <EmptyDescription>{description}</EmptyDescription>
      </EmptyHeader>
    </Empty>
  )
}
