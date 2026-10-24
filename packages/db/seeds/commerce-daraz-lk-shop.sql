-- Seed canonical demo shops for marketplace OAuth + console mocks.
-- IDs MUST match apps/shop/src/lib/crossborder/mock-data.ts (cuid2).
--
-- TODO: replace :organization_id with a real organization.id from auth-schema
--   before running against a live DB. Example:
--   SELECT id FROM organization WHERE slug = 'demo' LIMIT 1;

-- Canonical shop ids (do not regenerate):
--   Daraz LK:  b5ofcwj2mzauov29y08m0q99
--   Lazada MY: s8v7xkqw0asyz4zhswxwzdd3
--   TikTok:    kqw7alhkgefjmffogbib1z79

BEGIN;

-- :organization_id — bind or substitute before execute
INSERT INTO shops (
  id, organization_id, platform, name, external_shop_id, status,
  region, currency, timezone, seller_name, marketplace_country,
  auth_expires_at, last_sync_at, meta
) VALUES
(
  'b5ofcwj2mzauov29y08m0q99',
  :organization_id,
  'daraz',
  'Daraz LK · Demo',
  'dz-lk-88021',
  'active',
  'LK',
  'LKR',
  'Asia/Colombo',
  'Open Shop LK Seller',
  'lk',
  NOW() + INTERVAL '60 days',
  NOW() - INTERVAL '30 minutes',
  '{"slug":"daraz-lk","cipherHint":null}'::jsonb
),
(
  's8v7xkqw0asyz4zhswxwzdd3',
  :organization_id,
  'lazada',
  'Lazada MY · Sandbox',
  'lz-my-10288',
  'connecting',
  'MY',
  'MYR',
  'Asia/Kuala_Lumpur',
  'Open Shop MY Sandbox',
  'my',
  NULL,
  NULL,
  '{"slug":"lazada-my"}'::jsonb
),
(
  'kqw7alhkgefjmffogbib1z79',
  :organization_id,
  'tiktok_shop',
  'TikTok Shop · Demo',
  'tts-748812',
  'draft',
  'GLOBAL',
  'USD',
  'UTC',
  'Open Shop TTS Demo',
  'global',
  NULL,
  NULL,
  '{"slug":"tiktok-global"}'::jsonb
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  external_shop_id = EXCLUDED.external_shop_id,
  status = EXCLUDED.status,
  region = EXCLUDED.region,
  currency = EXCLUDED.currency,
  timezone = EXCLUDED.timezone,
  seller_name = EXCLUDED.seller_name,
  marketplace_country = EXCLUDED.marketplace_country,
  meta = EXCLUDED.meta,
  updated_at = NOW();

INSERT INTO integration_states (id, shop_id, health)
VALUES
  ('istate-daraz-lk', 'b5ofcwj2mzauov29y08m0q99', 'success'),
  ('istate-lazada-my', 's8v7xkqw0asyz4zhswxwzdd3', 'idle'),
  ('istate-tiktok', 'kqw7alhkgefjmffogbib1z79', 'idle')
ON CONFLICT DO NOTHING;

COMMIT;
