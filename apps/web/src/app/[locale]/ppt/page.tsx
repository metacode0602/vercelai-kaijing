"use client"

import { Badge } from "@workspace/ui/components/badge"
import { Button } from "@workspace/ui/components/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@workspace/ui/components/card"
import { Progress } from "@workspace/ui/components/progress"
import { Separator } from "@workspace/ui/components/separator"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"
import { cn } from "@workspace/ui/lib/utils"
import { IconChevronLeft, IconChevronRight } from "@tabler/icons-react"
import { useCallback, useEffect, useState } from "react"

const SLIDES = [
  {
    title: "用 Cursor 生成 Agent Skill",
    description: "让 AI 记住你的 API 和工作流 · 一次编写，反复自动调用",
    content: (
      <div className="space-y-6">
        <div className="flex flex-wrap gap-2">
          <Badge variant="secondary">开发者</Badge>
          <Badge variant="outline">10–15 分钟</Badge>
          <Badge variant="outline">5 页</Badge>
        </div>

        <div className="space-y-2 text-sm">
          <p className="font-medium">Skill 是什么？</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground">
            <li>带 SKILL.md 的文件夹，教 Agent 何时启用、如何操作</li>
            <li>比每次粘贴 API 文档更稳定、更省 token</li>
          </ul>
        </div>

        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Skill</TableHead>
              <TableHead>用途</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            <TableRow>
              <TableCell className="font-mono text-xs">suanli-job</TableCell>
              <TableCell>Job 批处理：创建 / 查询 / 停止 / 计费</TableCell>
            </TableRow>
            <TableRow>
              <TableCell className="font-mono text-xs">suanli-deployment</TableCell>
              <TableCell>弹性部署：创建 / 暂停 / 恢复 / 节点管理</TableCell>
            </TableRow>
          </TableBody>
        </Table>

        <p className="text-muted-foreground text-sm">
          适合：重复调用的 Open API、固定审批流程、团队统一输出格式
        </p>
      </div>
    ),
  },
  {
    title: "准备材料",
    description: "对话前先想清楚边界与资料",
    content: (
      <div className="space-y-5">
        {[
          {
            step: "1",
            title: "明确 Skill 边界",
            items: [
              "做什么：通过 Open API 发 Job、查状态、查账单",
              "何时触发：在 description 写清关键词（Job、suanli、发任务…）",
              "放哪里：.cursor/skills/（项目）或 ~/.cursor/skills/（个人）",
            ],
          },
          {
            step: "2",
            title: "收集原始资料",
            items: [
              "官方 API 文档（路径、请求体、响应、错误码）",
              "鉴权方式（简易模式 SUANLI_TOKEN，无需 RSA 加签）",
              "计费规则与业务术语（点 ↔ 元、出账周期）",
            ],
          },
          {
            step: "3",
            title: "在 Cursor 里 @ 上下文",
            items: [],
          },
        ].map((section) => (
          <div key={section.step} className="space-y-2">
            <div className="flex items-center gap-2">
              <Badge>{section.step}</Badge>
              <span className="font-medium text-sm">{section.title}</span>
            </div>
            {section.items.length > 0 ? (
              <ul className="ml-8 list-inside list-disc space-y-1 text-muted-foreground text-sm">
                {section.items.map((item) => (
                  <li key={item}>{item}</li>
                ))}
              </ul>
            ) : (
              <pre className="ml-8 overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs">
                {`@apps/docs/content/skills\n请根据共绩算力 Job API 文档，帮我创建一个 Cursor Agent Skill`}
              </pre>
            )}
          </div>
        ))}

        <p className="text-muted-foreground text-sm">
          资料越完整结果越准；不确定的字段让 AI 列出待确认项，不要猜。
        </p>
      </div>
    ),
  },
  {
    title: "与 Cursor 对话",
    description: "按 create-skill 流程，四阶段生成",
    content: (
      <div className="space-y-5">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-24">阶段</TableHead>
              <TableHead>你要说什么</TableHead>
              <TableHead>AI 产出</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {[
              ["① 需求发现", "用途、触发场景、存放路径", "确认 skill 名称"],
              ["② 设计", "description 写「做什么 + 何时用」", "目录结构草案"],
              ["③ 实现", "生成 SKILL.md 和 api 子文档", "完整文件树"],
              ["④ 验证", "检查 description、术语一致性", "修订与 checklist"],
            ].map(([phase, input, output]) => (
              <TableRow key={phase}>
                <TableCell className="font-medium text-xs">{phase}</TableCell>
                <TableCell className="text-sm">{input}</TableCell>
                <TableCell className="text-muted-foreground text-sm">{output}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        <div className="space-y-2">
          <p className="font-medium text-sm">推荐目录结构</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
            {`suanli-job/
├── SKILL.md          # 鉴权、计费、端点速查
├── README.md         # 安装与快速验证
├── scripts/call.sh   # 通用 curl 脚本
└── api/              # 接口字段详情`}
          </pre>
        </div>
      </div>
    ),
  },
  {
    title: "人工审校",
    description: "生成后必查 5 项",
    content: (
      <div className="space-y-4">
        {[
          {
            title: "description 是否够具体",
            detail: "含触发词；第三人称；说明 WHAT + WHEN",
          },
          {
            title: "SKILL.md 是否精简",
            detail: "核心放主文件；详细字段拆到 api/*.md（< 500 行）",
          },
          {
            title: "脚本是否可复用",
            detail: "call.sh 统一 token、timestamp、curl",
          },
          {
            title: "术语与公式一致",
            detail: "1 元 = 1,000,000 点；暂停 vs 删除措辞统一",
          },
          {
            title: "敏感信息不入库",
            detail: "密钥放 .env，加入 .gitignore",
          },
        ].map((item, index) => (
          <div key={item.title} className="flex gap-3">
            <Badge variant="outline" className="mt-0.5 shrink-0">
              {index + 1}
            </Badge>
            <div>
              <p className="font-medium text-sm">{item.title}</p>
              <p className="text-muted-foreground text-sm">{item.detail}</p>
            </div>
          </div>
        ))}

        <Separator />

        <blockquote className="border-muted-foreground/30 border-l-2 pl-4 text-muted-foreground text-sm italic">
          「把暂停和删除的区别写进 SKILL.md，Agent 操作删除前要二次确认」
        </blockquote>
      </div>
    ),
  },
  {
    title: "安装验证 + 日常使用",
    description: "复制目录、配置凭证、开始对话",
    content: (
      <div className="space-y-5">
        <div className="space-y-2">
          <p className="font-medium text-sm">安装</p>
          <pre className="overflow-x-auto rounded-lg bg-muted p-3 font-mono text-xs leading-relaxed">
            {`cp -r apps/docs/content/skills/suanli-job/ .cursor/skills/suanli-job/
echo 'SUANLI_TOKEN="<密钥>"' > .cursor/skills/suanli-job/.env
set -a && source .cursor/skills/suanli-job/.env && set +a`}
          </pre>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-sm">日常对话示例</p>
          <ul className="list-inside list-disc space-y-1 text-muted-foreground text-sm">
            <li>「用 suanli-job 查当前 Running 的任务列表」</li>
            <li>「创建 Spot Job，任务总数 100，并发 10」</li>
            <li>「查 task_id 过去 7 天的计费」</li>
          </ul>
        </div>

        <div className="space-y-2">
          <p className="font-medium text-sm">完成 checklist</p>
          <div className="grid gap-2 sm:grid-cols-2">
            {[
              "SKILL.md frontmatter 完整",
              "api/ 与 scripts/ 链接有效",
              "README 有 .env 说明",
              "call.sh 验证通过",
              "凭证未进入版本库",
            ].map((item) => (
              <div key={item} className="flex items-center gap-2 text-sm">
                <span className="size-1.5 shrink-0 rounded-full bg-primary" />
                {item}
              </div>
            ))}
          </div>
        </div>
      </div>
    ),
  },
] as const

export default function PptPage() {
  const [index, setIndex] = useState(0)
  const slide = SLIDES[Math.min(index, SLIDES.length - 1)]!
  const progress = ((index + 1) / SLIDES.length) * 100

  const goPrev = useCallback(() => {
    setIndex((i) => Math.max(0, i - 1))
  }, [])

  const goNext = useCallback(() => {
    setIndex((i) => Math.min(SLIDES.length - 1, i + 1))
  }, [])

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "ArrowLeft") goPrev()
      if (e.key === "ArrowRight") goNext()
    }
    window.addEventListener("keydown", onKeyDown)
    return () => window.removeEventListener("keydown", onKeyDown)
  }, [goPrev, goNext])

  return (
    <div className="flex min-h-svh flex-col bg-background">
      <header className="mx-auto w-full max-w-3xl px-4 pt-8 pb-4">
        <div className="mb-3 flex items-center justify-between text-muted-foreground text-sm">
          <span>Cursor 生成 Skill </span>
          <span>
            {index + 1} / {SLIDES.length}
          </span>
        </div>
        <Progress value={progress} className="h-1" />
      </header>

      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col px-4 pb-8">
        <Card className="flex flex-1 flex-col shadow-sm">
          <CardHeader className="pb-4">
            <CardTitle className="text-2xl">{slide.title}</CardTitle>
            <CardDescription>{slide.description}</CardDescription>
          </CardHeader>
          <CardContent className="flex-1">{slide.content}</CardContent>
        </Card>

        <div className="mt-6 flex items-center justify-between">
          <Button variant="outline" size="sm" onClick={goPrev} disabled={index === 0}>
            <IconChevronLeft className="size-4" />
            上一页
          </Button>

          <div className="flex gap-1.5">
            {SLIDES.map((_, i) => (
              <button
                key={i}
                type="button"
                aria-label={`第 ${i + 1} 页`}
                onClick={() => setIndex(i)}
                className={cn(
                  "size-2 rounded-full transition-colors",
                  i === index ? "bg-primary" : "bg-muted hover:bg-muted-foreground/30"
                )}
              />
            ))}
          </div>

          <Button variant="outline" size="sm" onClick={goNext} disabled={index === SLIDES.length - 1}>
            下一页
            <IconChevronRight className="size-4" />
          </Button>
        </div>
      </main>
    </div>
  )
}
