import type { SandboxOverviewPageData } from "./types"

const PYTHON_INSTALL_CODE = "pip install gpurun-sandbox"

const JS_INSTALL_CODE = "npm install @gpurun/sandbox"

const PYTHON_AGENT_CODE = `# main.py

from gpurun_sandbox.code_interpreter import Sandbox

# create sandbox
sandbox = Sandbox.create()
execution = sandbox.run_code("print('hello world')")
print(execution.logs)

# Close sandbox when no longer needed
sandbox.kill()`

const JS_AGENT_CODE = `// index.ts
import { Sandbox } from "@gpurun/sandbox"

const sandbox = await Sandbox.create()
const execution = await sandbox.runCode("console.log('hello world')")
console.log(execution.logs)

await sandbox.kill()`

const PYTHON_RUN_COMMAND = `export GPURUN_API_KEY=sk_***
python3 main.py`

const JS_RUN_COMMAND = `export GPURUN_API_KEY=sk_***
npx tsx index.ts`

/** 演示数据；接入 API 后替换为真实数据源 */
const MOCK_SANDBOX_OVERVIEW_DATA: SandboxOverviewPageData = {
  hero: {
    title: "使用 GPURun Sandbox 构建有状态 Agent",
    features: [
      "在安全的云沙盒中运行 AI 生成的代码、工具和浏览器",
      "从一个沙盒扩展到数千个沙盒，用于编码、数据分析和 RL 工作负载",
      "零基础设施管理",
    ],
    actions: [
      {
        id: "docs",
        label: "文档",
        href: "/console/docs",
        variant: "primary",
      },
      {
        id: "cli-reference",
        label: "CLI 参考",
        href: "/console/docs",
        variant: "outline",
      },
    ],
  },
  steps: [
    {
      id: "create-api-key",
      stepNumber: 1,
      title: "创建 API KEY",
      actions: [
        {
          id: "manage-keys",
          label: "前往密钥管理",
          href: "/console/settings",
          variant: "outline",
        },
        {
          id: "add-api-key",
          label: "添加 API Key",
          variant: "inverse",
        },
      ],
    },
    {
      id: "install-sdk",
      stepNumber: 2,
      title: "安装 SDK",
      description: "你可以通过执行以下命令来安装 SDK。",
      codeSections: [
        {
          id: "install-sdk",
          defaultTabId: "python",
          tabs: [
            { id: "python", label: "Python", code: PYTHON_INSTALL_CODE },
            {
              id: "javascript",
              label: "JavaScript & TypeScript SDK",
              code: JS_INSTALL_CODE,
            },
          ],
        },
      ],
    },
    {
      id: "launch-agent",
      stepNumber: 3,
      title: "使用 SDK 启动 Agent 沙盒",
      description:
        "以下是一个简单示例，展示如何通过 SDK 创建沙盒并运行指定命令。",
      codeSections: [
        {
          id: "agent-example",
          defaultTabId: "python",
          tabs: [
            { id: "python", label: "Python", code: PYTHON_AGENT_CODE },
            {
              id: "javascript",
              label: "JavaScript & TypeScript",
              code: JS_AGENT_CODE,
            },
          ],
        },
      ],
      runCommandHint: "执行以下命令以运行上述代码。",
      runCommand: {
        id: "run-command",
        defaultTabId: "main-py",
        tabs: [
          { id: "main-py", label: "main.py", code: PYTHON_RUN_COMMAND },
          { id: "index-ts", label: "index.ts", code: JS_RUN_COMMAND },
        ],
      },
    },
  ],
}

export async function getSandboxOverviewPageData(): Promise<SandboxOverviewPageData> {
  return MOCK_SANDBOX_OVERVIEW_DATA
}
