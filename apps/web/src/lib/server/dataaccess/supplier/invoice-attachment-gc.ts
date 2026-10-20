import { readdir, stat, unlink } from 'node:fs/promises'
import type { Dirent } from 'node:fs'
import { join } from 'node:path'

import { eq, inArray } from 'drizzle-orm'
import { invoice } from '@workspace/db/schema'

import { db } from '@/lib/db'
import { crmError, crmLog } from '@/lib/server/dataaccess/crm/logger'

/**
 * 发票附件孤儿文件清理。
 *
 * 背景：`/api/v1/upload-invoice` 允许运营先上传再开票。若上传后放弃弹窗、
 * 或开票失败（金额不一致、并发冲突），磁盘上就留下一份**永远不会被
 * `invoice.pdf_storage_key` 引用**的财务文件，随时间无限堆积。
 *
 * 保守设计（宁可漏删，不可误删）：
 * 1. 只处理严格匹配上传命名格式 `<epochMs>-<16位hex>.<ext>` 的文件，
 *    目录里任何其他名字的文件一律跳过 —— 绝不误删非本模块写入的文件。
 * 2. 只删除**超过保留期**（默认 24h）的文件，避免把「刚上传、正在走
 *    开票流程」的文件扫掉。
 * 3. 删除前再次按 `pdf_storage_key` 确认未被任何发票引用。
 * 4. 单个文件失败不影响其余文件。
 */

/** 上传路由写入的命名：`<Date.now()>-<sha256前16位hex>.<ext>` */
const UPLOAD_FILE_RE = /^\d{13}-[0-9a-f]{16}\.(pdf|jpg|jpeg|png|webp|gif)$/

const RETENTION_MS = Number(process.env.INVOICE_ATTACHMENT_RETENTION_HOURS ?? '24') * 3600_000

export type InvoiceAttachmentGcResult = {
  ok: boolean
  scanned: number
  removed: string[]
  skippedTooYoung: number
  referenced: number
  errors: string[]
}

/**
 * 清理发票附件孤儿文件。**永不 reject**，异常一律收集进 `errors`。
 */
export async function sweepOrphanedInvoiceAttachments(
  trigger: 'scheduled' | 'manual' = 'scheduled',
): Promise<InvoiceAttachmentGcResult> {
  const result: InvoiceAttachmentGcResult = {
    ok: true,
    scanned: 0,
    removed: [],
    skippedTooYoung: 0,
    referenced: 0,
    errors: [],
  }

  const uploadDir = process.env.INVOICE_UPLOAD_DIR || '/tmp/invoice-attachments'

  let months: Dirent[]
  try {
    months = await readdir(uploadDir, { withFileTypes: true })
  } catch (err) {
    const code = (err as NodeJS.ErrnoException)?.code
    // 目录还不存在说明从未上传过，属正常情况，不算失败
    if (code === 'ENOENT') {
      crmLog('invoice-attachment-gc', 'no upload dir', { trigger, uploadDir })
      return result
    }
    const message = err instanceof Error ? err.message : String(err)
    result.ok = false
    result.errors.push(`readdir: ${message}`)
    crmError('invoice-attachment-gc', 'readdir failed', err as Error, { trigger, uploadDir })
    return result
  }

  // 只处理 <yearMonth>/<file> 两层结构
  const candidates: { month: string; name: string; path: string }[] = []
  for (const monthEntry of months) {
    if (!monthEntry.isDirectory() || !/^\d{4}-\d{2}$/.test(monthEntry.name)) continue
    let files: string[]
    try {
      files = await readdir(join(uploadDir, monthEntry.name))
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`readdir ${monthEntry.name}: ${message}`)
      continue
    }
    for (const name of files) {
      if (!UPLOAD_FILE_RE.test(name)) continue // 非本模块命名，跳过
      candidates.push({
        month: monthEntry.name,
        name,
        path: join(uploadDir, monthEntry.name, name),
      })
    }
  }

  result.scanned = candidates.length
  if (candidates.length === 0) return result

  const now = Date.now()
  const oldEnough: typeof candidates = []
  for (const c of candidates) {
    try {
      const s = await stat(c.path)
      if (now - s.mtimeMs < RETENTION_MS) {
        result.skippedTooYoung += 1
        continue
      }
      oldEnough.push(c)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`stat ${c.name}: ${message}`)
    }
  }
  if (oldEnough.length === 0) return result

  // 一次性查出仍被引用的 storage key，避免逐条查询
  const storageKeys = oldEnough.map((c) => `${c.month}/${c.name}`)
  const referenced = new Set<string>()
  try {
    const rows = await db
      .select({ key: invoice.pdfStorageKey })
      .from(invoice)
      .where(inArray(invoice.pdfStorageKey, storageKeys))
    for (const row of rows) {
      if (row.key) referenced.add(row.key)
    }
  } catch (err) {
    // 查不到引用关系时**不做任何删除** —— 无法证明是孤儿，宁可留
    const message = err instanceof Error ? err.message : String(err)
    result.ok = false
    result.errors.push(`select referenced: ${message}`)
    crmError('invoice-attachment-gc', 'reference lookup failed', err as Error, {
      trigger,
      candidates: storageKeys.length,
    })
    return result
  }

  for (const c of oldEnough) {
    const key = `${c.month}/${c.name}`
    if (referenced.has(key)) {
      result.referenced += 1
      continue
    }
    try {
      await unlink(c.path)
      result.removed.push(key)
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      result.errors.push(`unlink ${key}: ${message}`)
    }
  }

  if (result.removed.length > 0 || result.errors.length > 0) {
    crmLog('invoice-attachment-gc', 'swept', {
      trigger,
      scanned: result.scanned,
      removed: result.removed.length,
      referenced: result.referenced,
      skippedTooYoung: result.skippedTooYoung,
      errors: result.errors.length,
    })
  }
  if (result.errors.length > 0) result.ok = false

  return result
}

/** 供单条发票查询使用：确认某 storage key 仍被引用（下载前防御性校验） */
export async function isInvoiceAttachmentReferenced(storageKey: string): Promise<boolean> {
  const rows = await db
    .select({ id: invoice.id })
    .from(invoice)
    .where(eq(invoice.pdfStorageKey, storageKey))
    .limit(1)
  return rows.length > 0
}
