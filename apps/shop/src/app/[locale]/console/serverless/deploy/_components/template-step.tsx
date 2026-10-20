"use client"

import { useEffect, useState } from "react"
import {
  Check,
  Container,
  Eye,
  EyeOff,
  Globe,
  KeyRound,
  Save,
  ShieldCheck,
} from "lucide-react"
import { toast } from "sonner"
import { FormSection } from "@/components/form-section"
import { Button } from "@workspace/ui/components/button"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@workspace/ui/components/dialog"
import { Input } from "@workspace/ui/components/input"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import { Label } from "@workspace/ui/components/label"
import { Textarea } from "@workspace/ui/components/textarea"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import { Alert, AlertDescription, AlertTitle } from "@workspace/ui/components/alert"
import { Badge } from "@workspace/ui/components/badge"
import { PLATFORM_REGISTRY, genId } from "@/lib/gpu-data"
import { trpc } from "@/trpc/client"
import type {
  RegistrySource,
  SavedTemplate,
  TemplateValues,
} from "./types"
import { buildCustomImageRef, stripRegistryHost } from "./types"
import { cn } from "@workspace/ui/lib/utils"

const REGISTRY_SOURCE_OPTIONS: {
  id: RegistrySource
  name: string
  description: string
  icon: typeof Container
  badge?: string
}[] = [
  {
    id: "platform",
    name: PLATFORM_REGISTRY.name,
    description: PLATFORM_REGISTRY.description,
    icon: Container,
    badge: "推荐",
  },
  {
    id: "custom",
    name: "自定义镜像仓库",
    description: "Docker Hub、GHCR、Harbor 等私有或第三方仓库，需配置登录凭证。",
    icon: Globe,
  },
]

export interface TemplateStepProps {
  values: TemplateValues
  savedTemplates: SavedTemplate[]
  onChange: <K extends keyof TemplateValues>(
    key: K,
    value: TemplateValues[K],
  ) => void
  onSaveTemplate: (template: SavedTemplate) => void
}

