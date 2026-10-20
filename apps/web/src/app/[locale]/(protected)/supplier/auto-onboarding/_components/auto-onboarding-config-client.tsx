'use client'

import { useEffect, useState } from 'react'
import { useSearchParams } from 'next/navigation'
import { Badge } from '@workspace/ui/components/badge'
import { Card, CardContent, CardHeader, CardTitle } from '@workspace/ui/components/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@workspace/ui/components/table'
import { Button } from '@workspace/ui/components/button'
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@workspace/ui/components/dialog'
import { Input } from '@workspace/ui/components/input'
import { Label } from '@workspace/ui/components/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@workspace/ui/components/tabs'
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@workspace/ui/components/select'
import { Settings, Plus, Edit, Trash2, Save, CheckCircle2, XCircle, Play, RotateCcw, ListTodo } from 'lucide-react'
import { trpc } from '@/lib/trpc/client'

export function AutoOnboardingConfigClient() {
  const utils = trpc.useUtils()
  const searchParams = useSearchParams()

  const { data: policies, isLoading } = trpc.supplier.deviceOnboarding.listPolicies.useQuery({
    page: 1,
    pageSize: 100,
  })

  const createMutation = trpc.supplier.deviceOnboarding.createPolicy.useMutation({
    onSuccess: () => {
      utils.supplier.deviceOnboarding.listPolicies.invalidate()
      setShowConfigDialog(false)
      resetForm()
    },
  })

  const updateMutation = trpc.supplier.deviceOnboarding.updatePolicy.useMutation({
    onSuccess: () => {
      utils.supplier.deviceOnboarding.listPolicies.invalidate()
      setShowConfigDialog(false)
      resetForm()
    },
  })

  const deleteMutation = trpc.supplier.deviceOnboarding.deletePolicy.useMutation({
    onSuccess: () => {
      utils.supplier.deviceOnboarding.listPolicies.invalidate()
    },
  })

  const [showConfigDialog, setShowConfigDialog] = useState(false)
  const [selectedPolicyId, setSelectedPolicyId] = useState<string | null>(null)
  const [activeTab, setActiveTab] = useState(searchParams.get('batchId') ? 'apply' : 'configs')
  const [applyBatchId, setApplyBatchId] = useState(searchParams.get('batchId') ?? '')
  const [applyPolicyId, setApplyPolicyId] = useState('')
  const [applyMessage, setApplyMessage] = useState<string | null>(null)

  const { data: batchesData } = trpc.supplier.onboardingBatch.list.useQuery({
    batchKind: 'online',
  })

  const { data: batchTasks, refetch: refetchTasks } =
    trpc.supplier.deviceOnboarding.getTasksByBatch.useQuery(
      { batchId: applyBatchId },
      { enabled: Boolean(applyBatchId) },
    )

  const applyMutation = trpc.supplier.deviceOnboarding.applyPolicyToBatch.useMutation({
    onSuccess: (result) => {
      setApplyMessage(`已为批次创建 ${result.tasksCreated} 个 Agent 任务`)
      void refetchTasks()
      setActiveTab('tasks')
    },
    onError: (err) => {
      setApplyMessage(err.message || '应用策略失败')
    },
  })

  const retryMutation = trpc.supplier.deviceOnboarding.retryTask.useMutation({
    onSuccess: () => {
      void refetchTasks()
    },
  })

  const [configForm, setConfigForm] = useState({
    name: '',
    description: '',
    gpuPluginVersion: 'v0.1.0',
    karmadaVersion: 'v1.8.0',
    volcanoVersion: 'v1.9.0',
    sshTimeout: 30,
    maxRetries: 3,
    retryInterval: 60,
  })

  useEffect(() => {
    const bid = searchParams.get('batchId')
    if (bid) {
      setApplyBatchId(bid)
      setActiveTab('apply')
    }
  }, [searchParams])

  const resetForm = () => {
    setSelectedPolicyId(null)
    setConfigForm({
      name: '',
      description: '',
      gpuPluginVersion: 'v0.1.0',
      karmadaVersion: 'v1.8.0',
      volcanoVersion: 'v1.9.0',
      sshTimeout: 30,
      maxRetries: 3,
      retryInterval: 60,
    })
  }

  const handleAddConfig = () => {
    resetForm()
    setShowConfigDialog(true)
  }

  const handleEditConfig = (policy: any) => {
    setSelectedPolicyId(policy.id)
    const policyData = policy.policyJson || {}
    setConfigForm({
      name: policy.name,
      description: policy.description || '',
      gpuPluginVersion: policyData.gpuPlugin?.version || 'v0.1.0',
      karmadaVersion: policyData.karmadaVersion || 'v1.8.0',
      volcanoVersion: policyData.volcano?.version || 'v1.9.0',
      sshTimeout: policyData.sshTimeout || 30,
      maxRetries: policyData.maxRetries || 3,
      retryInterval: policyData.retryInterval || 60,
    })
    setShowConfigDialog(true)
  }

  const handleDeleteConfig = (policyId: string) => {
    if (!confirm('确定要删除此策略模板吗？')) return
    deleteMutation.mutate({ id: policyId })
  }

  const handleSaveConfig = () => {
    if (!configForm.name) return

    const policyJson = {
      gpuPlugin: { version: configForm.gpuPluginVersion },
      karmadaVersion: configForm.karmadaVersion,
      volcano: { version: configForm.volcanoVersion },
      sshTimeout: configForm.sshTimeout,
      maxRetries: configForm.maxRetries,
      retryInterval: configForm.retryInterval,
    }

    if (selectedPolicyId) {
      updateMutation.mutate({
        id: selectedPolicyId,
        name: configForm.name,
        description: configForm.description,
        policyJson,
      })
    } else {
      createMutation.mutate({
        name: configForm.name,
        description: configForm.description,
        policyJson,
      })
    }
  }

  const handleApply = () => {
    setApplyMessage(null)
    if (!applyBatchId || !applyPolicyId) {
      setApplyMessage('请选择批次和策略模板')
      return
    }
    applyMutation.mutate({ batchId: applyBatchId, policyId: applyPolicyId })
  }

  const batchItems = batchesData?.items ?? []
  const policyItems = policies?.items ?? []

  return (
    <div className="flex flex-1 flex-col gap-6 p-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-semibold">自动上架策略</h1>
          <p className="text-sm text-muted-foreground mt-1">
            配置策略模板，应用到上架批次并跟踪 Agent 任务
          </p>
        </div>
        <Button onClick={handleAddConfig} className="gap-2">
          <Plus className="w-4 h-4" />
          新建配置
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="configs" className="flex items-center gap-2">
            <Settings className="w-4 h-4" />
            策略模板
          </TabsTrigger>
          <TabsTrigger value="apply" className="flex items-center gap-2">
            <Play className="w-4 h-4" />
            应用策略
          </TabsTrigger>
          <TabsTrigger value="tasks" className="flex items-center gap-2">
            <ListTodo className="w-4 h-4" />
            任务列表
          </TabsTrigger>
        </TabsList>

        <TabsContent value="configs" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>策略模板列表</CardTitle>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <p className="text-sm text-muted-foreground">加载中…</p>
              ) : !policyItems.length ? (
                <p className="text-sm text-muted-foreground">
                  暂无策略模板，点击右上角「新建配置」创建第一个模板
                </p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>策略名称</TableHead>
                      <TableHead>说明</TableHead>
                      <TableHead>GPU Plugin</TableHead>
                      <TableHead>重试</TableHead>
                      <TableHead className="w-[120px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {policyItems.map((policy: any) => {
                      const pj = policy.policyJson || {}
                      return (
                        <TableRow key={policy.id}>
                          <TableCell className="font-medium">{policy.name}</TableCell>
                          <TableCell className="text-muted-foreground">
                            {policy.description || '—'}
                          </TableCell>
                          <TableCell>{pj.gpuPlugin?.version || '—'}</TableCell>
                          <TableCell>
                            {pj.maxRetries ?? 3} 次 / {pj.retryInterval ?? 60}s
                          </TableCell>
                          <TableCell>
                            <div className="flex items-center gap-1">
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleEditConfig(policy)}
                              >
                                <Edit className="w-4 h-4" />
                              </Button>
                              <Button
                                variant="ghost"
                                size="icon"
                                onClick={() => handleDeleteConfig(policy.id)}
                              >
                                <Trash2 className="w-4 h-4" />
                              </Button>
                            </div>
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="apply" className="mt-4">
          <Card>
            <CardHeader>
              <CardTitle>应用策略到上架批次</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4 max-w-xl">
              <div className="space-y-2">
                <Label>上架批次</Label>
                <Select value={applyBatchId || undefined} onValueChange={setApplyBatchId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择 online 批次" />
                  </SelectTrigger>
                  <SelectContent>
                    {batchItems.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.batchCode || b.id}
                        {b.batchStatus ? ` · ${b.batchStatus}` : ''}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>策略模板</Label>
                <Select value={applyPolicyId || undefined} onValueChange={setApplyPolicyId}>
                  <SelectTrigger>
                    <SelectValue placeholder="选择策略模板" />
                  </SelectTrigger>
                  <SelectContent>
                    {policyItems.map((p: any) => (
                      <SelectItem key={p.id} value={p.id}>
                        {p.name}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <Button
                onClick={handleApply}
                disabled={applyMutation.isPending}
                className="gap-2"
              >
                <Play className="w-4 h-4" />
                {applyMutation.isPending ? '应用中…' : '应用到批次（生成 Agent 任务）'}
              </Button>
              {applyMessage && (
                <p className="text-sm text-muted-foreground">{applyMessage}</p>
              )}
              <p className="text-xs text-muted-foreground">
                仅对批次内审核通过（approved）的设备创建任务；失败任务可在「任务列表」手动重试。
              </p>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="tasks" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between gap-4">
              <CardTitle>Agent 任务</CardTitle>
              <div className="flex items-center gap-2">
                <Select
                  value={applyBatchId || undefined}
                  onValueChange={(v) => {
                    setApplyBatchId(v)
                  }}
                >
                  <SelectTrigger className="w-[260px]">
                    <SelectValue placeholder="按批次筛选" />
                  </SelectTrigger>
                  <SelectContent>
                    {batchItems.map((b: any) => (
                      <SelectItem key={b.id} value={b.id}>
                        {b.batchCode || b.id}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  variant="outline"
                  size="sm"
                  disabled={!applyBatchId}
                  onClick={() => void refetchTasks()}
                >
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {!applyBatchId ? (
                <p className="text-sm text-muted-foreground">请先选择批次</p>
              ) : !batchTasks?.length ? (
                <p className="text-sm text-muted-foreground">该批次暂无任务，请先应用策略</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>任务 ID</TableHead>
                      <TableHead>设备</TableHead>
                      <TableHead>阶段</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>重试</TableHead>
                      <TableHead className="w-[100px]">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {batchTasks.map((task: any) => {
                      const failed =
                        task.stage === 'failed' || task.stageStatus === 'error'
                      return (
                        <TableRow key={task.id}>
                          <TableCell className="font-mono text-xs">{task.id}</TableCell>
                          <TableCell className="font-mono text-xs">
                            {task.supplierDeviceId}
                          </TableCell>
                          <TableCell>{task.stage}</TableCell>
                          <TableCell>
                            <Badge variant="outline">{task.stageStatus || '—'}</Badge>
                          </TableCell>
                          <TableCell>
                            {task.retryCount}/{task.maxRetries}
                          </TableCell>
                          <TableCell>
                            {failed && (
                              <Button
                                variant="ghost"
                                size="sm"
                                className="gap-1"
                                disabled={retryMutation.isPending}
                                onClick={() => retryMutation.mutate({ taskId: task.id })}
                              >
                                <RotateCcw className="w-3.5 h-3.5" />
                                重试
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      <Dialog open={showConfigDialog} onOpenChange={setShowConfigDialog}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{selectedPolicyId ? '编辑策略' : '新建策略'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-2">
            <div className="space-y-2">
              <Label>策略名称 *</Label>
              <Input
                value={configForm.name}
                onChange={(e) => setConfigForm({ ...configForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Input
                value={configForm.description}
                onChange={(e) => setConfigForm({ ...configForm, description: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>GPU Plugin</Label>
                <Input
                  value={configForm.gpuPluginVersion}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, gpuPluginVersion: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Karmada</Label>
                <Input
                  value={configForm.karmadaVersion}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, karmadaVersion: e.target.value })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>Volcano</Label>
                <Input
                  value={configForm.volcanoVersion}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, volcanoVersion: e.target.value })
                  }
                />
              </div>
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="space-y-2">
                <Label>SSH 超时（秒）</Label>
                <Input
                  type="number"
                  value={configForm.sshTimeout}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, sshTimeout: parseInt(e.target.value) || 30 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>最大重试</Label>
                <Input
                  type="number"
                  value={configForm.maxRetries}
                  onChange={(e) =>
                    setConfigForm({ ...configForm, maxRetries: parseInt(e.target.value) || 3 })
                  }
                />
              </div>
              <div className="space-y-2">
                <Label>重试间隔（秒）</Label>
                <Input
                  type="number"
                  value={configForm.retryInterval}
                  onChange={(e) =>
                    setConfigForm({
                      ...configForm,
                      retryInterval: parseInt(e.target.value) || 60,
                    })
                  }
                />
              </div>
            </div>
            <div className="flex justify-end gap-2">
              <Button variant="outline" onClick={() => setShowConfigDialog(false)}>
                取消
              </Button>
              <Button
                onClick={handleSaveConfig}
                disabled={createMutation.isPending || updateMutation.isPending}
                className="gap-2"
              >
                <Save className="w-4 h-4" />
                保存
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  )
}
