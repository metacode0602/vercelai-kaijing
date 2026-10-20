"use client"

import { toast as sonnerToast } from "sonner"

type ToastVariant = "default" | "secondary" | "destructive" | "outline"

type ToastInput = {
  title: string
  description?: string
  variant?: ToastVariant
}

function showToast({ title, description, variant }: ToastInput) {
  const options = description === undefined ? undefined : { description }

  if (variant === "destructive") {
    return sonnerToast.error(title, options)
  }

  return sonnerToast(title, options)
}

const toast = Object.assign(showToast, {
  success: sonnerToast.success,
  error: sonnerToast.error,
  info: sonnerToast.info,
  warning: sonnerToast.warning,
})

export { toast }
export { sonnerToast as toaster }
