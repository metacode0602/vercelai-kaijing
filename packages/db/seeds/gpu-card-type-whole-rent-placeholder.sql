-- 整租线下交付设备占位卡型（卡型暂缺时入库用）
INSERT INTO gpu_card_type (
  id,
  code,
  name,
  manufacturer,
  memory_gb,
  tdp_watts,
  compute_capability,
  device_role,
  status
)
VALUES (
  'gpu-whole-rent-unknown',
  'WHOLE-RENT-UNKNOWN',
  '整租设备（卡型未知）',
  'NVIDIA',
  NULL,
  NULL,
  NULL,
  'wr_placeholder',
  'active'
)
ON CONFLICT (code) DO UPDATE SET
  name = EXCLUDED.name,
  device_role = EXCLUDED.device_role,
  status = EXCLUDED.status;
