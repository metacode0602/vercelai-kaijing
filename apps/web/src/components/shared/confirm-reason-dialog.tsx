'use client'

import * as React from 'react'
import { Button } from '@workspace/ui/components/button'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@workspace/ui/components/dialog'
import { Label } from '@workspace/ui/components/label'
import { Textarea } from '@workspace/ui/components/textarea'

export function ConfirmReasonDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = '确认',
  confirmVariant = 'default',
  reasonLabel = '原因',
  placeholder = '请填写原因',
  required = true,
  minLength = 1,
  pending = false,
  defaultReason = '',
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  description: string
  confirmLabel?: string
  confirmVariant?: 'default' | 'destructive' | 'outline' | 'secondary'
  reasonLabel?: string
  placeholder?: string
  required?: boolean
  minLength?: number
  pending?: boolean
  defaultReason?: string
  onConfirm: (reason: string) => void
}) {
  const [reason, setReason] = React.useState(defaultReason)
  const [error, setError] = React.useState('')

  React.useEffect(() => {
    if (open) {
      setReason(defaultReason)
      setError('')
    }
  }, [open, defaultReason])

  const submit = () => {
    const value = reason.trim()
    if (required && value.length < minLength) {
      setError(minLength > 1 ? `请至少填写 ${minLength} 个字符。` : '请填写原因。')
      return
    }
    onConfirm(value)
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="min-w-[35vw] max-w-4xl sm:max-w-4xl" showCloseButton>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <div className="space-y-2">
          <Label htmlFor="confirm-reason-field">{reasonLabel}</Label>
          <Textarea
            id="confirm-reason-field"
            value={reason}
            onChange={(event) => {
              setReason(event.target.value)
              if (error) setError('')
            }}
            placeholder={placeholder}
          />
          {error ? <p className="text-sm text-destructive">{error}</p> : null}
        </div>
        <DialogFooter>
          <Button variant="outline" disabled={pending} onClick={() => onOpenChange(false)}>
            取消
          </Button>
          <Button variant={confirmVariant} disabled={pending} onClick={submit}>
            {pending ? '处理中…' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
