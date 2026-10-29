import type { ReactNode } from 'react'
import { ChevronRight } from 'lucide-react'
import { LocaleLink } from '@/lib/i18n/navigation'
import { Badge } from '@workspace/ui/components/badge'
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@workspace/ui/components/table'
import { DetailSection } from './detail-section'
import type { DetailField } from './detail-field-grid'

/**
 * Parent relation → rendered as a navigable field inside 主数据.
 * Prefer this over dumping parent links into a flat related blob.
 */
export type DetailRelatedParent = {
  label: string
  value: ReactNode
  href?: string
  mono?: boolean
}

export type DetailRelatedColumn = {
  key: string
  label: string
  mono?: boolean
  numeric?: boolean
  /** Row field that holds an href for this cell (e.g. 'href'). */
  hrefKey?: string
}

/**
 * Child / sibling / listing relation → proper sectioned table.
 */
export type DetailRelatedSection = {
  title: string
  description?: string
  columns: DetailRelatedColumn[]
  rows: Array<Record<string, unknown>>
  emptyText?: string
  action?: ReactNode
}

export type DetailRelatedInfo = {
  parents?: DetailRelatedParent[]
  sections?: DetailRelatedSection[]
}

/** @deprecated Flat dump groups — prefer DetailRelatedInfo. Kept for legacy call sites. */
export type DetailRelatedItem = {
  label: string
  value?: ReactNode
  href?: string
}

/** @deprecated Flat dump groups — prefer DetailRelatedInfo. */
export type DetailRelatedGroup = {
  title: string
  description?: string
  items: DetailRelatedItem[]
}

export function parentsToFields(parents: DetailRelatedParent[] | undefined): DetailField[] {
  if (!parents?.length) return []
  return parents.map((parent) => ({
    label: parent.label,
    mono: parent.mono,
    value: parent.href ? (
      <LocaleLink
        href={parent.href}
        className="inline-flex items-center gap-1 text-primary underline-offset-2 hover:underline"
      >
        <span className={parent.mono ? 'font-mono text-sm' : undefined}>{parent.value}</span>
        <ChevronRight className="size-3.5 shrink-0 opacity-70" />
      </LocaleLink>
    ) : (
      parent.value
    ),
  }))
}

function formatCell(value: unknown): ReactNode {
  if (value == null || value === '') return '—'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (typeof value === 'string' || typeof value === 'number') return String(value)
  return String(value)
}

export function DetailRelatedTables({ sections }: { sections: DetailRelatedSection[] }) {
  if (!sections.length) return null

  return (
    <>
      {sections.map((section) => (
        <DetailSection
          key={section.title}
          title={section.title}
          description={section.description}
          action={section.action}
        >
          {section.rows.length === 0 ? (
            <p className="py-4 text-center text-sm text-muted-foreground">
              {section.emptyText ?? '暂无关联记录'}
            </p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  {section.columns.map((column) => (
                    <TableHead key={column.key}>{column.label}</TableHead>
                  ))}
                </TableRow>
              </TableHeader>
              <TableBody>
                {section.rows.map((row, index) => {
                  const rowHref = typeof row.href === 'string' ? row.href : undefined
                  return (
                    <TableRow key={`${section.title}-${index}`}>
                      {section.columns.map((column) => {
                        const raw = row[column.key]
                        const cellHref =
                          (column.hrefKey && typeof row[column.hrefKey] === 'string'
                            ? (row[column.hrefKey] as string)
                            : undefined) ?? (column.key === 'id' || column.key === 'sku' ? rowHref : undefined)
                        const content = formatCell(raw)
                        return (
                          <TableCell
                            key={column.key}
                            className={
                              column.mono
                                ? 'font-mono text-xs'
                                : column.numeric
                                  ? 'tabular-nums'
                                  : undefined
                            }
                          >
                            {cellHref ? (
                              <LocaleLink
                                href={cellHref}
                                className="underline-offset-2 hover:underline"
                              >
                                {content}
                              </LocaleLink>
                            ) : (
                              content
                            )}
                          </TableCell>
                        )
                      })}
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </DetailSection>
      ))}
    </>
  )
}

/**
 * Legacy flat dump UI — retained only for call sites that still pass DetailRelatedGroup[].
 * New pages should use DetailRelatedTables + parents in 主数据.
 */
export function DetailRelatedList({ groups }: { groups: DetailRelatedGroup[] }) {
  const rows = groups.flatMap((group) =>
    group.items.map((item, index) => ({
      key: `${group.title}-${item.label}-${index}`,
      group,
      item,
    })),
  )

  if (rows.length === 0) return null

  return (
    <div className="divide-y rounded-md border">
      {rows.map(({ key, group, item }) => {
        const content = (
          <>
            <div className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-baseline sm:gap-3">
              <span className="w-32 shrink-0 text-xs uppercase tracking-wide text-muted-foreground">
                {group.title}
              </span>
              <span className="min-w-0 break-words text-sm font-medium">{item.label}</span>
              {item.value ? (
                <span className="text-sm text-muted-foreground">{item.value}</span>
              ) : null}
              {group.description ? (
                <span className="min-w-0 break-words text-xs text-muted-foreground">
                  {group.description}
                </span>
              ) : null}
            </div>
            {item.href ? (
              <ChevronRight className="size-4 shrink-0 text-muted-foreground" />
            ) : (
              <Badge variant="outline">只读</Badge>
            )}
          </>
        )

        return item.href ? (
          <LocaleLink
            key={key}
            href={item.href}
            className="flex items-center gap-3 px-3 py-2.5 transition-colors hover:bg-muted/50"
          >
            {content}
          </LocaleLink>
        ) : (
          <div key={key} className="flex items-center gap-3 px-3 py-2.5">
            {content}
          </div>
        )
      })}
    </div>
  )
}

/** Convert legacy flat groups into table sections (one row per item). */
export function legacyGroupsToSections(groups: DetailRelatedGroup[]): DetailRelatedSection[] {
  return groups
    .filter((group) => group.items.length > 0)
    .map((group) => ({
      title: group.title,
      description: group.description,
      columns: [
        { key: 'label', label: '关联对象' },
        { key: 'value', label: '说明' },
      ],
      rows: group.items.map((item) => ({
        label: item.label,
        value: item.value ?? group.description ?? '—',
        href: item.href,
      })),
    }))
}
