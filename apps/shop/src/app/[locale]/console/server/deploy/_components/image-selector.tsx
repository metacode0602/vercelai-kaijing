"use client"

import { useState } from "react"
import { Check, Loader2 } from "lucide-react"
import { trpc } from "@/trpc/client"
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from "@workspace/ui/components/tabs"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@workspace/ui/components/select"
import { Label } from "@workspace/ui/components/label"
import { cn } from "@/lib/utils"

type ImageCategory = "base" | "custom"

interface ImageSelectorProps {
  value: string
  onChange: (fullImageRef: string, label: string) => void
}

export function ImageSelector({ value, onChange }: ImageSelectorProps) {
  const [activeTab, setActiveTab] = useState<ImageCategory>("base")
  const [selectedBaseImageId, setSelectedBaseImageId] = useState<string>("")
  const [selectedVersionId, setSelectedVersionId] = useState<string>("")

  const baseImagesQuery = trpc.baseImage.list.useQuery(undefined, {
    enabled: activeTab === "base",
  })
  const customImagesQuery = trpc.image.listCustom.useQuery(
    { page: 1, pageSize: 100 },
    { enabled: activeTab === "custom" },
  )

  const baseImages = baseImagesQuery.data ?? []
  const customImages = customImagesQuery.data?.items ?? []

  const selectedBaseImage = baseImages.find((img) => img.id === selectedBaseImageId)

  function handleSelectBaseImage(imageId: string) {
    setSelectedBaseImageId(imageId)
    setSelectedVersionId("")
    const image = baseImages.find((img) => img.id === imageId)
    if (image?.versions.length === 1) {
      setSelectedVersionId(image.versions[0].id)
      onChange(image.versions[0].fullImageRef, image.displayName)
    }
  }

  function handleSelectVersion(versionId: string) {
    setSelectedVersionId(versionId)
    const version = selectedBaseImage?.versions.find((v) => v.id === versionId)
    if (version) {
      onChange(version.fullImageRef, selectedBaseImage?.displayName ?? "")
    }
  }

  function handleSelectCustomImage(imageRef: string, tagName: string) {
    onChange(imageRef, tagName)
  }

  function handleTabChange(tab: string) {
    if (!tab) return
    setActiveTab(tab as ImageCategory)
  }

  return (
    <Tabs value={activeTab} onValueChange={handleTabChange}>
      <TabsList className="mb-4">
        <TabsTrigger value="base">基础镜像</TabsTrigger>
        <TabsTrigger value="custom">我的镜像</TabsTrigger>
      </TabsList>

      <TabsContent value="base" className="mt-0">
        {baseImagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中...
          </div>
        ) : baseImages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无基础镜像
          </div>
        ) : (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 sm:gap-3">
              {baseImages.map((image) => {
                const selected = selectedBaseImageId === image.id
                return (
                  <button
                    key={image.id}
                    type="button"
                    onClick={() => handleSelectBaseImage(image.id)}
                    className={cn(
                      "group relative flex min-h-[4.5rem] flex-col items-center justify-center rounded-xl border bg-card px-3 py-3 text-sm transition-all",
                      "hover:border-primary/50 hover:shadow-sm",
                      selected
                        ? "border-primary/50 text-foreground shadow-sm ring-2 ring-primary/25"
                        : "border-border/80 text-muted-foreground",
                    )}
                  >
                    {selected && (
                      <span className="absolute right-2 top-2 flex size-4 items-center justify-center rounded-full bg-primary text-primary-foreground">
                        <Check className="size-2.5" strokeWidth={3} />
                      </span>
                    )}
                    <span className={cn("font-medium", selected && "font-semibold")}>
                      {image.displayName}
                    </span>
                  </button>
                )
              })}
            </div>

            {selectedBaseImage && selectedBaseImage.versions.length > 0 && (
              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:gap-3">
                <Label className="w-24 shrink-0 text-sm font-bold">版本:</Label>
                <div className="w-full sm:max-w-lg">
                  <Select
                    value={selectedVersionId}
                    onValueChange={handleSelectVersion}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="选择版本" />
                    </SelectTrigger>
                    <SelectContent>
                      {selectedBaseImage.versions.map((version) => (
                        <SelectItem key={version.id} value={version.id}>
                          {version.displayLabel}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            )}
          </>
        )}
      </TabsContent>

      <TabsContent value="custom" className="mt-0">
        {customImagesQuery.isLoading ? (
          <div className="flex items-center justify-center py-8 text-sm text-muted-foreground">
            <Loader2 className="mr-2 size-4 animate-spin" />
            加载中...
          </div>
        ) : customImages.length === 0 ? (
          <div className="py-8 text-center text-sm text-muted-foreground">
            暂无自定义镜像，请先推送镜像到仓库
          </div>
        ) : (
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {customImages.map((image) => {
              const selected = value === image.imageRef
              return (
                <button
                  key={image.id}
                  type="button"
                  onClick={() => handleSelectCustomImage(image.imageRef, image.tagName)}
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
                  <span className="text-sm font-semibold text-foreground">
                    {image.tagName}
                  </span>
                  <code className="mt-2 truncate rounded bg-muted px-1.5 py-1 font-mono text-[11px] text-muted-foreground">
                    {image.imageRef}
                  </code>
                </button>
              )
            })}
          </div>
        )}
      </TabsContent>
    </Tabs>
  )
}
