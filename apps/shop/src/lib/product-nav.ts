export type ProductId = 'gpus' | 'agent-sandbox'

export type ProductConfig = {
  id: ProductId
  href: string
  titleKey: 'gpus' | 'agentSandbox'
}

export const PRODUCTS: ProductConfig[] = [
  { id: 'gpus', href: '/console/server/list', titleKey: 'gpus' },
  { id: 'agent-sandbox', href: '/console/sandbox', titleKey: 'agentSandbox' },
]

export function getProductByPathname(pathname: string): ProductConfig {
  if (pathname === '/console/sandbox' || pathname.startsWith('/console/sandbox/')) {
    return PRODUCTS.find((product) => product.id === 'agent-sandbox')!
  }

  return PRODUCTS.find((product) => product.id === 'gpus')!
}
