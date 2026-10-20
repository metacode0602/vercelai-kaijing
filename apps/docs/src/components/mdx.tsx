import { Accordion, Accordions } from "fumadocs-ui/components/accordion"
import { Tab, Tabs, TabsContent, TabsList, TabsTrigger } from "fumadocs-ui/components/tabs"
import { TypeTable, type TypeNode } from "fumadocs-ui/components/type-table"
import defaultMdxComponents from "fumadocs-ui/mdx"
import type { MDXComponents } from "mdx/types"
import type { ReactNode } from "react"

type FieldProps = {
  body?: ReactNode
  query?: ReactNode
  header?: ReactNode
  path?: ReactNode
  name?: ReactNode
  type?: ReactNode
  required?: boolean
  default?: ReactNode
  children?: ReactNode
}

function Field({ body, query, header, path, name, type, required, default: defaultValue, children }: FieldProps) {
  const value = [body, query, header, path, name].find((item) => item !== undefined && item !== null && String(item) !== "")
  const fieldName = value === undefined ? "Field" : String(value)
  const description = (
    <>
      {children}
      {defaultValue !== undefined && defaultValue !== null && !defaultValue ? (
        <>
          {children ? <br /> : null}
          <span>Default: {String(defaultValue)}</span>
        </>
      ) : null}
    </>
  )
  const field: TypeNode = {
    type: type ?? "",
    description,
    required,
    default: defaultValue,
  }

  return <TypeTable type={{ [fieldName]: field }} />
}

export function getMDXComponents(components?: MDXComponents) {
  return {
    ...defaultMdxComponents,
    Accordion,
    Accordions,
    ParamField: Field,
    ResponseField: Field,
    Tab,
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
    ...components,
  } satisfies MDXComponents
}

export const useMDXComponents = getMDXComponents

declare global {
  type MDXProvidedComponents = ReturnType<typeof getMDXComponents>
}
