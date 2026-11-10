'use client'

import * as React from 'react'
import { DetailPageHeader } from '@/components/console/detail'
import { decodeRouteParam } from '@/components/console/erp-ued-detail'
import { Badge } from '@workspace/ui/components/badge'
import { Button } from '@workspace/ui/components/button'
import { Checkbox } from '@workspace/ui/components/checkbox'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { trpc } from '@/lib/trpc/client'

const ACTION_ORDER = ['read', 'create', 'update', 'approve', 'export', 'configure'] as const

export default function AccessRoleDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const id = decodeRouteParam(React.use(params).id)
  const utils = trpc.useUtils()
  const accessQuery = trpc.roles.myAccess.useQuery()
  const catalogQuery = trpc.roles.catalog.useQuery()
  const detailQuery = trpc.roles.get.useQuery({ id })
  const metaQuery = trpc.roles.meta.useQuery()
  const canConfigure = Boolean(accessQuery.data?.isOwner || accessQuery.data?.permissions.includes('settings.configure'))

  const role = detailQuery.data
  const [name, setName] = React.useState('')
  const [code, setCode] = React.useState('')
  const [description, setDescription] = React.useState('')
  const [checked, setChecked] = React.useState<Set<string>>(new Set())
  const [notice, setNotice] = React.useState('')
  const [scopeType, setScopeType] = React.useState('all')
  const [scopeRefId, setScopeRefId] = React.useState('')
  const [selectedUserId, setSelectedUserId] = React.useState('')

  React.useEffect(() => {
    if (!role) return
    setName(role.name)
    setCode(role.code)
    setDescription(role.description)
    setChecked(new Set(role.permissions))
  }, [role])

  const invalidate = async () => {
    await utils.roles.get.invalidate({ id })
    await utils.roles.list.invalidate()
  }

  const updateRole = trpc.roles.update.useMutation({
    onSuccess: async () => {
      setNotice('基本信息已保存。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const savePermissions = trpc.roles.savePermissions.useMutation({
    onSuccess: async () => {
      setNotice('权限矩阵已保存。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const addScope = trpc.roles.addScope.useMutation({
    onSuccess: async () => {
      setNotice('已添加数据范围。')
      setScopeRefId('')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const removeScope = trpc.roles.removeScope.useMutation({
    onSuccess: async () => {
      setNotice('已移除数据范围。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const bindMembers = trpc.roles.bindMembers.useMutation({
    onSuccess: async () => {
      setNotice('已绑定成员。')
      setSelectedUserId('')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })
  const unbindMembers = trpc.roles.unbindMembers.useMutation({
    onSuccess: async () => {
      setNotice('已解除绑定。')
      await invalidate()
    },
    onError: (error) => setNotice(error.message),
  })

  const togglePermission = (permission: string, value: boolean) => {
    setChecked((prev) => {
      const next = new Set(prev)
      if (value) next.add(permission)
      else next.delete(permission)
      return next
    })
  }

  const toggleRow = (module: string, value: boolean) => {
    const actions = catalogQuery.data?.actions.map((item) => item.code) ?? ACTION_ORDER
    setChecked((prev) => {
      const next = new Set(prev)
      for (const action of actions) {
        const permission = `${module}.${action}`
        if (module === 'it' && action !== 'read' && permission !== 'it.impersonate') continue
        if (value) next.add(permission === `${module}.${action}` ? permission : permission)
        if (value) next.add(`${module}.${action}`)
        else next.delete(`${module}.${action}`)
      }
      if (module === 'it') {
        if (value) next.add('it.impersonate')
        else next.delete('it.impersonate')
      }
      return next
    })
  }

  const scopeOptions = React.useMemo(() => {
    if (scopeType === 'shop') return metaQuery.data?.shops ?? []
    if (scopeType === 'warehouse') return metaQuery.data?.warehouses ?? []
    return []
  }, [metaQuery.data, scopeType])

  const boundUserIds = new Set((role?.members ?? []).filter((item) => !item.isOwner || item.annotation == null).map((item) => item.userId))
  const assignable = (metaQuery.data?.assignableMembers ?? []).filter((item) => !item.isOwner && !boundUserIds.has(item.userId))
  const regularMembers = (role?.members ?? []).filter((item) => !item.annotation)
  const owners = (role?.members ?? []).filter((item) => item.annotation)

  return (
    <div className="space-y-6">
      <DetailPageHeader
        backHref="/settings/erp-access"
        title={role ? role.name : `角色 ${id}`}
        description={role ? `${role.isSystem ? '系统角色' : '自定义角色'} · ${role.code}` : '加载角色详情'}
      />
      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}
      {detailQuery.error ? <p className="text-sm text-destructive">{detailQuery.error.message}</p> : null}

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <h3 className="text-base font-semibold">基本信息</h3>
          {role ? (
            <Badge variant={role.status === 'enabled' ? 'secondary' : 'outline'}>
              {role.status === 'enabled' ? '启用' : '停用'}
            </Badge>
          ) : null}
        </div>
        <div className="grid gap-3 md:grid-cols-2">
          <div className="space-y-1.5">
            <Label htmlFor="detail-name">名称</Label>
            <Input id="detail-name" value={name} onChange={(event) => setName(event.target.value)} disabled={!canConfigure} />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="detail-code">编码</Label>
            <Input id="detail-code" value={code} onChange={(event) => setCode(event.target.value)} disabled={!canConfigure || Boolean(role?.isSystem)} />
          </div>
          <div className="space-y-1.5 md:col-span-2">
            <Label htmlFor="detail-desc">备注</Label>
            <Input id="detail-desc" value={description} onChange={(event) => setDescription(event.target.value)} disabled={!canConfigure} />
          </div>
        </div>
        {canConfigure ? (
          <Button
            disabled={updateRole.isPending || !role}
            onClick={() => updateRole.mutate({ id, name, code: role?.isSystem ? undefined : code, description })}
          >
            {updateRole.isPending ? '保存中…' : '保存基本信息'}
          </Button>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h3 className="text-base font-semibold">权限矩阵</h3>
            <p className="text-sm text-muted-foreground">勾选模块与动作。`it.impersonate` 默认关闭，仅作预留。</p>
          </div>
          {canConfigure ? (
            <Button
              disabled={savePermissions.isPending || !role}
              onClick={() => savePermissions.mutate({ id, permissions: [...checked] })}
            >
              {savePermissions.isPending ? '保存中…' : '保存权限'}
            </Button>
          ) : null}
        </div>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>模块</TableHead>
              {(catalogQuery.data?.actions ?? ACTION_ORDER.map((code) => ({ code, name: code }))).map((action) => (
                <TableHead key={action.code}>{action.name}</TableHead>
              ))}
              <TableHead>全选</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(catalogQuery.data?.modules ?? []).map((module) => {
              const actions = catalogQuery.data?.actions ?? []
              const modulePerms =
                module.code === 'it'
                  ? ['it.impersonate']
                  : actions.map((action) => `${module.code}.${action.code}`)
              const rowChecked = modulePerms.every((permission) => checked.has(permission))
              return (
                <TableRow key={module.code}>
                  <TableCell>{module.name}</TableCell>
                  {actions.map((action) => {
                    const permission = module.code === 'it'
                      ? action.code === 'read'
                        ? ''
                        : 'it.impersonate'
                      : `${module.code}.${action.code}`
                    if (module.code === 'it' && action.code !== 'configure') {
                      return (
                        <TableCell key={`${module.code}-${action.code}`}>
                          {action.code === 'read' ? '—' : ''}
                        </TableCell>
                      )
                    }
                    if (!permission) return <TableCell key={`${module.code}-${action.code}`}>—</TableCell>
                    if (module.code === 'it' && action.code !== 'configure') {
                      return <TableCell key={`${module.code}-${action.code}`}>—</TableCell>
                    }
                    const visiblePermission = module.code === 'it' ? 'it.impersonate' : `${module.code}.${action.code}`
                    const show = module.code !== 'it' || action.code === 'configure'
                    return (
                      <TableCell key={`${module.code}-${action.code}`}>
                        {show ? (
                          <Checkbox
                            checked={checked.has(visiblePermission)}
                            disabled={!canConfigure}
                            onCheckedChange={(value) => togglePermission(visiblePermission, value === true)}
                          />
                        ) : (
                          '—'
                        )}
                      </TableCell>
                    )
                  })}
                  <TableCell>
                    <Checkbox
                      checked={rowChecked && modulePerms.length > 0}
                      disabled={!canConfigure}
                      onCheckedChange={(value) => toggleRow(module.code, value === true)}
                    />
                  </TableCell>
                </TableRow>
              )
            })}
          </TableBody>
        </Table>
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">数据范围</h3>
        <p className="text-sm text-muted-foreground">
          默认为全部。店铺与仓库范围本轮会在服务端过滤中优先生效；国家/站点/平台可先配置，列表过滤将在后续迭代补齐。
        </p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>类型</TableHead>
              <TableHead>对象</TableHead>
              <TableHead>动作</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {(role?.scopes ?? []).length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  尚未配置范围，默认视为全部数据。
                </TableCell>
              </TableRow>
            ) : (
              (role?.scopes ?? []).map((scope) => {
                const target =
                  scope.scopeType === 'shop'
                    ? metaQuery.data?.shops.find((item) => item.id === scope.scopeRefId)?.label
                    : scope.scopeType === 'warehouse'
                      ? metaQuery.data?.warehouses.find((item) => item.id === scope.scopeRefId)?.label
                      : scope.scopeRefId
                return (
                  <TableRow key={scope.id}>
                    <TableCell>{catalogQuery.data?.scopeTypes.find((item) => item.code === scope.scopeType)?.name ?? scope.scopeType}</TableCell>
                    <TableCell>{scope.scopeType === 'all' ? '全部' : target || scope.scopeRefId || '—'}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {scope.actions.length > 0 ? scope.actions.join('、') : '全部动作'}
                    </TableCell>
                    <TableCell className="text-right">
                      {canConfigure ? (
                        <Button size="sm" variant="outline" onClick={() => removeScope.mutate({ id: scope.id })}>
                          移除
                        </Button>
                      ) : null}
                    </TableCell>
                  </TableRow>
                )
              })
            )}
          </TableBody>
        </Table>
        {canConfigure ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>范围类型</Label>
              <Select
                value={scopeType}
                onValueChange={(value) => {
                  setScopeType(value)
                  setScopeRefId('')
                }}
              >
                <SelectTrigger className="w-40">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {(catalogQuery.data?.scopeTypes ?? []).map((item) => (
                    <SelectItem key={item.code} value={item.code}>
                      {item.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {scopeType !== 'all' ? (
              <div className="space-y-1.5">
                <Label>范围对象</Label>
                {scopeOptions.length > 0 ? (
                  <Select value={scopeRefId} onValueChange={setScopeRefId}>
                    <SelectTrigger className="w-56">
                      <SelectValue placeholder="请选择" />
                    </SelectTrigger>
                    <SelectContent>
                      {scopeOptions.map((item) => (
                        <SelectItem key={item.id} value={item.id}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input
                    value={scopeRefId}
                    onChange={(event) => setScopeRefId(event.target.value)}
                    placeholder="输入对应 ID（国家/站点/平台）"
                    className="w-56"
                  />
                )}
              </div>
            ) : null}
            <Button
              disabled={addScope.isPending}
              onClick={() =>
                addScope.mutate({
                  roleId: id,
                  scopeType,
                  scopeRefId: scopeType === 'all' ? undefined : scopeRefId,
                })
              }
            >
              添加范围
            </Button>
          </div>
        ) : null}
      </section>

      <section className="space-y-3 rounded-lg border p-4">
        <h3 className="text-base font-semibold">成员</h3>
        <p className="text-sm text-muted-foreground">从本组织成员中绑定或解除该角色。组织所有者无需绑定。</p>
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>姓名</TableHead>
              <TableHead>邮箱</TableHead>
              <TableHead>说明</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {owners.map((item) => (
              <TableRow key={`owner-${item.userId}`}>
                <TableCell>{item.name}</TableCell>
                <TableCell className="font-mono text-xs">{item.email || '—'}</TableCell>
                <TableCell>{item.annotation}</TableCell>
                <TableCell />
              </TableRow>
            ))}
            {regularMembers.length === 0 && owners.length === 0 ? (
              <TableRow>
                <TableCell colSpan={4} className="text-sm text-muted-foreground">
                  暂无绑定成员。
                </TableCell>
              </TableRow>
            ) : (
              regularMembers.map((item) => (
                <TableRow key={item.userId}>
                  <TableCell>{item.name}</TableCell>
                  <TableCell className="font-mono text-xs">{item.email || '—'}</TableCell>
                  <TableCell>已绑定</TableCell>
                  <TableCell className="text-right">
                    {canConfigure ? (
                      <Button
                        size="sm"
                        variant="outline"
                        onClick={() => unbindMembers.mutate({ roleId: id, userIds: [item.userId] })}
                      >
                        解除绑定
                      </Button>
                    ) : null}
                  </TableCell>
                </TableRow>
              ))
            )}
          </TableBody>
        </Table>
        {canConfigure ? (
          <div className="flex flex-wrap items-end gap-3">
            <div className="space-y-1.5">
              <Label>绑定成员</Label>
              <Select value={selectedUserId} onValueChange={setSelectedUserId}>
                <SelectTrigger className="w-64">
                  <SelectValue placeholder={assignable.length ? '选择成员' : '没有可绑定的成员'} />
                </SelectTrigger>
                <SelectContent>
                  {assignable.map((item) => (
                    <SelectItem key={item.userId} value={item.userId}>
                      {item.name}
                      {item.email ? `（${item.email}）` : ''}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              disabled={!selectedUserId || bindMembers.isPending}
              onClick={() => bindMembers.mutate({ roleId: id, userIds: [selectedUserId] })}
            >
              绑定
            </Button>
          </div>
        ) : null}
      </section>
    </div>
  )
}
