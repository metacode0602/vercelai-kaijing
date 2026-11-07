import type { UedDialogField } from '@/components/console/erp-ued-workspace'
import type { UiProductStatus } from '@/lib/server/mappers/products'

const COLOR_FALLBACK = ['黑色', '白色', '深灰色', '蓝色', '红色']
const SIZE_FALLBACK = ['M', 'L', 'XL', '2XL', '3XL', '标准']
const PACK_FALLBACK = ['单件']

export type CreateInternalSkuSpuField =
  | { mode: 'select'; options: string[]; required?: boolean }
  | { mode: 'fixed'; value: string }

/** 与 /console/master-skus「生成内部 SKU」弹窗字段集一致（含顺序、标签、控件与校验）。 */
export function buildCreateInternalSkuFields(opts: {
  colorOptions: string[]
  sizeOptions: string[]
  packOptions: string[]
  spu: CreateInternalSkuSpuField
}): UedDialogField[] {
  const colorOptions = opts.colorOptions.length ? opts.colorOptions : COLOR_FALLBACK
  const sizeOptions = opts.sizeOptions.length ? opts.sizeOptions : SIZE_FALLBACK
  const packOptions = opts.packOptions.length ? opts.packOptions : PACK_FALLBACK

  const spuField: UedDialogField =
    opts.spu.mode === 'select'
      ? {
          key: 'spu',
          label: '所属 SPU',
          options: opts.spu.options,
          required: opts.spu.required !== false,
        }
      : {
          key: 'spu',
          label: '所属 SPU',
          defaultValue: opts.spu.value,
          readOnly: true,
          required: true,
        }

  return [
    spuField,
    {
      key: 'color',
      label: '颜色',
      options: colorOptions,
      required: true,
    },
    {
      key: 'size',
      label: '尺码',
      options: sizeOptions,
      required: true,
    },
    {
      key: 'pack',
      label: '包装规格',
      options: packOptions,
      required: true,
    },
    { key: 'barcode', label: '条码（EAN/UPC）', placeholder: '选填，后续可补录' },
    { key: 'weight', label: '重量（g）', type: 'number', required: true },
    { key: 'lengthMm', label: '长（mm）', type: 'number', helper: '外箱/件尺寸，对齐 length_mm' },
    { key: 'widthMm', label: '宽（mm）', type: 'number' },
    { key: 'heightMm', label: '高（mm）', type: 'number' },
    { key: 'status', label: '状态', options: ['待确认', '启用', '停用'], required: true },
    { key: 'remark', label: '规格备注', type: 'textarea', fullWidth: true },
  ]
}

export type ParsedCreateInternalSkuValues = {
  color: string
  size: string
  pack: string
  barcode?: string
  weight: number
  lengthMm: number
  widthMm: number
  heightMm: number
  status: UiProductStatus
  remark?: string
}

/** 将弹窗 values 解析为 createVariant 入参（不含 spu，由调用方解析）。 */
export function parseCreateInternalSkuValues(
  values: Record<string, string>,
  opts?: { defaultPack?: string; defaultWeight?: number },
): ParsedCreateInternalSkuValues {
  const remark = values.remark?.trim()
  return {
    color: values.color || '黑色',
    size: values.size || 'L',
    pack: values.pack || opts?.defaultPack || '单件',
    barcode: values.barcode,
    weight: Number(values.weight) || opts?.defaultWeight || 220,
    lengthMm: Number(values.lengthMm) || 0,
    widthMm: Number(values.widthMm) || 0,
    heightMm: Number(values.heightMm) || 0,
    status: (values.status as UiProductStatus) || '待确认',
    remark: remark || undefined,
  }
}
