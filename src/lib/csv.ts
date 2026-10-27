type Cell = string | number | boolean | null | undefined | string[]

function escapeCell(v: Cell): string {
  if (v === null || v === undefined) return ''
  let s = Array.isArray(v) ? v.join('; ') : String(v)
  // Neutralise spreadsheet formula injection.
  if (/^[=+\-@\t\r]/.test(s)) s = `'${s}`
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s
}

export function toCsv<T extends Record<string, Cell>>(rows: T[], columns: (keyof T & string)[]): string {
  const header = columns.join(',')
  const body = rows.map(r => columns.map(c => escapeCell(r[c])).join(','))
  return [header, ...body].join('\r\n')
}

export function downloadFile(filename: string, contents: string, type = 'text/csv;charset=utf-8') {
  const blob = new Blob([type.startsWith('text/csv') ? '﻿' + contents : contents], { type })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  document.body.appendChild(a)
  a.click()
  a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}
