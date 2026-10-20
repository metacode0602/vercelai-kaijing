export type TemplateCategory = "llm" | "image" | "video" | "audio"

export interface Template {
  slug: string
  category: TemplateCategory
  title: string
  summary: string
  longDescription: string
  features: string[]
  recommendedGpu: string
  tags: string[]
  deployHref: string
  softwareVersions?: Record<string, string>
  ports?: string[]
  usageExample?: string
}

export interface TemplateParameter {
  label: string
  value: string
}

export interface TemplateDetails {
  parameters: TemplateParameter[]
  input: string[]
  output: string[]
  usageExample: string
}

type TemplateDetailOverride = Partial<Omit<TemplateDetails, "parameters">> & {
  parameters?: TemplateParameter[]
}

export const templates: Template[] = [
  // LLM Templates
  {
    slug: "ollama",
    category: "llm",
    title: "Ollama",
    summary: "在本地运行大型语言模型，支持 Llama、Mistral 等主流开源模型",
    longDescription:
      "Ollama 是一个轻量级、可扩展的框架，用于在本地构建和运行大型语言模型。它提供了简单的 API 和命令行工具，让你能够轻松地下载、运行和管理各种开源 LLM 模型。Ollama 支持自动 GPU 加速，优化了模型加载和推理性能，非常适合开发和测试场景。",
    features: [
      "支持 Llama 3、Mistral、Gemma 等主流开源模型",
      "简洁的 REST API 和 Python/JavaScript SDK",
      "自动 GPU 加速和内存管理",
      "模型热加载和版本控制",
      "低延迟推理，适合实时应用",
    ],
    recommendedGpu: "RTX 4090 或 A100",
    tags: ["LLM", "推理", "OpenAI 兼容"],
    deployHref: "/console",
    softwareVersions: { ollama: "0.1.27", cuda: "12.1" },
    ports: ["11434"],
    usageExample:
      'curl http://localhost:11434/api/generate -d \'{"model":"llama3","prompt":"Hello"}\'',
  },
  {
    slug: "vllm",
    category: "llm",
    title: "vLLM",
    summary: "高性能 LLM 推理引擎，支持 PagedAttention 和连续批处理",
    longDescription:
      "vLLM 是一个快速且易用的大型语言模型推理和服务库，采用了 PagedAttention 技术大幅提升显存利用率和吞吐量。它兼容 OpenAI API，支持连续批处理和流式输出，非常适合高并发的生产环境部署。",
    features: [
      "PagedAttention 优化显存使用",
      "支持连续批处理，提升吞吐量",
      "OpenAI API 兼容接口",
      "支持量化模型（AWQ、GPTQ）",
      "多 GPU 张量并行推理",
    ],
    recommendedGpu: "A100 或 H100",
    tags: ["LLM", "高性能推理", "OpenAI 兼容"],
    deployHref: "/console",
    softwareVersions: { vllm: "0.3.0", python: "3.10", cuda: "12.1" },
    ports: ["8000"],
    usageExample:
      'curl http://localhost:8000/v1/completions -d \'{"model":"meta-llama/Llama-2-7b","prompt":"Hello"}\'',
  },
  {
    slug: "open-webui",
    category: "llm",
    title: "Open WebUI",
    summary: "功能丰富的 LLM Web 界面，支持本地和远程模型",
    longDescription:
      "Open WebUI（原 Ollama WebUI）是一个功能强大、可扩展的 Web 界面，用于与大型语言模型交互。它提供了类似 ChatGPT 的用户体验，支持 Ollama、OpenAI API 等多种后端，内置聊天历史、提示词管理、文档上传等功能。",
    features: [
      "现代化的聊天界面",
      "支持 Ollama、OpenAI 等多种后端",
      "内置 RAG（检索增强生成）",
      "提示词模板管理",
      "支持文档上传和解析",
      "多用户和权限管理",
    ],
    recommendedGpu: "RTX 3090 或更高",
    tags: ["LLM", "Web UI", "RAG"],
    deployHref: "/console",
    softwareVersions: { "open-webui": "0.1.105", node: "20" },
    ports: ["3000"],
  },
  {
    slug: "text-generation-inference",
    category: "llm",
    title: "Text Generation Inference",
    summary: "HuggingFace 官方 LLM 推理服务器，优化生产部署",
    longDescription:
      "Text Generation Inference (TGI) 是 HuggingFace 开发的高性能 LLM 推理服务器。它针对 Transformer 模型进行了深度优化，支持张量并行、Flash Attention、动态批处理等技术，为生产环境提供稳定可靠的推理服务。",
    features: [
      "Flash Attention 和 Paged Attention",
      "张量并行多 GPU 推理",
      "动态批处理优化吞吐量",
      "支持量化和推测解码",
      "gRPC 和 REST API",
      "与 HuggingFace Hub 无缝集成",
    ],
    recommendedGpu: "A100 或 H100",
    tags: ["LLM", "HuggingFace", "推理"],
    deployHref: "/console",
    softwareVersions: { tgi: "1.4.2", cuda: "12.1" },
    ports: ["8080"],
  },
  {
    slug: "llama-cpp",
    category: "llm",
    title: "llama.cpp",
    summary: "高效的 CPU/GPU LLM 推理引擎，支持量化模型",
    longDescription:
      "llama.cpp 是用 C++ 编写的高性能 LLM 推理库，支持 CPU 和 GPU 加速。它专注于效率和可移植性，支持 4-bit、5-bit、8-bit 等多种量化格式，让你能够在有限的硬件资源上运行大型模型。",
    features: [
      "纯 C++ 实现，高性能低延迟",
      "支持 4-bit/5-bit/8-bit 量化",
      "CPU 和 GPU（CUDA、Metal）加速",
      "支持 GGUF 格式模型",
      "OpenAI 兼容 HTTP 服务器",
    ],
    recommendedGpu: "RTX 4080 或更高（也支持 CPU）",
    tags: ["LLM", "量化", "CPU/GPU"],
    deployHref: "/console",
    softwareVersions: { "llama.cpp": "b2024", cuda: "12.1" },
    ports: ["8080"],
  },

  // Image Templates
  {
    slug: "comfyui",
    category: "image",
    title: "ComfyUI",
    summary: "强大的 Stable Diffusion 节点式工作流界面",
    longDescription:
      "ComfyUI 是一个基于节点的 Stable Diffusion Web 界面，提供了高度灵活和可视化的图像生成工作流。你可以通过拖拽节点来构建复杂的图像生成流程，支持 ControlNet、LoRA、自定义模型等高级功能。",
    features: [
      "可视化节点工作流编辑器",
      "支持 SDXL、SD 1.5 等主流模型",
      "内置 ControlNet、LoRA 支持",
      "自定义节点扩展生态",
      "批量生成和队列管理",
      "API 接口支持自动化",
    ],
    recommendedGpu: "RTX 4090 或 A100",
    tags: ["图像生成", "Stable Diffusion", "工作流"],
    deployHref: "/console",
    softwareVersions: { comfyui: "latest", python: "3.10", cuda: "12.1" },
    ports: ["8188"],
  },
  {
    slug: "stable-diffusion-webui",
    category: "image",
    title: "Stable Diffusion WebUI",
    summary: "最流行的 Stable Diffusion Web 界面，功能全面",
    longDescription:
      "Stable Diffusion WebUI（也称 AUTOMATIC1111）是社区最流行的 Stable Diffusion Web 界面。它提供了完整的图像生成功能、丰富的扩展插件、强大的模型管理和训练工具，是创作者的首选工具。",
    features: [
      "完整的 Txt2Img 和 Img2Img 功能",
      "支持 SDXL、SD 2.x、SD 1.5",
      "丰富的扩展插件生态",
      "ControlNet 和 LoRA 训练",
      "提示词加权和负向提示词",
      "内置图像放大和修复功能",
    ],
    recommendedGpu: "RTX 4080 或更高",
    tags: ["图像生成", "Stable Diffusion", "Web UI"],
    deployHref: "/console",
    softwareVersions: { webui: "1.7.0", python: "3.10", torch: "2.1.0" },
    ports: ["7860"],
  },
  {
    slug: "fooocus",
    category: "image",
    title: "Fooocus",
    summary: "简化的 Stable Diffusion 界面，专注创作体验",
    longDescription:
      "Fooocus 是一个简化的 Stable Diffusion 图像生成工具，灵感来自 Midjourney 的设计理念。它隐藏了复杂的技术参数，让用户专注于创作本身，同时内置了优化的默认设置和智能提示词增强。",
    features: [
      "简洁直观的用户界面",
      "内置智能提示词优化",
      "自动参数调优",
      "支持 SDXL Refiner",
      "内置风格预设",
      "高质量默认输出",
    ],
    recommendedGpu: "RTX 4070 Ti 或更高",
    tags: ["图像生成", "简化界面", "Stable Diffusion"],
    deployHref: "/console",
    softwareVersions: { fooocus: "2.1.865", python: "3.10" },
    ports: ["7865"],
  },

  // Video Templates
  {
    slug: "cogvideox",
    category: "video",
    title: "CogVideoX",
    summary: "清影开源视频生成模型，支持文生视频",
    longDescription:
      "CogVideoX 是智谱 AI 开源的视频生成模型，支持文本到视频生成。它采用了扩散模型架构，能够生成高质量、时间连贯的视频内容，适合短视频创作和概念验证。",
    features: [
      "文本到视频生成",
      "支持多种分辨率输出",
      "时间一致性优化",
      "可控的生成参数",
      "中英文提示词支持",
    ],
    recommendedGpu: "A100 40GB 或更高",
    tags: ["视频生成", "开源", "文生视频"],
    deployHref: "/console",
    softwareVersions: { cogvideox: "1.0", python: "3.10", cuda: "12.1" },
    ports: ["7860"],
  },
  {
    slug: "animatediff",
    category: "video",
    title: "AnimateDiff",
    summary: "将静态 Stable Diffusion 模型转为视频生成",
    longDescription:
      "AnimateDiff 是一个创新的视频生成框架，它可以为任何 Stable Diffusion 模型添加动态生成能力。通过注入运动模块，AnimateDiff 能够生成流畅的动画视频，兼容现有的 SD 模型和 LoRA。",
    features: [
      "兼容任何 Stable Diffusion 模型",
      "支持 ControlNet 控制运动",
      "运动 LoRA 支持",
      "高度可定制的动画参数",
      "支持长视频生成",
    ],
    recommendedGpu: "RTX 4090 或 A100",
    tags: ["视频生成", "Stable Diffusion", "动画"],
    deployHref: "/console",
    softwareVersions: { animatediff: "v3", comfyui: "latest" },
    ports: ["8188"],
  },

  // Audio Templates
  {
    slug: "whisper",
    category: "audio",
    title: "Whisper",
    summary: "OpenAI 开源语音识别模型，支持多语言",
    longDescription:
      "Whisper 是 OpenAI 开源的自动语音识别（ASR）系统，经过 68 万小时多语言数据训练。它提供了卓越的识别准确度，支持 99 种语言的转录和翻译，适合字幕生成、会议记录等场景。",
    features: [
      "支持 99 种语言识别",
      "自动语言检测",
      "语音翻译成英文",
      "标点和大小写还原",
      "多种模型大小选择",
      "时间戳和单词级对齐",
    ],
    recommendedGpu: "RTX 3060 或更高",
    tags: ["语音识别", "多语言", "OpenAI"],
    deployHref: "/console",
    softwareVersions: { whisper: "large-v3", python: "3.10", cuda: "12.1" },
    ports: ["9000"],
    usageExample: "curl http://localhost:9000/transcribe -F 'file=@audio.mp3'",
  },
  {
    slug: "bark",
    category: "audio",
    title: "Bark",
    summary: "文本到音频生成模型，支持多语言和音效",
    longDescription:
      "Bark 是 Suno AI 开源的文本到音频生成模型，能够生成高质量的语音、音乐和音效。它支持多语言、非语言发音（笑声、叹息）、甚至背景音乐，为音频内容创作提供了强大工具。",
    features: [
      "文本到语音生成",
      "支持非语言音效（笑声、叹息等）",
      "多语言和口音支持",
      "可生成背景音乐",
      "支持自定义语音克隆",
      "流式生成",
    ],
    recommendedGpu: "RTX 4070 或更高",
    tags: ["语音合成", "音效生成", "多语言"],
    deployHref: "/console",
    softwareVersions: { bark: "1.0.0", python: "3.10" },
    ports: ["8000"],
  },
  {
    slug: "chattts",
    category: "audio",
    title: "ChatTTS",
    summary: "专为对话场景设计的文本转语音模型",
    longDescription:
      "ChatTTS 是专为对话式任务设计的文本转语音模型，支持中英文，在韵律和表现力方面表现出色。它针对对话场景进行了优化，生成的语音自然流畅，非常适合聊天机器人、有声读物等应用。",
    features: [
      "对话式场景优化",
      "中英文双语支持",
      "自然的韵律和停顿",
      "多说话人支持",
      "情感控制",
      "低延迟推理",
    ],
    recommendedGpu: "RTX 3060 或更高",
    tags: ["语音合成", "对话", "中英文"],
    deployHref: "/console",
    softwareVersions: { chattts: "0.1.0", python: "3.10" },
    ports: ["8080"],
  },
]

