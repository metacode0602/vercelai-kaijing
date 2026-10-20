/**
 * Seed: base images, base image versions, and application templates
 *
 * Cloud instance images: OS / CUDA / framework images for development & build
 * Serverless images: inference-optimized images for serving
 * Application templates: ready-to-deploy serverless templates
 *
 * Usage:
 *   pnpm --filter @workspace/db run db:seed:images
 *   or: npx tsx packages/db/src/scripts/seed-base-images.ts
 */

import { createId } from "@paralleldrive/cuid2"
import { drizzle } from "drizzle-orm/node-postgres"
import { Pool } from "pg"
import {
  baseImage,
  baseImageVersion,
  applicationTemplate,
  applicationTemplateVersion,
} from "../schema"

const dbUrl =
  process.env.DATABASE_URL ||
  "postgresql://cloud:cloud@localhost:5432/cloud"

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function id() {
  return createId()
}

// ---------------------------------------------------------------------------
// Base Images — Cloud Instance (开发/构建)
// ---------------------------------------------------------------------------

interface BaseImageSeed {
  id: string
  name: string
  displayName: string
  description: string
  category: string
  tags: string[]
  sortOrder: number
  recommendedConfig: Record<string, unknown>
  versions: VersionSeed[]
}

interface VersionSeed {
  versionTag: string
  displayLabel: string
  fullImageRef: string
  cudaVersion?: string
  osVersion?: string
  pythonVersion?: string
  isLatest: boolean
  requiresGPU: boolean
  minGpuMemory?: number
}

