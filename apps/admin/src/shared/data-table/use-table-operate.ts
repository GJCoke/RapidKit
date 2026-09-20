import { useCallback, useState } from "react"

export type TableOperation = "add" | "edit"

export function useTableOperate<T>(getRowId: (row: T) => string) {
  const [open, setOpen] = useState(false)
  const [operation, setOperation] = useState<TableOperation>("add")
  const [editingRecord, setEditingRecord] = useState<T | null>(null)
  const [selectedIds, setSelectedIds] = useState<string[]>([])

  const openAdd = useCallback(() => {
    setOperation("add")
    setEditingRecord(null)
    setOpen(true)
  }, [])
  const openEdit = useCallback((record: T) => {
    setOperation("edit")
    setEditingRecord({ ...record })
    setOpen(true)
  }, [])
  const close = useCallback(() => {
    setOpen(false)
    setEditingRecord(null)
  }, [])
  const completeMutation = useCallback(() => {
    setSelectedIds([])
    setOpen(false)
    setEditingRecord(null)
  }, [])
  const toggleRecord = useCallback(
    (record: T, selected: boolean) => {
      const id = getRowId(record)
      setSelectedIds((current) => (selected ? [...new Set([...current, id])] : current.filter((item) => item !== id)))
    },
    [getRowId],
  )

  return {
    open,
    operation,
    editingRecord,
    selectedIds,
    setSelectedIds,
    openAdd,
    openEdit,
    close,
    completeMutation,
    toggleRecord,
  }
}