const categoryDetails: Record<TemplateCategory, TemplateDetails> = {
  llm: {
    parameters: [
      { label: "上下文长度", value: "4K – 128K" },
      { label: "最大输出", value: "8K" },
      { label: "量化支持", value: "FP16 / INT8 / INT4" },
      { label: "接口协议", value: "OpenAI 兼容" },
      { label: "流式输出", value: "支持" },
      { label: "推荐显存", value: "8 GB 起" },
    ],
    input: ["文本", "代码"],
    output: ["文本"],
    usageExample: `curl http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"your-model","messages":[{"role":"user","content":"Hello"}]}'`,
  },
  image: {
    parameters: [
      { label: "默认分辨率", value: "512 / 768" },
      { label: "采样器", value: "Euler a" },
      { label: "采样步数", value: "20" },
      { label: "CFG Scale", value: "7" },
      { label: "批处理", value: "1 – 4" },
      { label: "推荐显存", value: "8 GB 起" },
    ],
    input: ["文本", "图像", "蒙版"],
    output: ["图像"],
    usageExample: `curl -X POST http://localhost:7860/generate \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a cinematic mountain landscape","width":768,"height":768}'`,
  },
  video: {
    parameters: [
      { label: "输入模式", value: "文生视频" },
      { label: "默认时长", value: "6 秒" },
      { label: "输出分辨率", value: "720p" },
      { label: "帧率", value: "16 FPS" },
      { label: "运动强度", value: "1.0" },
      { label: "推荐显存", value: "16 GB 起" },
    ],
    input: ["文本", "图像"],
    output: ["视频"],
    usageExample: `curl -X POST http://localhost:7860/generate-video \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a calm ocean wave at sunrise","duration":6,"resolution":"720p"}'`,
  },
  audio: {
    parameters: [
      { label: "输入格式", value: "WAV / MP3" },
      { label: "采样率", value: "16 kHz" },
      { label: "输出格式", value: "文本 / 音频" },
      { label: "支持语言", value: "多语言" },
      { label: "流式处理", value: "支持" },
      { label: "推荐显存", value: "6 GB 起" },
    ],
    input: ["音频", "文本"],
    output: ["文本", "音频"],
    usageExample: `curl -X POST http://localhost:9000/transcribe \\
  -F "file=@audio.mp3" \\
  -F "language=auto"`,
  },
}

