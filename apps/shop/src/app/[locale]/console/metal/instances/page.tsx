"use client"

import { MetalInstanceList } from "./_components/metal-instance-list"

export default function MetalInstancesPage() {
  return (
    <div className="mx-auto w-full max-w-7xl px-5 py-6">
      <div className="mb-4">
        <h1 className="mb-2 text-2xl font-black text-foreground">我的裸金属</h1>
        <p className="text-sm text-muted-foreground">
          管理已租用的裸金属设备。预付费产品，费用在下单时一次性收取，关机不退费。
        </p>
      </div>
      <MetalInstanceList />
    </div>
  )
}
