'use client'

import * as React from 'react'
import { UedPrototypeNotice } from '@/components/console/erp-ued-workspace'
import { LocaleLink } from '@/lib/i18n/navigation'
import {
  INITIAL_COUNTRIES,
  INITIAL_CURRENCIES,
  INITIAL_PLATFORMS,
} from '@/lib/crossborder/platform-basics-data'
import { Alert, AlertDescription, AlertTitle } from '@workspace/ui/components/alert'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'

/**
 * 平台 / 国家 / 币种：只读参考目录（非可保存原型）。
 * 仓库主数据请走 WMS，不在此页伪造保存成功。
 */
export default function PlatformBasicsPage() {
  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight">平台基础资料</h2>
        <p className="text-sm text-muted-foreground">
          平台 / 国家 / 币种为只读参考；仓库请在 WMS 维护。本页不再提供会「假成功」的本地保存。
        </p>
      </div>

      <Alert>
        <AlertTitle>仓库主数据入口</AlertTitle>
        <AlertDescription className="flex flex-wrap items-center gap-2">
          <span>仓库 / 库区 / 库位以 WMS 为准，勿在设置页维护玩具数据。</span>
          <Button size="sm" asChild>
            <LocaleLink href="/console/warehouse">打开 WMS 仓库</LocaleLink>
          </Button>
        </AlertDescription>
      </Alert>

      <UedPrototypeNotice>
        下列表格为静态参考（来自 platform-basics-data），刷新不丢、也不可「保存成功」。全局 marketplace scope
        不在本轮重建。
      </UedPrototypeNotice>

      <section className="space-y-2">
        <h3 className="font-medium">平台（参考）</h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>代码</TableHead>
                <TableHead>站点</TableHead>
                <TableHead>接入状态</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INITIAL_PLATFORMS.map((p) => (
                <TableRow key={p.code}>
                  <TableCell>{p.name}</TableCell>
                  <TableCell className="font-mono text-xs">{p.code}</TableCell>
                  <TableCell>{Array.isArray(p.countries) ? p.countries.join(', ') : String(p.countries)}</TableCell>
                  <TableCell>
                    <Badge variant="outline">{p.apiReady}</Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">国家 / 站点（参考）</h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>名称</TableHead>
                <TableHead>代码</TableHead>
                <TableHead>区域</TableHead>
                <TableHead>时区</TableHead>
                <TableHead>默认币种</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INITIAL_COUNTRIES.map((c) => (
                <TableRow key={c.code}>
                  <TableCell>{c.name}</TableCell>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.region}</TableCell>
                  <TableCell className="font-mono text-xs">{c.timezone}</TableCell>
                  <TableCell>{c.defaultCurrency}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>

      <section className="space-y-2">
        <h3 className="font-medium">币种（参考）</h3>
        <div className="rounded-lg border">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>符号</TableHead>
                <TableHead>小数位</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {INITIAL_CURRENCIES.map((c) => (
                <TableRow key={c.code}>
                  <TableCell className="font-mono text-xs">{c.code}</TableCell>
                  <TableCell>{c.name}</TableCell>
                  <TableCell>{c.symbol}</TableCell>
                  <TableCell>{c.decimals}</TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </section>
    </div>
  )
}