export function TemplateStep({
  values,
  savedTemplates,
  onChange,
  onSaveTemplate,
}: TemplateStepProps) {
  const [saveDialogOpen, setSaveDialogOpen] = useState(false)
  const [templateName, setTemplateName] = useState("")
  const [credentialDialogOpen, setCredentialDialogOpen] = useState(false)
  const [draftUsername, setDraftUsername] = useState("")
  const [draftPassword, setDraftPassword] = useState("")
  const [showPassword, setShowPassword] = useState(false)
  const [testingCredentials, setTestingCredentials] = useState(false)

  const { data: appTemplateData } = trpc.applicationTemplate.list.useQuery({
    deployType: "serverless",
    pageSize: 100,
  })
  const dbTemplates = (appTemplateData?.items ?? []).map((t) => ({
    id: t.id,
    name: t.name,
    image: t.imageRef,
    desc: t.description ?? "",
    category: t.category,
    featured: false,
  }))
  const templates = dbTemplates.map((t) => ({
    ...t,
    saved: false as const,
  }))

  const resolvedCustomImage = buildCustomImageRef(values)
  const hasCredentials = Boolean(
    values.registryCredentials?.username && values.registryCredentials.password,
  )

  const allTemplates = [
    ...savedTemplates.map((t) => ({
      id: t.id,
      name: t.name,
      image: t.image,
      desc: "自定义保存的模板",
      category: "我的模板",
      featured: false,
      saved: true as const,
    })),
    ...templates,
  ]

  useEffect(() => {
    if (!credentialDialogOpen) return
    setDraftUsername(values.registryCredentials?.username ?? "")
    setDraftPassword(values.registryCredentials?.password ?? "")
    setShowPassword(false)
  }, [credentialDialogOpen, values.registryCredentials])

  function handleSaveTemplate() {
    const name = templateName.trim()
    if (!name) {
      toast.error("请输入模板名称")
      return
    }
    if (!values.customImage.trim()) {
      toast.error("请先填写镜像地址")
      return
    }
    if (values.registrySource === "custom" && !hasCredentials) {
      toast.error("请先配置自定义仓库的登录凭证")
      return
    }

    onSaveTemplate({
      id: genId("tpl"),
      name,
      image: resolvedCustomImage,
      registrySource: values.registrySource,
      registryHost: values.registryHost,
      registryUsername: values.registryCredentials?.username,
      envVars: values.envVars,
      startCommand: values.startCommand,
      ports: values.ports,
    })
    toast.success(`模板「${name}」已保存`)
    setTemplateName("")
    setSaveDialogOpen(false)
  }

  function selectPresetTemplate(id: string) {
    onChange("mode", "preset")
    onChange("templateId", id)

    const saved = savedTemplates.find((t) => t.id === id)
    if (saved) {
      onChange("registrySource", saved.registrySource)
      onChange("registryHost", saved.registryHost)
      onChange("registryCredentials", null)
      onChange(
        "customImage",
        saved.registrySource === "platform"
          ? stripRegistryHost(PLATFORM_REGISTRY.host, saved.image)
          : stripRegistryHost(saved.registryHost, saved.image),
      )
      onChange("envVars", saved.envVars)
      onChange("startCommand", saved.startCommand)
      onChange("ports", saved.ports)
      if (saved.registrySource === "custom" && saved.registryUsername) {
        toast.info("该模板使用自定义仓库，请重新配置登录凭证")
      }
      return
    }

    const preset = dbTemplates?.find((t) => t.id === id)
    if (preset) {
      onChange("customImage", preset.image)
    }
  }

  function selectRegistrySource(source: RegistrySource) {
    onChange("registrySource", source)
    if (source === "platform") {
      onChange("registryHost", "")
      onChange("registryCredentials", null)
    }
  }

  function openCredentialDialog() {
    if (!values.registryHost.trim()) {
      toast.error("请先填写镜像仓库地址")
      return
    }
    setCredentialDialogOpen(true)
  }

  function handleSaveCredentials() {
    const username = draftUsername.trim()
    if (!username) {
      toast.error("请输入用户名")
      return
    }
    if (!draftPassword) {
      toast.error("请输入密码或访问令牌")
      return
    }

    onChange("registryCredentials", { username, password: draftPassword })
    setCredentialDialogOpen(false)
    toast.success("登录凭证已保存")
  }

  async function handleTestCredentials() {
    const username = draftUsername.trim()
    if (!username || !draftPassword) {
      toast.error("请先填写用户名和密码")
      return
    }

    setTestingCredentials(true)
    try {
      await new Promise((resolve) => setTimeout(resolve, 1200))
      toast.success("凭证验证成功，可以拉取镜像")
    } catch {
      toast.error("凭证验证失败，请检查用户名和密码")
    } finally {
      setTestingCredentials(false)
    }
  }

  function clearCredentials() {
    onChange("registryCredentials", null)
    toast.success("已清除登录凭证")
  }

  return (
    <>
      <FormSection
        step={2}
        title="选择模板"
        description="选择预置推理模板，或配置自定义镜像并保存为模板。"
      >
        <Tabs
          value={values.mode}
          onValueChange={(v) => {
            if (!v) return
            onChange("mode", v as TemplateValues["mode"])
            if (v === "custom" && values.registrySource === "platform") {
              const isPresetImage =
                (dbTemplates ?? []).some((t) => t.image === values.customImage) ||
                savedTemplates.some((t) => t.image === values.customImage)
              if (isPresetImage) {
                onChange("customImage", "")
              }
            }
          }}
        >
          <TabsList className="mb-4">
            <TabsTrigger value="preset">预置模板</TabsTrigger>
            <TabsTrigger value="custom">自定义镜像</TabsTrigger>
          </TabsList>

          <TabsContent value="preset" className="mt-0">
            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
              {allTemplates.map((t) => {
                const selected =
                  values.mode === "preset" && values.templateId === t.id
                return (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => selectPresetTemplate(t.id)}
                    className={cn(
                      "relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60",
                      selected
                        ? "border-primary ring-2 ring-primary/30"
                        : "border-border",
                    )}
                  >
                    {selected && (
                      <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                        <Check className="size-3 text-primary-foreground" />
                      </span>
                    )}
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-foreground">
                        {t.name}
                      </span>
                      {t.featured && (
                        <span className="rounded bg-accent px-1.5 py-0.5 text-[10px] font-medium text-accent-foreground">
                          精选
                        </span>
                      )}
                      {t.saved && (
                        <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
                          我的
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-muted-foreground text-pretty">
                      {t.desc}
                    </p>
                    <code className="mt-2 truncate rounded bg-muted px-1.5 py-1 font-mono text-[11px] text-muted-foreground">
                      {t.image}
                    </code>
                  </button>
                )
              })}
            </div>
          </TabsContent>

          <TabsContent value="custom" className="mt-0">
            <div className="flex flex-col gap-4">
              <div className="flex flex-col gap-2">
                <Label>镜像来源</Label>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {REGISTRY_SOURCE_OPTIONS.map((item) => {
                    const selected = values.registrySource === item.id
                    const Icon = item.icon

                    return (
                      <button
                        key={item.id}
                        type="button"
                        onClick={() => selectRegistrySource(item.id)}
                        className={cn(
                          "relative flex flex-col rounded-xl border bg-card p-4 text-left transition-all hover:border-primary/60 hover:shadow-sm",
                          selected
                            ? "border-primary ring-2 ring-primary/30"
                            : "border-border",
                        )}
                      >
                        {selected && (
                          <span className="absolute right-3 top-3 flex size-5 items-center justify-center rounded-full bg-primary">
                            <Check className="size-3 text-primary-foreground" />
                          </span>
                        )}
                        <div className="flex items-start gap-3">
                          <span className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-muted">
                            <Icon className="size-4 text-muted-foreground" />
                          </span>
                          <div className="flex min-w-0 flex-col gap-1 pr-6">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-sm font-semibold text-foreground">
                                {item.name}
                              </span>
                              {item.badge && (
                                <Badge
                                  variant="secondary"
                                  className="h-5 border border-emerald-100 bg-emerald-50 px-1.5 text-[10px] text-emerald-600"
                                >
                                  {item.badge}
                                </Badge>
                              )}
                            </div>
                            <span className="text-xs text-muted-foreground">
                              {item.description}
                            </span>
                          </div>
                        </div>
                      </button>
                    )
                  })}
                </div>
              </div>

              {values.registrySource === "platform" ? (
                <>
                  <Alert>
                    <Container />
                    <AlertTitle>使用平台镜像仓库</AlertTitle>
                    <AlertDescription className="space-y-2">
                      <p>
                        请先将镜像 push 到平台仓库，再填写下方镜像路径。平台仓库内网拉取，无需额外认证。
                      </p>
                      <code className="block rounded-md bg-muted px-2 py-1.5 font-mono text-[11px] text-muted-foreground">
                        {PLATFORM_REGISTRY.loginHint}
                      </code>
                    </AlertDescription>
                  </Alert>

                  <div className="flex flex-col gap-1.5">
                    <Label>
                      镜像路径 <span className="text-destructive">*</span>
                    </Label>
                    <InputGroup className="h-10">
                      <InputGroupAddon>
                        <InputGroupText className="font-mono text-xs">
                          {PLATFORM_REGISTRY.host}/
                        </InputGroupText>
                      </InputGroupAddon>
                      <InputGroupInput
                        value={values.customImage}
                        onChange={(e) => onChange("customImage", e.target.value)}
                        placeholder="namespace/my-app:latest"
                        className="font-mono text-sm"
                      />
                    </InputGroup>
                    <p className="text-xs text-muted-foreground">
                      格式：命名空间/镜像名:标签，例如{" "}
                      <code className="font-mono">my-team/inference:v1.2</code>
                    </p>
                  </div>
                </>
              ) : (
                <>
                  <Alert>
                    <Globe />
                    <AlertTitle>使用自定义镜像仓库</AlertTitle>
                    <AlertDescription>
                      支持 Docker Hub、GitHub Container Registry、Harbor
                      等。私有仓库需配置登录凭证，凭证加密存储且仅用于镜像拉取。
                    </AlertDescription>
                  </Alert>

                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <div className="flex flex-col gap-1.5">
                      <Label>
                        仓库地址 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={values.registryHost}
                        onChange={(e) => onChange("registryHost", e.target.value)}
                        placeholder="例如 registry.example.com"
                        className="font-mono text-sm"
                      />
                    </div>
                    <div className="flex flex-col gap-1.5">
                      <Label>
                        镜像路径 <span className="text-destructive">*</span>
                      </Label>
                      <Input
                        value={values.customImage}
                        onChange={(e) => onChange("customImage", e.target.value)}
                        placeholder="例如 org/my-app:latest"
                        className="font-mono text-sm"
                      />
                    </div>
                  </div>

                  <div
                    className={cn(
                      "flex flex-col gap-3 rounded-xl border p-4 sm:flex-row sm:items-center sm:justify-between",
                      hasCredentials
                        ? "border-emerald-200 bg-emerald-50/50"
                        : "border-amber-200 bg-amber-50/50",
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <span
                        className={cn(
                          "flex size-9 shrink-0 items-center justify-center rounded-lg",
                          hasCredentials ? "bg-emerald-100" : "bg-amber-100",
                        )}
                      >
                        {hasCredentials ? (
                          <ShieldCheck className="size-4 text-emerald-600" />
                        ) : (
                          <KeyRound className="size-4 text-amber-600" />
                        )}
                      </span>
                      <div className="flex flex-col gap-0.5">
                        <span className="text-sm font-medium text-foreground">
                          {hasCredentials ? "登录凭证已配置" : "需要配置登录凭证"}
                        </span>
                        <span className="text-xs text-muted-foreground">
                          {hasCredentials
                            ? `用户 ${values.registryCredentials!.username} @ ${values.registryHost || "—"}`
                            : "私有仓库必须提供用户名和密码（或访问令牌）才能拉取镜像"}
                        </span>
                      </div>
                    </div>
                    <div className="flex shrink-0 gap-2">
                      {hasCredentials && (
                        <Button
                          type="button"
                          variant="outline"
                          size="sm"
                          onClick={clearCredentials}
                        >
                          清除
                        </Button>
                      )}
                      <Button
                        type="button"
                        size="sm"
                        variant={hasCredentials ? "outline" : "default"}
                        onClick={openCredentialDialog}
                      >
                        <KeyRound className="size-3.5" />
                        {hasCredentials ? "修改凭证" : "配置登录凭证"}
                      </Button>
                    </div>
                  </div>
                </>
              )}

              {resolvedCustomImage && (
                <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                  <span className="text-xs text-muted-foreground">
                    完整镜像地址
                  </span>
                  <code className="mt-0.5 block truncate font-mono text-xs text-foreground">
                    {resolvedCustomImage}
                  </code>
                </div>
              )}

              <div className="flex flex-col gap-1.5">
                <Label>环境变量</Label>
                <Textarea
                  value={values.envVars}
                  onChange={(e) => onChange("envVars", e.target.value)}
                  placeholder={"KEY=value\nANOTHER_KEY=another_value"}
                  rows={4}
                  className="font-mono text-xs"
                />
                <p className="text-xs text-muted-foreground">
                  每行一个环境变量，格式为 KEY=VALUE。
                </p>
              </div>

              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <div className="flex flex-col gap-1.5">
                  <Label>启动命令</Label>
                  <Input
                    value={values.startCommand}
                    onChange={(e) => onChange("startCommand", e.target.value)}
                    placeholder="例如 python app.py --port 8000"
                    className="font-mono text-sm"
                  />
                </div>
                <div className="flex flex-col gap-1.5">
                  <Label>端口暴露</Label>
                  <Input
                    value={values.ports}
                    onChange={(e) => onChange("ports", e.target.value)}
                    placeholder="例如 8000,8080"
                  />
                  <p className="text-xs text-muted-foreground">
                    多个端口用逗号分隔。
                  </p>
                </div>
              </div>

              <div className="flex justify-end">
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  onClick={() => setSaveDialogOpen(true)}
                >
                  <Save className="size-3.5" />
                  保存为模板
                </Button>
              </div>
            </div>
          </TabsContent>
        </Tabs>
      </FormSection>

      <Dialog open={saveDialogOpen} onOpenChange={setSaveDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>保存为模板</DialogTitle>
            <DialogDescription>
              将当前自定义镜像配置保存为模板，便于后续快速复用。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-1.5 py-2">
            <Label>模板名称</Label>
            <Input
              value={templateName}
              onChange={(e) => setTemplateName(e.target.value)}
              placeholder="例如 my-inference-template"
            />
          </div>
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setSaveDialogOpen(false)}
            >
              取消
            </Button>
            <Button type="button" onClick={handleSaveTemplate}>
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={credentialDialogOpen} onOpenChange={setCredentialDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>配置镜像仓库登录凭证</DialogTitle>
            <DialogDescription>
              凭证将加密存储，仅用于 Worker 启动时拉取镜像，不会明文展示。
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-2">
            <div className="flex flex-col gap-1.5">
              <Label>仓库地址</Label>
              <Input
                value={values.registryHost}
                readOnly
                className="bg-muted font-mono text-sm"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                用户名 <span className="text-destructive">*</span>
              </Label>
              <Input
                value={draftUsername}
                onChange={(e) => setDraftUsername(e.target.value)}
                placeholder="仓库用户名或组织名"
                autoComplete="username"
              />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label>
                密码 / 访问令牌 <span className="text-destructive">*</span>
              </Label>
              <div className="relative">
                <Input
                  type={showPassword ? "text" : "password"}
                  value={draftPassword}
                  onChange={(e) => setDraftPassword(e.target.value)}
                  placeholder="密码或 Personal Access Token"
                  autoComplete="current-password"
                  className="pr-10"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword((prev) => !prev)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-muted-foreground hover:text-foreground"
                  aria-label={showPassword ? "隐藏密码" : "显示密码"}
                >
                  {showPassword ? (
                    <EyeOff className="size-4" />
                  ) : (
                    <Eye className="size-4" />
                  )}
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                GitHub / GitLab 等建议使用 Personal Access Token 代替密码。
              </p>
            </div>

            {resolvedCustomImage && (
              <div className="rounded-lg border border-border bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">将拉取镜像</span>
                <code className="mt-0.5 block truncate font-mono text-xs">
                  {resolvedCustomImage}
                </code>
              </div>
            )}
          </div>

          <DialogFooter className="gap-2 sm:justify-between">
            <Button
              type="button"
              variant="outline"
              disabled={testingCredentials}
              onClick={handleTestCredentials}
            >
              {testingCredentials ? "验证中..." : "测试连接"}
            </Button>
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setCredentialDialogOpen(false)}
              >
                取消
              </Button>
              <Button type="button" onClick={handleSaveCredentials}>
                保存凭证
              </Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  )
}
