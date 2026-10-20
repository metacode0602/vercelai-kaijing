"use client"

import { useRef } from "react"
import { KeyRound, Terminal, Upload } from "lucide-react"
import { toast } from "sonner"
import { Button } from "@workspace/ui/components/button"
import { Label } from "@workspace/ui/components/label"
import { Input } from "@workspace/ui/components/input"
import { Switch } from "@workspace/ui/components/switch"
import { Textarea } from "@workspace/ui/components/textarea"

const ACCEPTED_KEY_EXTENSIONS = [".pub", ".txt"]
const MAX_KEY_FILE_SIZE = 8 * 1024

export interface SshAccessValues {
  sshEnabled: boolean
  sshKey: string
  ports: string
}

export interface SshAccessStepProps {
  values: SshAccessValues
  onChange: <K extends keyof SshAccessValues>(
    key: K,
    value: SshAccessValues[K],
  ) => void
}

function isAcceptedKeyFile(file: File) {
  const lowerName = file.name.toLowerCase()
  return (
    ACCEPTED_KEY_EXTENSIONS.some((ext) => lowerName.endsWith(ext)) ||
    file.type.startsWith("text/")
  )
}

function normalizePublicKey(content: string) {
  const line = content
    .split(/\r?\n/)
    .map((item) => item.trim())
    .find((item) => item.length > 0 && !item.startsWith("#"))

  return line?.trim() ?? ""
}

export function SshAccessStep({ values, onChange }: SshAccessStepProps) {
  const fileInputRef = useRef<HTMLInputElement>(null)

  function handleUploadClick() {
    fileInputRef.current?.click()
  }

  function handleFileChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0]
    event.target.value = ""

    if (!file) return

    if (!isAcceptedKeyFile(file)) {
      toast.error("请上传 .pub 或 .txt 格式的公钥文件")
      return
    }

    if (file.size > MAX_KEY_FILE_SIZE) {
      toast.error("公钥文件过大，请确认文件内容是否正确")
      return
    }

    const reader = new FileReader()
    reader.onload = () => {
      const content = typeof reader.result === "string" ? reader.result : ""
      const publicKey = normalizePublicKey(content)

      if (!publicKey) {
        toast.error("未能从文件中读取有效公钥")
        return
      }

      if (
        !publicKey.startsWith("ssh-") &&
        !publicKey.startsWith("ecdsa-") &&
        !publicKey.startsWith("sk-")
      ) {
        toast.error("文件内容不像有效的 SSH 公钥")
        return
      }

      onChange("sshKey", publicKey)
      toast.success(`已导入公钥：${file.name}`)
    }
    reader.onerror = () => {
      toast.error("读取公钥文件失败，请重试")
    }
    reader.readAsText(file)
  }

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <Label className="w-24 shrink-0 pt-1 text-sm font-bold">SSH:</Label>
        <div className="min-w-0 flex-1 space-y-3">
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border/80 bg-card px-3 py-2.5">
            <div className="flex items-center gap-3">
              <Terminal className="size-4 shrink-0 text-primary" />
              <div>
                <p className="text-sm font-medium">启用 SSH</p>
                <p className="text-xs text-muted-foreground">
                启用 SSH 远程连接，部署后可使用公钥登录实例终端
                </p>
              </div>
            </div>
            <Switch
              checked={values.sshEnabled}
              onCheckedChange={(checked) => onChange("sshEnabled", checked)}
            />
          </div>

          {values.sshEnabled && (
            <div className="space-y-1.5 sm:max-w-lg">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <Label className="flex items-center gap-1.5 text-sm font-medium">
                  <KeyRound className="size-3.5 text-muted-foreground" />
                  SSH 公钥
                </Label>
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5"
                  onClick={handleUploadClick}
                >
                  <Upload className="size-3.5" />
                  上传公钥文件
                </Button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pub,.txt,text/plain"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              <Textarea
                value={values.sshKey}
                onChange={(event) => onChange("sshKey", event.target.value)}
                placeholder="ssh-ed25519 AAAAC3NzaC1lZDI1... user@host"
                rows={3}
                className="font-mono text-xs"
              />
              <p className="text-xs text-muted-foreground">
                粘贴公钥或上传 <code className="rounded bg-muted px-1">.pub</code>{" "}
                文件（如 ~/.ssh/id_ed25519.pub），部署后可使用{" "}
                <code className="rounded bg-muted px-1">ssh root@&lt;ip&gt;</code>{" "}
                连接。
              </p>
            </div>
          )}
        </div>
      </div>

      <div className="flex flex-col gap-2 sm:flex-row sm:items-start sm:gap-3">
        <Label className="w-24 shrink-0 pt-1 text-sm font-bold">暴露端口:</Label>
        <div className="w-full space-y-1.5 sm:max-w-lg">
          <Input
            value={values.ports}
            onChange={(event) => onChange("ports", event.target.value)}
            placeholder="8888,22"
          />
          <p className="text-xs text-muted-foreground">
            HTTP/TCP 端口，逗号分隔。常用 8888（Jupyter）、22（SSH）。
          </p>
        </div>
      </div>
    </div>
  )
}
