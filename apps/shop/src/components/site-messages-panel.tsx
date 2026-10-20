'use client'

import { useTranslations } from 'next-intl'
import { useState } from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
} from '@workspace/ui/components/sheet'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { ScrollArea } from '@workspace/ui/components/scroll-area'
import { BellIcon } from 'lucide-react'

type SiteMessage = {
  id: string
  title: string
  summary: string
  content: string
  category: string | null
  read: boolean
  readAt: Date | null
  createdAt: Date
}

export function SiteMessagesPanel() {
  const t = useTranslations('SiteMessages')
  const [open, setOpen] = useState(false)
  const [selectedMessage, setSelectedMessage] = useState<SiteMessage | null>(null)

  return (
    <>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetTrigger asChild>
          <Button
            variant="ghost"
            size="icon"
            className="size-9 text-muted-foreground"
            aria-label={t('title')}
          >
            <BellIcon className="size-[18px]" />
          </Button>
        </SheetTrigger>
        <SheetContent className="w-[400px] sm:w-[540px]">
          <SheetHeader>
            <SheetTitle>{t('title')}</SheetTitle>
          </SheetHeader>
          <ScrollArea className="mt-4 h-[calc(100vh-8rem)]">
            <div className="flex flex-col gap-2 p-4">
              <p className="text-muted-foreground text-center text-sm">
                {t('noMessages')}
              </p>
            </div>
          </ScrollArea>
        </SheetContent>
      </Sheet>

      <Dialog open={!!selectedMessage} onOpenChange={() => setSelectedMessage(null)}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{selectedMessage?.title}</DialogTitle>
          </DialogHeader>
          {selectedMessage && (
            <div className="text-sm leading-relaxed text-muted-foreground">
              {selectedMessage.content}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </>
  )
}