const templateDetailOverrides: Record<string, TemplateDetailOverride> = {
  ollama: {
    parameters: [
      { label: "模型格式", value: "GGUF" },
      { label: "上下文长度", value: "4K – 32K" },
      { label: "量化格式", value: "Q4 / Q5 / Q8" },
      { label: "接口协议", value: "Native / OpenAI" },
      { label: "GPU 加速", value: "自动检测" },
      { label: "并发模式", value: "单请求" },
    ],
    input: ["文本"],
    output: ["文本"],
    usageExample: `curl http://localhost:11434/api/generate \\
  -d '{"model":"llama3","prompt":"Hello","stream":false}'`,
  },
  vllm: {
    parameters: [
      { label: "上下文长度", value: "32K – 128K" },
      { label: "最大输出", value: "16K" },
      { label: "量化支持", value: "AWQ / GPTQ" },
      { label: "接口协议", value: "OpenAI 兼容" },
      { label: "批处理", value: "连续批处理" },
      { label: "推荐显存", value: "40 GB 起" },
    ],
    input: ["文本", "代码"],
    output: ["文本"],
    usageExample: `curl http://localhost:8000/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"meta-llama/Llama-2-7b","messages":[{"role":"user","content":"Hello"}]}'`,
  },
  "open-webui": {
    parameters: [
      { label: "上下文长度", value: "8K – 128K" },
      { label: "后端模型", value: "Ollama / OpenAI" },
      { label: "RAG", value: "内置支持" },
      { label: "权限管理", value: "多用户" },
      { label: "流式输出", value: "支持" },
      { label: "默认端口", value: "3000" },
    ],
    input: ["文本", "文档", "图片"],
    output: ["文本"],
    usageExample: `curl http://localhost:3000/api/models \\
  -H "Authorization: Bearer <API_KEY>"`,
  },
  "text-generation-inference": {
    parameters: [
      { label: "上下文长度", value: "8K – 128K" },
      { label: "注意力", value: "Flash Attention" },
      { label: "量化支持", value: "BitsAndBytes" },
      { label: "接口协议", value: "gRPC / REST" },
      { label: "批处理", value: "动态批处理" },
      { label: "并行方式", value: "张量并行" },
    ],
    input: ["文本", "代码"],
    output: ["文本"],
    usageExample: `curl http://localhost:8080/generate_stream \\
  -H "Content-Type: application/json" \\
  -d '{"inputs":"Explain GPU inference in one sentence"}'`,
  },
  "llama-cpp": {
    parameters: [
      { label: "模型格式", value: "GGUF" },
      { label: "上下文长度", value: "4K – 32K" },
      { label: "量化格式", value: "Q4 / Q8" },
      { label: "推理后端", value: "CPU / CUDA / Metal" },
      { label: "接口协议", value: "OpenAI 兼容" },
      { label: "推荐显存", value: "4 GB 起" },
    ],
    input: ["文本", "代码"],
    output: ["文本"],
    usageExample: `curl http://localhost:8080/v1/chat/completions \\
  -H "Content-Type: application/json" \\
  -d '{"model":"local-model","messages":[{"role":"user","content":"Hello"}]}'`,
  },
  comfyui: {
    parameters: [
      { label: "默认分辨率", value: "512 – 1024" },
      { label: "采样器", value: "Euler a" },
      { label: "采样步数", value: "20" },
      { label: "CFG Scale", value: "7" },
      { label: "工作流", value: "节点式编辑" },
      { label: "批处理", value: "1 – 4" },
    ],
    input: ["文本", "图像", "蒙版"],
    output: ["图像", "工作流 JSON"],
    usageExample: `curl -X POST http://localhost:8188/prompt \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"cinematic product photo"}'`,
  },
  "stable-diffusion-webui": {
    parameters: [
      { label: "默认分辨率", value: "512 – 1024" },
      { label: "采样器", value: "Euler a" },
      { label: "采样步数", value: "30" },
      { label: "CFG Scale", value: "7" },
      { label: "高清修复", value: "支持" },
      { label: "批处理", value: "1 – 4" },
    ],
    input: ["文本", "图像"],
    output: ["图像"],
    usageExample: `curl -X POST http://localhost:7860/sdapi/v1/txt2img \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"studio portrait","steps":30,"width":768,"height":768}'`,
  },
  fooocus: {
    parameters: [
      { label: "默认分辨率", value: "1024 × 1024" },
      { label: "采样设置", value: "自动优化" },
      { label: "Guidance", value: "4.0" },
      { label: "风格预设", value: "内置" },
      { label: "输入模式", value: "文生图 / 图生图" },
      { label: "批处理", value: "1 – 4" },
    ],
    input: ["文本", "图像"],
    output: ["图像"],
    usageExample: `curl -X POST http://localhost:7865/generate \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"editorial fashion portrait"}'`,
  },
  cogvideox: {
    parameters: [
      { label: "输入模式", value: "文生视频" },
      { label: "默认时长", value: "6 秒" },
      { label: "输出分辨率", value: "480p / 720p" },
      { label: "帧率", value: "16 FPS" },
      { label: "运动强度", value: "1.0" },
      { label: "推荐显存", value: "16 GB 起" },
    ],
    input: ["文本"],
    output: ["视频"],
    usageExample: `curl -X POST http://localhost:7860/generate-video \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a paper boat drifting on water","duration":6}'`,
  },
  animatediff: {
    parameters: [
      { label: "输入模式", value: "文生视频 / 图生视频" },
      { label: "帧数", value: "16 帧" },
      { label: "输出分辨率", value: "512 px" },
      { label: "帧率", value: "8 FPS" },
      { label: "运动强度", value: "1.0" },
      { label: "推荐显存", value: "16 GB 起" },
    ],
    input: ["文本", "图像"],
    output: ["视频"],
    usageExample: `curl -X POST http://localhost:8188/prompt \\
  -H "Content-Type: application/json" \\
  -d '{"prompt":"a character walking through neon rain","motion_strength":1.0}'`,
  },
  whisper: {
    parameters: [
      { label: "输入格式", value: "WAV / MP3 / M4A" },
      { label: "采样率", value: "16 kHz" },
      { label: "语言", value: "99 种" },
      { label: "模型规模", value: "large-v3" },
      { label: "时间戳", value: "支持" },
      { label: "推荐显存", value: "8 GB 起" },
    ],
    input: ["音频", "视频"],
    output: ["文本", "SRT / VTT"],
    usageExample: `curl http://localhost:9000/transcribe \\
  -F 'file=@audio.mp3' \\
  -F 'response_format=verbose_json'`,
  },
  bark: {
    parameters: [
      { label: "输入模式", value: "文本生音频" },
      { label: "默认时长", value: "10 秒以内" },
      { label: "采样率", value: "24 kHz" },
      { label: "语言", value: "多语言" },
      { label: "说话人", value: "内置音色" },
      { label: "流式生成", value: "支持" },
    ],
    input: ["文本"],
    output: ["音频", "WAV"],
    usageExample: `curl -X POST http://localhost:8000/generate \\
  -H "Content-Type: application/json" \\
  -d '{"text":"Hello from GPU Cloud","voice":"en_0"}'`,
  },
  chattts: {
    parameters: [
      { label: "输入模式", value: "对话式文本" },
      { label: "采样率", value: "24 kHz" },
      { label: "语言", value: "中文 / English" },
      { label: "说话人数", value: "1 – 4" },
      { label: "情感控制", value: "支持" },
      { label: "推理延迟", value: "低延迟" },
    ],
    input: ["文本"],
    output: ["音频", "WAV"],
    usageExample: `curl -X POST http://localhost:8080/tts \\
  -H "Content-Type: application/json" \\
  -d '{"text":"你好，欢迎使用 ChatTTS","speaker":1}'`,
  },
}

export function getTemplateDetails(template: Template): TemplateDetails {
  const category = categoryDetails[template.category]
  const override = templateDetailOverrides[template.slug]

  return {
    ...category,
    ...override,
    parameters: override?.parameters ?? category.parameters,
    input: override?.input ?? category.input,
    output: override?.output ?? category.output,
    usageExample:
      override?.usageExample ?? template.usageExample ?? category.usageExample,
  }
}

export const categoryLabels: Record<TemplateCategory, string> = {
  llm: "大语言模型",
  image: "图像生成",
  video: "视频生成",
  audio: "音频处理",
}

export function getTemplatesByCategory(category: TemplateCategory) {
  return templates.filter((t) => t.category === category)
}

export function getTemplateBySlug(slug: string) {
  return templates.find((t) => t.slug === slug)
}

export function getAllTemplateSlugs() {
  return templates.map((t) => t.slug)
}
