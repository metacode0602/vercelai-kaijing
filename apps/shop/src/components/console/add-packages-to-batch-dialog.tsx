'use client'

import * as React from 'react'
import { parseUedMultiValue, UedDialog } from '@/components/console/erp-ued-workspace'
import { trpc } from '@/lib/trpc/client'

export function batchAllowsAddingPackages(statusLabel: string) {
  return statusLabel !== '已关闭'
}

export function batchAllowsSubmit(statusLabel: string) {
  return statusLabel === '开放中' || statusLabel === '已驳回'
}

export function useEnabledWarehouseOptions() {
  const query = trpc.wms.listWarehouses.useQuery({ page: 1, pageSize: 100, status: '启用' })
  const items = query.data?.items ?? []
  const options = items.map((warehouse) => ({
    value: warehouse.code,
    title: `${warehouse.code} · ${warehouse.name}`,
  }))
  return {
    isLoading: query.isLoading,
    hasWarehouses: options.length > 0,
    options: options.length
      ? options
      : [{ value: '', title: '暂无启用仓库，请先在仓储中心维护' }],
  }
}

export function AddPackagesToBatchDialog(props: {
  open: boolean
  batchId: string
  batchNo: string
  existingShipmentIds: string[]
  preferredProviderType?: 'lgs' | 'jsb'
  onClose: () => void
  onAdded: (packageCount: number) => void
  onError: (message: string) => void
}) {
  const utils = trpc.useUtils()
  const listQuery = trpc.logistics.list.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: props.open },
  )
  const addMutation = trpc.logistics.addPackageToBatch.useMutation()

  const existing = new Set(props.existingShipmentIds)
  const available = (listQuery.data?.items ?? [])
    .filter((item) => !existing.has(item.id) && item.status !== 'cancelled')
    .sort((left, right) => {
      const preferred = props.preferredProviderType
      if (!preferred) return 0
      const rank = (providerType: string) => {
        if (providerType === preferred) return 0
        if (preferred === 'jsb' && providerType === 'jsb_th') return 0
        return 1
      }
      return rank(left.providerType) - rank(right.providerType)
    })
  const options = available.map((item) => ({
    value: item.id,
    title: `${item.externalPackageId} · ${item.order} · ${item.statusLabel} · ${item.providerLabel}`,
  }))

  if (!props.open) return null

  return (
    <UedDialog
      title={`加入包裹到 ${props.batchNo}`}
      description={
        listQuery.isLoading
          ? '正在加载可加入的包裹…'
          : options.length > 0
            ? '选择尚未加入本批次的包裹，可多选。已取消的包裹不会出现。提交交接前批次内必须有包裹。'
            : '暂无可以加入的包裹。请先到「包裹与物流」从订单创建包裹。'
      }
      fields={[
        {
          key: 'shipmentIds',
          label: '包裹',
          multiple: true,
          searchable: true,
          required: true,
          fullWidth: true,
          options,
          helper: options.length > 0 ? `可选 ${options.length} 个包裹` : '没有可加入的包裹',
        },
      ]}
      saveLabel={addMutation.isPending ? '加入中…' : '加入批次'}
      onClose={props.onClose}
      onSave={(values) => {
        const ids = parseUedMultiValue(values.shipmentIds).filter(Boolean)
        if (ids.length === 0) {
          props.onError('请选择至少一个包裹')
          return
        }
        void (async () => {
          try {
            let packageCount = props.existingShipmentIds.length
            for (const shipmentId of ids) {
              const row = await addMutation.mutateAsync({
                batchId: props.batchId,
                shipmentId,
              })
              packageCount = row.packageCount
            }
            await utils.logistics.listBatches.invalidate()
            await utils.logistics.getBatch.invalidate({ id: props.batchId })
            props.onAdded(packageCount)
            props.onClose()
          } catch (error) {
            props.onError(error instanceof Error ? error.message : '加入包裹失败')
          }
        })()
      }}
    />
  )
}
