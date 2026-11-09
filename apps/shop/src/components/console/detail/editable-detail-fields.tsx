'use client'

import * as React from 'react'
import { Pencil } from 'lucide-react'
import { Button } from '@workspace/ui/components/button'
import { DetailFieldGrid } from './detail-field-grid'
import { UedDialog, type UedDialogField } from '../erp-ued-workspace'

export type EditableDetailField = {
  key: string
  label: string
  value: string
  mono?: boolean
  type?: string
  options?: string[]
  readOnly?: boolean
  required?: boolean
  fullWidth?: boolean
}

export function EditableDetailFields({
  title,
  description,
  fields,
  columns = 3,
  dialogTitle,
}: {
  title?: string
  description?: string
  fields: EditableDetailField[]
  columns?: 2 | 3 | 4
  dialogTitle?: string
}) {
  const [current, setCurrent] = React.useState(fields)
  const [editing, setEditing] = React.useState(false)
  const [saved, setSaved] = React.useState(false)

  const dialogFields: UedDialogField[] = current.map((field) => ({
    key: field.key,
    label: field.label,
    defaultValue: field.value,
    type: field.type,
    options: field.options,
    readOnly: field.readOnly,
    required: field.required,
    fullWidth: field.fullWidth,
  }))

  return (
    <>
      <DetailFieldGrid
        title={title}
        columns={columns}
        action={
          <Button size="sm" variant="outline" onClick={() => setEditing(true)}>
            <Pencil data-icon="inline-start" />
            编辑
          </Button>
        }
        fields={current.map((field) => ({
          label: field.label,
          value: field.value || '—',
          mono: field.mono,
        }))}
      />
      {description ? <p className="text-xs text-muted-foreground">{description}</p> : null}
      {saved ? (
        <p role="status" className="text-sm text-muted-foreground">
          详情已更新（未写入数据库）。
        </p>
      ) : null}
      {editing ? (
        <UedDialog
          title={dialogTitle ?? `编辑 · ${title ?? '详情'}`}
          description="修改详情主体字段；保存仅作用于当前页面会话，不会写入数据库。"
          fields={dialogFields}
          initialValues={Object.fromEntries(current.map((field) => [field.key, field.value]))}
          onClose={() => setEditing(false)}
          onSave={(values) => {
            setCurrent((rows) =>
              rows.map((field) => ({ ...field, value: values[field.key] ?? field.value })),
            )
            setEditing(false)
            setSaved(true)
          }}
          saveLabel="保存修改"
        />
      ) : null}
    </>
  )
}
