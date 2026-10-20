'use client'

import { useState, useRef } from 'react'
import { useTranslations } from 'next-intl'
import { Button } from '@workspace/ui/components/button'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { RadioGroup, RadioGroupItem } from '@workspace/ui/components/radio-group'
import {
  Field,
  FieldGroup,
  FieldLabel,
} from '@workspace/ui/components/field'
import { Loader2Icon, CheckCircle2Icon, FileIcon, UploadIcon, XIcon } from 'lucide-react'
import { useId } from 'react'
import { trpc } from '@/trpc/client'

interface Props {
  onSubmitted?: () => void
  upgrade?: boolean
}

type AttachmentDraft = {
  kind: 'business_license' | 'id_front' | 'id_back' | 'auth_letter'
  fileName: string
  contentType: string
  sizeBytes: number
  storageKey: string
}

const ACCEPT = 'image/jpeg,image/png,application/pdf'
const MAX_SIZE_BYTES = 10 * 1024 * 1024

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`
}

function FileUploadField({
  label,
  uploadHint,
  kind,
  disabled,
  attachment,
  onUpload,
  onRemove,
  error,
}: {
  label: string
  uploadHint: string
  kind: AttachmentDraft['kind']
  disabled: boolean
  attachment?: AttachmentDraft
  onUpload: (kind: AttachmentDraft['kind'], file: File | null) => void
  onRemove: (kind: AttachmentDraft['kind']) => void
  error?: string
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const inputId = `file-${kind}`

  return (
    <Field>
      <FieldLabel>{label}</FieldLabel>
      {attachment ? (
        <div className="flex items-center gap-2 rounded-lg border border-border bg-muted/30 p-3">
          <FileIcon className="size-4 shrink-0 text-muted-foreground" />
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm text-foreground">{attachment.fileName}</p>
            <p className="text-xs text-muted-foreground">{formatFileSize(attachment.sizeBytes)}</p>
          </div>
          <CheckCircle2Icon className="size-4 shrink-0 text-green-600" />
          {!disabled && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 shrink-0 p-0 text-muted-foreground hover:text-destructive"
              onClick={() => onRemove(kind)}
            >
              <XIcon className="size-4" />
            </Button>
          )}
        </div>
      ) : (
        <>
          <Input
            ref={inputRef}
            id={inputId}
            type="file"
            accept={ACCEPT}
            disabled={disabled}
            className="hidden"
            onChange={(e) => {
              const file = e.target.files?.[0] ?? null
              if (file && file.size > MAX_SIZE_BYTES) {
                return
              }
              onUpload(kind, file)
              if (inputRef.current) inputRef.current.value = ''
            }}
          />
          <button
            type="button"
            disabled={disabled}
            onClick={() => inputRef.current?.click()}
            className="flex w-full items-center gap-3 rounded-lg border border-dashed border-border p-4 text-left transition-colors hover:border-primary/50 hover:bg-muted/30 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <div className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-muted">
              <UploadIcon className="size-4 text-muted-foreground" />
            </div>
            <div>
              <p className="text-sm text-foreground">{label}</p>
              <p className="text-xs text-muted-foreground">{uploadHint}</p>
            </div>
          </button>
        </>
      )}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </Field>
  )
}

export function EnterpriseVerifyForm({ onSubmitted, upgrade }: Props) {
  const t = useTranslations('Verify')
  const formId = useId()
  const [companyName, setCompanyName] = useState('')
  const [uscc, setUscc] = useState('')
  const [legalPersonName, setLegalPersonName] = useState('')
  const [applicantRole, setApplicantRole] = useState<'legal_person' | 'authorized'>(
    'legal_person',
  )
  const [authorizedPersonName, setAuthorizedPersonName] = useState('')
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([])
  const [error, setError] = useState('')
  const [success, setSuccess] = useState(false)
  const [uploading, setUploading] = useState(false)

  const createUploadUrl = trpc.identity.createUploadUrl.useMutation()
  const submit = trpc.identity.submitEnterprise.useMutation({
    onSuccess: () => {
      setSuccess(true)
      onSubmitted?.()
    },
    onError: (e) => setError(e.message),
  })

  const isPending = submit.isPending || uploading

  async function uploadFile(
    kind: AttachmentDraft['kind'],
    file: File | null,
  ) {
    if (!file) return
    setError('')
    setUploading(true)
    try {
      const signed = await createUploadUrl.mutateAsync({
        kind,
        fileName: file.name,
        contentType: file.type || 'application/octet-stream',
        sizeBytes: file.size,
      })
      const put = await fetch(signed.uploadUrl, {
        method: 'PUT',
        headers: { 'Content-Type': file.type || 'application/octet-stream' },
        body: file,
      })
      if (!put.ok) {
        throw new Error(`Upload failed (${put.status})`)
      }
      setAttachments((prev) => [
        ...prev.filter((a) => a.kind !== kind),
        {
          kind,
          fileName: file.name,
          contentType: file.type || 'application/octet-stream',
          sizeBytes: file.size,
          storageKey: signed.storageKey,
        },
      ])
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Upload failed')
    } finally {
      setUploading(false)
    }
  }

  function removeAttachment(kind: AttachmentDraft['kind']) {
    setAttachments((prev) => prev.filter((a) => a.kind !== kind))
  }

  if (success) {
    return (
      <div className="flex flex-col items-center gap-4 py-8 text-center">
        <div className="flex size-12 items-center justify-center rounded-full bg-primary/10">
          <CheckCircle2Icon className="size-6 text-primary" />
        </div>
        <div>
          <p className="text-sm font-medium text-foreground">{t('submittedTitle')}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t('submittedDesc')}</p>
        </div>
      </div>
    )
  }

  const idFrontAttachment = attachments.find((a) => a.kind === 'id_front')
  const idBackAttachment = attachments.find((a) => a.kind === 'id_back')
  const idLabel =
    applicantRole === 'legal_person' ? t('idFront') : `${t('authorizedPerson')} ${t('idFront')}`
  const idBackLabel =
    applicantRole === 'legal_person' ? t('idBack') : `${t('authorizedPerson')} ${t('idBack')}`

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        setError('')
        submit.mutate({
          companyName,
          uscc,
          legalPersonName,
          applicantRole,
          authorizedPersonName:
            applicantRole === 'authorized' ? authorizedPersonName : undefined,
          attachments,
        })
      }}
      className="space-y-5"
    >
      {upgrade && (
        <div className="rounded-lg border border-primary/20 bg-primary/5 p-3">
          <p className="text-sm text-primary">{t('upgradeHint')}</p>
        </div>
      )}

      <FieldGroup className="gap-4">
        <Field>
          <FieldLabel htmlFor={`${formId}-company`}>{t('companyName')}</FieldLabel>
          <Input
            id={`${formId}-company`}
            value={companyName}
            onChange={(e) => setCompanyName(e.target.value)}
            disabled={isPending}
            placeholder={t('companyNamePlaceholder')}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-uscc`}>{t('uscc')}</FieldLabel>
          <Input
            id={`${formId}-uscc`}
            value={uscc}
            onChange={(e) => setUscc(e.target.value)}
            disabled={isPending}
            placeholder={t('usccPlaceholder')}
            required
          />
        </Field>
        <Field>
          <FieldLabel htmlFor={`${formId}-legal`}>{t('legalPersonName')}</FieldLabel>
          <Input
            id={`${formId}-legal`}
            value={legalPersonName}
            onChange={(e) => setLegalPersonName(e.target.value)}
            disabled={isPending}
            placeholder={t('legalPersonNamePlaceholder')}
            required
          />
        </Field>
        <Field>
          <FieldLabel>{t('applicantRole')}</FieldLabel>
          <RadioGroup
            value={applicantRole}
            onValueChange={(v) => {
              if (v === 'legal_person' || v === 'authorized') {
                setApplicantRole(v)
              }
            }}
            disabled={isPending}
            className="flex gap-4"
          >
            <Label
              htmlFor={`${formId}-role-legal`}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem value="legal_person" id={`${formId}-role-legal`} />
              <span className="text-sm">{t('legalPerson')}</span>
            </Label>
            <Label
              htmlFor={`${formId}-role-auth`}
              className="flex cursor-pointer items-center gap-2 rounded-lg border border-border px-4 py-3 transition-colors hover:bg-muted/50 has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5"
            >
              <RadioGroupItem value="authorized" id={`${formId}-role-auth`} />
              <span className="text-sm">{t('authorizedPerson')}</span>
            </Label>
          </RadioGroup>
        </Field>
        {applicantRole === 'authorized' && (
          <Field>
            <FieldLabel htmlFor={`${formId}-auth-name`}>{t('authorizedPersonName')}</FieldLabel>
            <Input
              id={`${formId}-auth-name`}
              value={authorizedPersonName}
              onChange={(e) => setAuthorizedPersonName(e.target.value)}
              disabled={isPending}
              placeholder={t('authorizedPersonNamePlaceholder')}
              required
            />
          </Field>
        )}
      </FieldGroup>

      <div className="space-y-4">
        <p className="text-sm font-medium text-foreground">附件材料</p>
        <FileUploadField
          label={t('businessLicense')}
          uploadHint={t('uploadHint')}
          kind="business_license"
          disabled={isPending}
          attachment={attachments.find((a) => a.kind === 'business_license')}
          onUpload={uploadFile}
          onRemove={removeAttachment}
        />
        <FileUploadField
          label={idLabel}
          uploadHint={t('uploadHint')}
          kind="id_front"
          disabled={isPending}
          attachment={idFrontAttachment}
          onUpload={uploadFile}
          onRemove={removeAttachment}
        />
        <FileUploadField
          label={idBackLabel}
          uploadHint={t('uploadHint')}
          kind="id_back"
          disabled={isPending}
          attachment={idBackAttachment}
          onUpload={uploadFile}
          onRemove={removeAttachment}
        />
        {applicantRole === 'authorized' && (
          <FileUploadField
            label={t('authLetter')}
            uploadHint={t('uploadHint')}
            kind="auth_letter"
            disabled={isPending}
            attachment={attachments.find((a) => a.kind === 'auth_letter')}
            onUpload={uploadFile}
            onRemove={removeAttachment}
          />
        )}
      </div>

      {error && (
        <p className="text-sm text-destructive">{error}</p>
      )}

      <Button
        type="submit"
        disabled={isPending}
        className="w-full cursor-pointer"
      >
        {isPending && <Loader2Icon className="mr-2 size-4 animate-spin" />}
        {t('submit')}
      </Button>
    </form>
  )
}