const cloudImages: BaseImageSeed[] = [
  // ── OS ──────────────────────────────────────────────
  {
    id: id(),
    name: "ubuntu",
    displayName: "Ubuntu",
    description: "Ubuntu Server 基础镜像，无 CUDA，适用于 CPU 训练、数据处理和通用开发",
    category: "os",
    tags: ["linux", "ubuntu", "cpu"],
    sortOrder: 1,
    recommendedConfig: {},
    versions: [
      {
        versionTag: "24.04",
        displayLabel: "Ubuntu 24.04 LTS",
        fullImageRef: "registry.gongji.cloud/base/ubuntu:24.04",
        osVersion: "Ubuntu 24.04 LTS",
        isLatest: true,
        requiresGPU: false,
      },
      {
        versionTag: "22.04",
        displayLabel: "Ubuntu 22.04 LTS",
        fullImageRef: "registry.gongji.cloud/base/ubuntu:22.04",
        osVersion: "Ubuntu 22.04 LTS",
        isLatest: false,
        requiresGPU: false,
      },
    ],
  },

  // ── CUDA ────────────────────────────────────────────
  {
    id: id(),
    name: "nvidia-cuda",
    displayName: "NVIDIA CUDA",
    description: "NVIDIA CUDA Toolkit 开发环境，适用于自定义构建和编译 CUDA 程序",
    category: "tool",
    tags: ["cuda", "nvidia", "gpu"],
    sortOrder: 10,
    recommendedConfig: {},
    versions: [
      {
        versionTag: "12.8.0-devel-ubuntu24.04",
        displayLabel: "CUDA 12.8 + Ubuntu 24.04",
        fullImageRef: "registry.gongji.cloud/base/nvidia/cuda:12.8.0-devel-ubuntu24.04",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 0,
      },
      {
        versionTag: "12.6.3-devel-ubuntu22.04",
        displayLabel: "CUDA 12.6 + Ubuntu 22.04",
        fullImageRef: "registry.gongji.cloud/base/nvidia/cuda:12.6.3-devel-ubuntu22.04",
        cudaVersion: "12.6",
        osVersion: "Ubuntu 22.04",
        isLatest: false,
        requiresGPU: true,
      },
      {
        versionTag: "12.4.1-devel-ubuntu22.04",
        displayLabel: "CUDA 12.4 + Ubuntu 22.04",
        fullImageRef: "registry.gongji.cloud/base/nvidia/cuda:12.4.1-devel-ubuntu22.04",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        isLatest: false,
        requiresGPU: true,
      },
      {
        versionTag: "12.1.1-devel-ubuntu22.04",
        displayLabel: "CUDA 12.1 + Ubuntu 22.04",
        fullImageRef: "registry.gongji.cloud/base/nvidia/cuda:12.1.1-devel-ubuntu22.04",
        cudaVersion: "12.1",
        osVersion: "Ubuntu 22.04",
        isLatest: false,
        requiresGPU: true,
      },
      {
        versionTag: "11.8.0-devel-ubuntu22.04",
        displayLabel: "CUDA 11.8 + Ubuntu 22.04",
        fullImageRef: "registry.gongji.cloud/base/nvidia/cuda:11.8.0-devel-ubuntu22.04",
        cudaVersion: "11.8",
        osVersion: "Ubuntu 22.04",
        isLatest: false,
        requiresGPU: true,
      },
    ],
  },

  // ── PyTorch ─────────────────────────────────────────
  {
    id: id(),
    name: "pytorch",
    displayName: "PyTorch",
    description: "PyTorch 深度学习框架，预装 CUDA、cuDNN 和常用 Python 包",
    category: "framework",
    tags: ["pytorch", "deep-learning", "cuda", "python"],
    sortOrder: 20,
    recommendedConfig: {
      command: "jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root",
      ports: [8888],
      envVars: { JUPYTER_TOKEN: "" },
      gpu: { type: "", count: 1 },
      scaling: { minInstances: 1, maxInstances: 1 },
    },
    versions: [
      {
        versionTag: "2.7.0-cuda12.8-cudnn9-devel",
        displayLabel: "PyTorch 2.7 + CUDA 12.8",
        fullImageRef: "registry.gongji.cloud/base/pytorch/pytorch:2.7.0-cuda12.8-cudnn9-devel",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        pythonVersion: "3.12",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
      {
        versionTag: "2.6.0-cuda12.6-cudnn9-devel",
        displayLabel: "PyTorch 2.6 + CUDA 12.6",
        fullImageRef: "registry.gongji.cloud/base/pytorch/pytorch:2.6.0-cuda12.6-cudnn9-devel",
        cudaVersion: "12.6",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
      {
        versionTag: "2.5.1-cuda12.4-cudnn9-devel",
        displayLabel: "PyTorch 2.5 + CUDA 12.4",
        fullImageRef: "registry.gongji.cloud/base/pytorch/pytorch:2.5.1-cuda12.4-cudnn9-devel",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
      {
        versionTag: "2.4.0-cuda12.1-cudnn8-devel",
        displayLabel: "PyTorch 2.4 + CUDA 12.1",
        fullImageRef: "registry.gongji.cloud/base/pytorch/pytorch:2.4.0-cuda12.1-cudnn8-devel",
        cudaVersion: "12.1",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
      {
        versionTag: "2.3.1-cuda11.8-cudnn8-devel",
        displayLabel: "PyTorch 2.3 + CUDA 11.8",
        fullImageRef: "registry.gongji.cloud/base/pytorch/pytorch:2.3.1-cuda11.8-cudnn8-devel",
        cudaVersion: "11.8",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.10",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
    ],
  },

  // ── TensorFlow ──────────────────────────────────────
  {
    id: id(),
    name: "tensorflow",
    displayName: "TensorFlow",
    description: "TensorFlow 深度学习框架，预装 CUDA 和常用科学计算库",
    category: "framework",
    tags: ["tensorflow", "deep-learning", "cuda", "python"],
    sortOrder: 30,
    recommendedConfig: {
      command: "jupyter lab --ip=0.0.0.0 --port=8888 --no-browser --allow-root",
      ports: [8888],
      envVars: { JUPYTER_TOKEN: "" },
      gpu: { type: "", count: 1 },
      scaling: { minInstances: 1, maxInstances: 1 },
    },
    versions: [
      {
        versionTag: "2.18.0-cuda12.4-cudnn9",
        displayLabel: "TensorFlow 2.18 + CUDA 12.4",
        fullImageRef: "registry.gongji.cloud/base/tensorflow/tensorflow:2.18.0-gpu-cuda12.4",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
      {
        versionTag: "2.16.2-cuda12.2-cudnn8",
        displayLabel: "TensorFlow 2.16 + CUDA 12.2",
        fullImageRef: "registry.gongji.cloud/base/tensorflow/tensorflow:2.16.2-gpu-cuda12.2",
        cudaVersion: "12.2",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.10",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Base Images — Serverless (推理)
// ---------------------------------------------------------------------------

const serverlessImages: BaseImageSeed[] = [
  // ── vLLM ───────────────────────────────────────────
  {
    id: id(),
    name: "vllm",
    displayName: "vLLM",
    description: "vLLM 高性能 LLM 推理引擎，支持 PagedAttention、连续批处理和张量并行",
    category: "inference",
    tags: ["vllm", "llm", "inference", "openai-api"],
    sortOrder: 100,
    recommendedConfig: {
      command: "python -m vllm.entrypoints.openai.api_server --model $MODEL_NAME --port 8000",
      ports: [8000],
      envVars: { MODEL_NAME: "Qwen/Qwen2.5-7B-Instruct" },
      gpu: { type: "A100-80G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 4 },
    },
    versions: [
      {
        versionTag: "0.8.5-cuda12.8",
        displayLabel: "vLLM 0.8.5 + CUDA 12.8",
        fullImageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        pythonVersion: "3.12",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 16000,
      },
      {
        versionTag: "0.7.3-cuda12.4",
        displayLabel: "vLLM 0.7.3 + CUDA 12.4",
        fullImageRef: "registry.gongji.cloud/inference/vllm:v0.7.3-cuda12.4",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: false,
        requiresGPU: true,
        minGpuMemory: 16000,
      },
    ],
  },

  // ── TensorRT-LLM ───────────────────────────────────
  {
    id: id(),
    name: "tensorrt-llm",
    displayName: "TensorRT-LLM",
    description: "NVIDIA TensorRT-LLM 推理优化引擎，提供极致推理性能",
    category: "inference",
    tags: ["tensorrt", "llm", "inference", "nvidia", "triton"],
    sortOrder: 110,
    recommendedConfig: {
      command: "python -m tensorrt_llm.commands.run_triton_backend --model_repo /model_repo",
      ports: [8000, 8001, 8002],
      envVars: { TRITON_MAX_BATCH_SIZE: "64" },
      gpu: { type: "H100-80G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 4 },
    },
    versions: [
      {
        versionTag: "0.17.0-cuda12.8",
        displayLabel: "TensorRT-LLM 0.17 + CUDA 12.8",
        fullImageRef: "registry.gongji.cloud/inference/tensorrt-llm:0.17.0-cuda12.8",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        pythonVersion: "3.12",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 16000,
      },
    ],
  },

  // ── Ollama ──────────────────────────────────────────
  {
    id: id(),
    name: "ollama",
    displayName: "Ollama",
    description: "Ollama 轻量级本地大模型运行框架，支持 GGUF 格式模型一键部署",
    category: "inference",
    tags: ["ollama", "llm", "inference", "gguf"],
    sortOrder: 120,
    recommendedConfig: {
      command: "ollama serve",
      ports: [11434],
      envVars: { OLLAMA_HOST: "0.0.0.0:11434" },
      gpu: { type: "RTX 4090-24G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 2 },
    },
    versions: [
      {
        versionTag: "0.9.6-cuda12.8",
        displayLabel: "Ollama 0.9.6 + CUDA 12.8",
        fullImageRef: "registry.gongji.cloud/inference/ollama:0.9.6-cuda12.8",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        pythonVersion: "3.12",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 8000,
      },
    ],
  },

  // ── ComfyUI ─────────────────────────────────────────
  {
    id: id(),
    name: "comfyui",
    displayName: "ComfyUI",
    description: "ComfyUI Stable Diffusion 推理框架，支持 Flux/SDXL/SD1.x 工作流",
    category: "inference",
    tags: ["comfyui", "stable-diffusion", "image-generation", "flux"],
    sortOrder: 130,
    recommendedConfig: {
      command: "python main.py --listen 0.0.0.0 --port 8188",
      ports: [8188],
      envVars: { COMFYUI_MODEL_PATH: "/models" },
      gpu: { type: "RTX 4090-24G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 2 },
    },
    versions: [
      {
        versionTag: "0.3.30-cuda12.8",
        displayLabel: "ComfyUI 0.3.30 + CUDA 12.8",
        fullImageRef: "registry.gongji.cloud/inference/comfyui:0.3.30-cuda12.8",
        cudaVersion: "12.8",
        osVersion: "Ubuntu 24.04",
        pythonVersion: "3.12",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 12000,
      },
    ],
  },

  // ── Whisper ─────────────────────────────────────────
  {
    id: id(),
    name: "whisper",
    displayName: "Whisper",
    description: "OpenAI Whisper 语音识别引擎，支持多语言实时转写",
    category: "inference",
    tags: ["whisper", "speech", "recognition", "asr"],
    sortOrder: 140,
    recommendedConfig: {
      command: "python -m whisper.server --model large-v3 --host 0.0.0.0 --port 9000",
      ports: [9000],
      envVars: { WHISPER_MODEL: "large-v3" },
      gpu: { type: "A10-24G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 4 },
    },
    versions: [
      {
        versionTag: "20240930-cuda12.4",
        displayLabel: "Whisper (latest) + CUDA 12.4",
        fullImageRef: "registry.gongji.cloud/inference/whisper:20240930-cuda12.4",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.11",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 6000,
      },
    ],
  },

  // ── SD WebUI ────────────────────────────────────────
  {
    id: id(),
    name: "sd-webui",
    displayName: "Stable Diffusion WebUI",
    description: "AUTOMATIC1111 Stable Diffusion WebUI，支持 txt2img / img2img API",
    category: "inference",
    tags: ["stable-diffusion", "image-generation", "api"],
    sortOrder: 150,
    recommendedConfig: {
      command: "python launch.py --api --listen --port 7860",
      ports: [7860],
      envVars: { COMMANDLINE_ARGS: "--api" },
      gpu: { type: "RTX 4090-24G", count: 1 },
      scaling: { minInstances: 1, maxInstances: 2 },
    },
    versions: [
      {
        versionTag: "1.10.1-cuda12.4",
        displayLabel: "SD WebUI 1.10.1 + CUDA 12.4",
        fullImageRef: "registry.gongji.cloud/inference/sd-webui:1.10.1-cuda12.4",
        cudaVersion: "12.4",
        osVersion: "Ubuntu 22.04",
        pythonVersion: "3.10",
        isLatest: true,
        requiresGPU: true,
        minGpuMemory: 12000,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Application Templates (Serverless 推理模板)
// ---------------------------------------------------------------------------

interface TemplateSeed {
  id: string
  name: string
  description: string
  category: string
  tags: string[]
  imageRef: string
  sourceType: "base_image" | "docker_hub"
  minGPU: string
  minGPUCount: number
  minMemoryGB: number
  minDiskGB: number
  defaultPort: number
  defaultCommand: string
  defaultEnvVars: Record<string, string>
  healthCheckPath: string
  docsUrl: string
  sourceUrl: string
  deployType: "serverless"
  tier: "official"
  sortOrder: number
  isFeatured: boolean
  versions: TemplateVersionSeed[]
}

interface TemplateVersionSeed {
  versionTag: string
  changelog: string
  imageRef: string
  command: string
  envVars: Record<string, string>
  isLatest: boolean
}

const serverlessTemplates: TemplateSeed[] = [
  // ── LLM 推理 ──────────────────────────────────────
  {
    id: id(),
    name: "Qwen2.5 7B Instruct",
    description: "通义千问 Qwen2.5 7B Instruct 对话模型，通过 vLLM 提供 OpenAI 兼容 API",
    category: "llm",
    tags: ["qwen", "7b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 16,
    minDiskGB: 60,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct --port 8000 --max-model-len 32768",
    defaultEnvVars: { MODEL_NAME: "Qwen/Qwen2.5-7B-Instruct" },
    healthCheckPath: "/health",
    docsUrl: "https://qwenlm.github.io",
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-7B-Instruct",
    deployType: "serverless",
    tier: "official",
    sortOrder: 1,
    isFeatured: true,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Qwen2.5-7B-Instruct + vLLM 0.8.5",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-7B-Instruct --port 8000 --max-model-len 32768",
        envVars: { MODEL_NAME: "Qwen/Qwen2.5-7B-Instruct" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "Qwen2.5 32B Instruct",
    description: "通义千问 Qwen2.5 32B Instruct 对话模型，更大参数量，更强推理能力",
    category: "llm",
    tags: ["qwen", "32b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "A100-80G",
    minGPUCount: 1,
    minMemoryGB: 64,
    minDiskGB: 120,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-32B-Instruct --port 8000 --max-model-len 32768 --tensor-parallel-size 2",
    defaultEnvVars: { MODEL_NAME: "Qwen/Qwen2.5-32B-Instruct" },
    healthCheckPath: "/health",
    docsUrl: "https://qwenlm.github.io",
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-32B-Instruct",
    deployType: "serverless",
    tier: "official",
    sortOrder: 2,
    isFeatured: true,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Qwen2.5-32B-Instruct + vLLM 0.8.5 + TP2",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-32B-Instruct --port 8000 --max-model-len 32768 --tensor-parallel-size 2",
        envVars: { MODEL_NAME: "Qwen/Qwen2.5-32B-Instruct" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "Qwen2.5 72B Instruct",
    description: "通义千问 Qwen2.5 72B Instruct 旗舰对话模型，多卡张量并行",
    category: "llm",
    tags: ["qwen", "72b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "A100-80G",
    minGPUCount: 4,
    minMemoryGB: 160,
    minDiskGB: 200,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-72B-Instruct --port 8000 --max-model-len 32768 --tensor-parallel-size 4",
    defaultEnvVars: { MODEL_NAME: "Qwen/Qwen2.5-72B-Instruct" },
    healthCheckPath: "/health",
    docsUrl: "https://qwenlm.github.io",
    sourceUrl: "https://huggingface.co/Qwen/Qwen2.5-72B-Instruct",
    deployType: "serverless",
    tier: "official",
    sortOrder: 3,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Qwen2.5-72B-Instruct + vLLM 0.8.5 + TP4",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model Qwen/Qwen2.5-72B-Instruct --port 8000 --max-model-len 32768 --tensor-parallel-size 4",
        envVars: { MODEL_NAME: "Qwen/Qwen2.5-72B-Instruct" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "Llama 3.1 8B Instruct",
    description: "Meta Llama 3.1 8B Instruct 对话模型，英文能力突出",
    category: "llm",
    tags: ["llama", "meta", "8b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 16,
    minDiskGB: 60,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --port 8000 --max-model-len 32768",
    defaultEnvVars: { MODEL_NAME: "meta-llama/Llama-3.1-8B-Instruct" },
    healthCheckPath: "/health",
    docsUrl: "https://llama.meta.com",
    sourceUrl: "https://huggingface.co/meta-llama/Llama-3.1-8B-Instruct",
    deployType: "serverless",
    tier: "official",
    sortOrder: 4,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Llama-3.1-8B-Instruct + vLLM 0.8.5",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model meta-llama/Llama-3.1-8B-Instruct --port 8000 --max-model-len 32768",
        envVars: { MODEL_NAME: "meta-llama/Llama-3.1-8B-Instruct" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "DeepSeek-V3",
    description: "DeepSeek-V3 MoE 大模型，671B 总参数，37B 激活参数，多卡推理",
    category: "llm",
    tags: ["deepseek", "moe", "671b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "H100-80G",
    minGPUCount: 8,
    minMemoryGB: 320,
    minDiskGB: 500,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model deepseek-ai/DeepSeek-V3 --port 8000 --tensor-parallel-size 8 --max-model-len 8192",
    defaultEnvVars: { MODEL_NAME: "deepseek-ai/DeepSeek-V3" },
    healthCheckPath: "/health",
    docsUrl: "https://github.com/deepseek-ai/DeepSeek-V3",
    sourceUrl: "https://huggingface.co/deepseek-ai/DeepSeek-V3",
    deployType: "serverless",
    tier: "official",
    sortOrder: 5,
    isFeatured: true,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，DeepSeek-V3 + vLLM 0.8.5 + TP8",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model deepseek-ai/DeepSeek-V3 --port 8000 --tensor-parallel-size 8 --max-model-len 8192",
        envVars: { MODEL_NAME: "deepseek-ai/DeepSeek-V3" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "GLM-4 9B Chat",
    description: "智谱 GLM-4 9B Chat 对话模型，中文能力强",
    category: "llm",
    tags: ["glm", "zhipu", "9b", "chat", "openai-api"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 16,
    minDiskGB: 60,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model THUDM/glm-4-9b-chat --port 8000 --max-model-len 8192",
    defaultEnvVars: { MODEL_NAME: "THUDM/glm-4-9b-chat" },
    healthCheckPath: "/health",
    docsUrl: "https://github.com/THUDM/GLM-4",
    sourceUrl: "https://huggingface.co/THUDM/glm-4-9b-chat",
    deployType: "serverless",
    tier: "official",
    sortOrder: 6,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，GLM-4-9B-Chat + vLLM 0.8.5",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model THUDM/glm-4-9b-chat --port 8000 --max-model-len 8192",
        envVars: { MODEL_NAME: "THUDM/glm-4-9b-chat" },
        isLatest: true,
      },
    ],
  },

  // ── Embedding ──────────────────────────────────────
  {
    id: id(),
    name: "BGE-M3 Embedding",
    description: "BAAI BGE-M3 多语言文本向量模型，支持 100+ 语言、8192 token 长度",
    category: "llm",
    tags: ["embedding", "bge", "vector", "rerank"],
    imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 8,
    minDiskGB: 60,
    defaultPort: 8000,
    defaultCommand:
      "python -m vllm.entrypoints.openai.api_server --model BAAI/bge-m3 --port 8000 --task embedding",
    defaultEnvVars: { MODEL_NAME: "BAAI/bge-m3" },
    healthCheckPath: "/health",
    docsUrl: "https://github.com/FlagOpen/FlagEmbedding",
    sourceUrl: "https://huggingface.co/BAAI/bge-m3",
    deployType: "serverless",
    tier: "official",
    sortOrder: 10,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，BGE-M3 + vLLM 0.8.5 embedding 模式",
        imageRef: "registry.gongji.cloud/inference/vllm:v0.8.5-cuda12.8",
        command:
          "python -m vllm.entrypoints.openai.api_server --model BAAI/bge-m3 --port 8000 --task embedding",
        envVars: { MODEL_NAME: "BAAI/bge-m3" },
        isLatest: true,
      },
    ],
  },

  // ── 图像生成 ────────────────────────────────────────
  {
    id: id(),
    name: "Flux.1 Dev",
    description: "Black Forest Labs Flux.1 Dev 文生图模型，高质量图像生成",
    category: "image",
    tags: ["flux", "image-generation", "txt2img"],
    imageRef: "registry.gongji.cloud/inference/comfyui:0.3.30-cuda12.8",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 16,
    minDiskGB: 100,
    defaultPort: 8188,
    defaultCommand: "python main.py --listen 0.0.0.0 --port 8188 --dont-print-server",
    defaultEnvVars: { COMFYUI_MODEL_PATH: "/models" },
    healthCheckPath: "/system_stats",
    docsUrl: "https://github.com/comfyanonymous/ComfyUI",
    sourceUrl: "https://huggingface.co/black-forest-labs/FLUX.1-dev",
    deployType: "serverless",
    tier: "official",
    sortOrder: 20,
    isFeatured: true,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Flux.1 Dev + ComfyUI",
        imageRef: "registry.gongji.cloud/inference/comfyui:0.3.30-cuda12.8",
        command:
          "python main.py --listen 0.0.0.0 --port 8188 --dont-print-server",
        envVars: { COMFYUI_MODEL_PATH: "/models" },
        isLatest: true,
      },
    ],
  },
  {
    id: id(),
    name: "Stable Diffusion XL",
    description: "Stability AI SDXL 1.0 文生图模型，平衡质量与速度",
    category: "image",
    tags: ["sdxl", "image-generation", "txt2img", "stable-diffusion"],
    imageRef: "registry.gongji.cloud/inference/sd-webui:1.10.1-cuda12.4",
    sourceType: "base_image",
    minGPU: "RTX 4090-24G",
    minGPUCount: 1,
    minMemoryGB: 12,
    minDiskGB: 80,
    defaultPort: 7860,
    defaultCommand: "python launch.py --api --listen --port 7860 --xformers",
    defaultEnvVars: { COMMANDLINE_ARGS: "--api --xformers" },
    healthCheckPath: "/sdapi/v1/options",
    docsUrl: "https://github.com/AUTOMATIC1111/stable-diffusion-webui",
    sourceUrl: "https://huggingface.co/stabilityai/stable-diffusion-xl-base-1.0",
    deployType: "serverless",
    tier: "official",
    sortOrder: 21,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，SDXL 1.0 + SD WebUI",
        imageRef: "registry.gongji.cloud/inference/sd-webui:1.10.1-cuda12.4",
        command:
          "python launch.py --api --listen --port 7860 --xformers",
        envVars: { COMMANDLINE_ARGS: "--api --xformers" },
        isLatest: true,
      },
    ],
  },

  // ── 语音 ────────────────────────────────────────────
  {
    id: id(),
    name: "Whisper Large-v3",
    description: "OpenAI Whisper Large-v3 语音识别模型，支持中英日韩等 99 种语言",
    category: "audio",
    tags: ["whisper", "speech", "asr", "transcription"],
    imageRef: "registry.gongji.cloud/inference/whisper:20240930-cuda12.4",
    sourceType: "base_image",
    minGPU: "A10-24G",
    minGPUCount: 1,
    minMemoryGB: 6,
    minDiskGB: 60,
    defaultPort: 9000,
    defaultCommand:
      "python -m whisper.server --model large-v3 --host 0.0.0.0 --port 9000",
    defaultEnvVars: { WHISPER_MODEL: "large-v3" },
    healthCheckPath: "/health",
    docsUrl: "https://github.com/openai/whisper",
    sourceUrl: "https://huggingface.co/openai/whisper-large-v3",
    deployType: "serverless",
    tier: "official",
    sortOrder: 30,
    isFeatured: false,
    versions: [
      {
        versionTag: "v1.0",
        changelog: "初始版本，Whisper Large-v3 + CUDA 12.4",
        imageRef: "registry.gongji.cloud/inference/whisper:20240930-cuda12.4",
        command:
          "python -m whisper.server --model large-v3 --host 0.0.0.0 --port 9000",
        envVars: { WHISPER_MODEL: "large-v3" },
        isLatest: true,
      },
    ],
  },
]

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  const pool = new Pool({ connectionString: dbUrl })
  const db = drizzle({ client: pool, logger: false })

  try {
    // ── 1. Base Images ──────────────────────────────
    const allImages = [...cloudImages, ...serverlessImages]
    let imageCount = 0

    for (const img of allImages) {
      await db
        .insert(baseImage)
        .values({
          id: img.id,
          name: img.name,
          displayName: img.displayName,
          description: img.description,
          category: img.category,
          tags: img.tags,
          sortOrder: img.sortOrder,
          recommendedConfig: img.recommendedConfig,
          status: "active",
        })
        .onConflictDoNothing()
      imageCount++

      // Versions
      for (const v of img.versions) {
        await db
          .insert(baseImageVersion)
          .values({
            id: id(),
            baseImageId: img.id,
            versionTag: v.versionTag,
            displayLabel: v.displayLabel,
            fullImageRef: v.fullImageRef,
            cudaVersion: v.cudaVersion ?? null,
            osVersion: v.osVersion ?? null,
            pythonVersion: v.pythonVersion ?? null,
            requiresGPU: v.requiresGPU,
            minGpuMemory: v.minGpuMemory ?? null,
            isLatest: v.isLatest,
            status: "active",
          })
          .onConflictDoNothing()
      }
    }

    console.log(`✅ 基础镜像: ${imageCount} 个镜像, ${allImages.reduce((s, i) => s + i.versions.length, 0)} 个版本`)

    // ── 2. Application Templates ────────────────────
    let templateCount = 0

    for (const tpl of serverlessTemplates) {
      await db
        .insert(applicationTemplate)
        .values({
          id: tpl.id,
          name: tpl.name,
          description: tpl.description,
          category: tpl.category,
          tags: tpl.tags,
          imageRef: tpl.imageRef,
          sourceType: tpl.sourceType,
          minGPU: tpl.minGPU,
          minGPUCount: tpl.minGPUCount,
          minMemoryGB: tpl.minMemoryGB,
          minDiskGB: tpl.minDiskGB,
          defaultPort: tpl.defaultPort,
          defaultCommand: tpl.defaultCommand,
          defaultEnvVars: tpl.defaultEnvVars,
          healthCheckPath: tpl.healthCheckPath,
          docsUrl: tpl.docsUrl,
          sourceUrl: tpl.sourceUrl,
          deployType: tpl.deployType,
          tier: tpl.tier,
          sortOrder: tpl.sortOrder,
          isFeatured: tpl.isFeatured,
          reviewStatus: "approved",
          status: "active",
        })
        .onConflictDoNothing()
      templateCount++

      // Template versions
      for (const v of tpl.versions) {
        await db
          .insert(applicationTemplateVersion)
          .values({
            id: id(),
            templateId: tpl.id,
            versionTag: v.versionTag,
            changelog: v.changelog,
            imageRef: v.imageRef,
            command: v.command,
            envVars: v.envVars,
            isLatest: v.isLatest,
            status: "active",
          })
          .onConflictDoNothing()
      }
    }

    console.log(`✅ 应用模板: ${templateCount} 个模板, ${serverlessTemplates.reduce((s, t) => s + t.versions.length, 0)} 个版本`)

    console.log("\n🎉 镜像与模板种子数据初始化完成")
  } catch (error) {
    console.error("\n❌ 初始化失败：", error)
    process.exit(1)
  } finally {
    await pool.end()
  }
}

main().catch((err) => {
  console.error("未捕获的错误：", err)
  process.exit(1)
})
