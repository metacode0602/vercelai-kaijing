'use client'

import { useRef, useState } from 'react'
import { FileText, ImageIcon, Upload, X, Loader2 } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { Label } from '@workspace/ui/components/label'
import { toast } from '@workspace/ui/hooks/use-toast'

export const INVOICE_ATTACHMENT_MAX_BYTES = 20 * 1024 * 1024 // 20MB

const ACCEPTED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/jpg',
  'image/png',
  'image/gif',
  'image/webp',
])

const ACCEPT_ATTR = 'application/pdf,image/*,.pdf'

export type InvoiceAttachment = {
  fileUrl: string
  storageKey: string
  mimeType: string
  size: number
  originalName: string
}

function isAcceptedInvoiceFile(file: File): boolean {
  if (ACCEPTED_MIME_TYPES.has(file.type)) return true
  const lower = file.name.toLowerCase()
  return (
    lower.endsWith('.pdf') ||
    lower.endsWith('.jpg') ||
    lower.endsWith('.jpeg') ||
    lower.endsWith('.png') ||
    lower.endsWith('.gif') ||
    lower.endsWith('.webp')
  )
}

export function formatInvoiceFileSize(size: number) {
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`
  return `${(size / 1024 / 1024).toFixed(2)} MB`
}

function isImageMimeType(mimeType: string) {
  return mimeType.startsWith('image/')
}

function InvoiceFileIcon({ mimeType }: { mimeType: string }) {
  if (isImageMimeType(mimeType)) {
    return <ImageIcon className="size-4 shrink-0 text-muted-foreground" />
  }
  return <FileText className="size-4 shrink-0 text-muted-foreground" />
}

export type InvoiceFileUploadProps = {
  attachment: InvoiceAttachment | null
  onAttachmentChange: (attachment: InvoiceAttachment | null) => void
  required?: boolean
}

export function InvoiceFileUpload({
  attachment,
  onAttachmentChange,
  required = false,
}: InvoiceFileUploadProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  const handleFileSelect = async (files: FileList | null) => {
    if (!files?.length) return

    const file = files[0]
    if (!file) return

    if (!isAcceptedInvoiceFile(file)) {
      toast({
        title: '文件格式不支持',
        description: `「${file.name}」格式不支持，仅支持 PDF 和图片（JPG、PNG、WEBP、GIF）`,
        variant: 'destructive',
      })
      return
    }

    if (file.size > INVOICE_ATTACHMENT_MAX_BYTES) {
      toast({
        title: '文件过大',
        description: `「${file.name}」超过 20MB 限制`,
        variant: 'destructive',
      })
      return
    }

    setUploading(true)

    try {
      const formData = new FormData()
      formData.append('file', file)

      const response = await fetch('/api/v1/upload-invoice', {
        method: 'POST',
        body: formData,
      })

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}))
        throw new Error(errorData.error || '上传失败')
      }

      const result = await response.json()

      onAttachmentChange({
        fileUrl: result.fileUrl,
        storageKey: result.storageKey,
        mimeType: result.mimeType,
        size: result.size,
        originalName: result.originalName || file.name,
      })

      toast({
        title: '上传成功',
        description: `「${file.name}」已上传`,
      })
    } catch (error) {
      const message = error instanceof Error ? error.message : '上传失败'
      toast({
        title: '上传失败',
        description: message,
        variant: 'destructive',
      })
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="grid gap-2">
      <Label>
        发票附件 {required ? <span className="text-destructive">*</span> : null}
        <span className="ml-2 text-xs text-muted-foreground font-normal">
          PDF / 图片（最大 20MB）
        </span>
      </Label>

      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_ATTR}
        className="hidden"
        onChange={(event) => {
          handleFileSelect(event.target.files)
          event.target.value = ''
        }}
        disabled={uploading}
      />

      {attachment ? (
        <div className="flex items-center gap-3 rounded-lg border border-border bg-muted/30 p-2.5">
          <InvoiceFileIcon mimeType={attachment.mimeType} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm">{attachment.originalName}</p>
            <p className="text-xs text-muted-foreground">
              {formatInvoiceFileSize(attachment.size)}
            </p>
          </div>
          <Button
            type="button"
            variant="ghost"
            size="icon"
            className="size-7 shrink-0"
            onClick={() => onAttachmentChange(null)}
            disabled={uploading}
          >
            <X className="size-3.5" />
          </Button>
        </div>
      ) : (
        <div className="rounded-md border border-dashed border-border p-3">
          <p className="text-xs text-muted-foreground text-center mb-2">
            请上传发票 PDF 或发票照片
          </p>
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="gap-2 w-full"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
          >
            {uploading ? (
              <>
                <Loader2 className="size-3.5 animate-spin" />
                上传中...
              </>
            ) : (
              <>
                <Upload className="size-3.5" />
                选择文件
              </>
            )}
          </Button>
        </div>
      )}
    </div>
  )
}
