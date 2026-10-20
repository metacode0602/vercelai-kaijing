"use client"

import { Minus, Plus } from "lucide-react"
import { Label } from "@workspace/ui/components/label"
import {
  InputGroup,
  InputGroupAddon,
  InputGroupButton,
  InputGroupInput,
  InputGroupText,
} from "@workspace/ui/components/input-group"
import { cn } from "@workspace/ui/lib/utils"

interface NumberStepperFieldProps {
  label: string
  valueLabel: string
  value: number
  min?: number
  step?: number
  suffix?: string
  className?: string
  onChange: (value: number) => void
}

export function NumberStepperField({
  label,
  valueLabel,
  value,
  min = 0,
  step = 1,
  suffix,
  className,
  onChange,
}: NumberStepperFieldProps) {
  function handleDecrease() {
    onChange(Math.max(min, value - step))
  }

  function handleIncrease() {
    onChange(value + step)
  }

  function handleInputChange(nextValue: string) {
    const parsed = Number(nextValue)
    if (Number.isNaN(parsed)) return
    onChange(Math.max(min, parsed))
  }

  return (
    <div className={cn("w-[210px]", className)}>
      <Label className="mb-1 flex items-center justify-between text-sm font-normal text-foreground">
        <span>{label}</span>
        <span className="text-primary">{valueLabel}</span>
      </Label>

      <InputGroup className="h-8">
        <InputGroupAddon align="inline-start">
          <InputGroupButton
            size="icon-xs"
            aria-label={`减少${label}`}
            onClick={handleDecrease}
            disabled={value <= min}
          >
            <Minus />
          </InputGroupButton>
        </InputGroupAddon>

        <InputGroupInput
          type="number"
          min={min}
          step={step}
          value={value}
          className="text-center [appearance:textfield] [&::-webkit-inner-spin-button]:appearance-none [&::-webkit-outer-spin-button]:appearance-none"
          onChange={(event) => handleInputChange(event.target.value)}
        />

        {suffix ? (
          <InputGroupAddon align="inline-end">
            <InputGroupText className="pr-0 text-muted-foreground">
              {suffix}
            </InputGroupText>
          </InputGroupAddon>
        ) : null}

        <InputGroupAddon align="inline-end">
          <InputGroupButton
            size="icon-xs"
            aria-label={`增加${label}`}
            onClick={handleIncrease}
          >
            <Plus />
          </InputGroupButton>
        </InputGroupAddon>
      </InputGroup>
    </div>
  )
}
