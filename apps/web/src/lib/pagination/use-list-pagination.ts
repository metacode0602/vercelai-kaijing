'use client'

import * as React from 'react'
import { DEFAULT_PAGE_SIZE } from './defaults'

export function useListPagination(defaultPageSize = DEFAULT_PAGE_SIZE) {
  const [page, setPage] = React.useState(1)
  const [pageSize, setPageSizeState] = React.useState(defaultPageSize)

  const setPageSize = React.useCallback((next: number) => {
    setPageSizeState(next)
    setPage(1)
  }, [])

  return { page, setPage, pageSize, setPageSize }
}
