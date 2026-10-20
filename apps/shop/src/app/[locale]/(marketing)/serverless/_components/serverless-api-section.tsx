"use client"

import { SectionLabel } from "../../_components/section-label"
import { Button } from "@workspace/ui/components/button"
import { useState } from "react"

const codeExamples = {
  python: `import requests

# 创建 GPU 实例
response = requests.post(
    "https://api.gpurun.cn/v1/instances",
    headers={"Authorization": f"Bearer {api_key}"},
    json={
        "gpu_type": "RTX_4090",
        "image": "pytorch/pytorch:2.0.1-cuda11.8-cudnn8-runtime",
        "count": 1
    }
)

instance = response.json()
print(f"实例已创建: {instance['id']}")`,
  nodejs: `const axios = require('axios');

// 创建 GPU 实例
const response = await axios.post(
  'https://api.gpurun.cn/v1/instances',
  {
    gpu_type: 'RTX_4090',
    image: 'pytorch/pytorch:2.0.1-cuda11.8-cudnn8-runtime',
    count: 1
  },
  {
    headers: { Authorization: \`Bearer \${apiKey}\` }
  }
);

const instance = response.data;
console.log(\`实例已创建: \${instance.id}\`);`,
  go: `package main

import (
    "bytes"
    "encoding/json"
    "net/http"
)

// 创建 GPU 实例
payload := map[string]interface{}{
    "gpu_type": "RTX_4090",
    "image": "pytorch/pytorch:2.0.1-cuda11.8-cudnn8-runtime",
    "count": 1,
}

body, _ := json.Marshal(payload)
req, _ := http.NewRequest("POST", "https://api.gpurun.cn/v1/instances", bytes.NewBuffer(body))
req.Header.Set("Authorization", "Bearer "+apiKey)
req.Header.Set("Content-Type", "application/json")

client := &http.Client{}
resp, _ := client.Do(req)`,
}

export function ServerlessApiSection() {
  const [activeTab, setActiveTab] = useState<keyof typeof codeExamples>("python")

  return (
    <section className="marketing-section-alt">
      <div className="marketing-container">
        <SectionLabel>开发者 API</SectionLabel>

        <div className="mt-6 flex flex-col gap-4 py-4">
          <h2 className="marketing-heading">使用我们简单的 APIs 进行开发</h2>
          <p className="marketing-subheading">
            使用我们全面的 APIs 轻松管理您的工作流。直接从您的代码快速启动、终止或重启实例
          </p>
        </div>

        <div className="mt-12 glass-panel overflow-hidden">
          <div className="border-b border-border/30 bg-muted/30 px-4 py-3">
            <div className="flex gap-2">
              {Object.keys(codeExamples).map((lang) => (
                <Button
                  key={lang}
                  variant={activeTab === lang ? "default" : "ghost"}
                  size="sm"
                  className="rounded-md"
                  onClick={() => setActiveTab(lang as keyof typeof codeExamples)}
                >
                  {lang === "python" ? "Python" : lang === "nodejs" ? "Node.js" : "Go"}
                </Button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto bg-card/80 p-6">
            <pre className="text-sm text-foreground">
              <code>{codeExamples[activeTab]}</code>
            </pre>
          </div>
        </div>
      </div>
    </section>
  )
}
