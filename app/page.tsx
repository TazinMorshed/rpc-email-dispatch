'use client'

import { useState, useMemo, useRef } from 'react'
import Link from 'next/link'

interface Invoice {
  vendor_name: string
  date: string
  invoice_number: string
  amount: string
  email: string
}

type SortKey = keyof Invoice
type SortDir = 'asc' | 'desc'

const COLUMNS: { key: SortKey; label: string }[] = [
  { key: 'vendor_name', label: 'Vendor Name' },
  { key: 'date', label: 'Date' },
  { key: 'invoice_number', label: 'Invoice #' },
  { key: 'amount', label: 'Amount' },
  { key: 'email', label: 'Email' },
]

function formatAmount(val: string) {
  const n = parseFloat(val)
  if (isNaN(n)) return '-'
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className="ml-1 inline-block text-xs">
      {active ? (dir === 'asc' ? '↑' : '↓') : <span className="text-gray-300 dark:text-gray-600">↕</span>}
    </span>
  )
}

export default function Page() {
  const [invoices, setInvoices] = useState<Invoice[]>([])
  const [uploading, setUploading] = useState(false)
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null)
  const [uploadError, setUploadError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const [vendorFilter, setVendorFilter] = useState('')
  const [invoiceFilter, setInvoiceFilter] = useState('')
  const [dateFrom, setDateFrom] = useState('')
  const [dateTo, setDateTo] = useState('')
  const [amountMin, setAmountMin] = useState('')
  const [amountMax, setAmountMax] = useState('')
  const [olderThan60, setOlderThan60] = useState(false)
  const [overdueDays, setOverdueDays] = useState(60)

  const [sortKey, setSortKey] = useState<SortKey>('date')
  const [sortDir, setSortDir] = useState<SortDir>('desc')

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setUploadError(null)

    const formData = new FormData()
    formData.append('file', file)

    try {
      const res = await fetch('/api/invoices', { method: 'POST', body: formData })
      if (!res.ok) throw new Error('Failed to parse file')
      const data = await res.json()
      if (!Array.isArray(data) || data.length === 0) throw new Error('No invoices found in file')
      setInvoices(data)
      setUploadedFileName(file.name)
      sessionStorage.setItem('invoices', JSON.stringify(data))
    } catch (err) {
      setUploadError(err instanceof Error ? err.message : 'Upload failed')
    } finally {
      setUploading(false)
      if (fileInputRef.current) fileInputRef.current.value = ''
    }
  }

  const vendors = useMemo(
    () => Array.from(new Set(invoices.map((i) => i.vendor_name))).sort(),
    [invoices]
  )

  const filtered = useMemo(() => {
    return invoices
      .filter((inv) => {
        if (vendorFilter && !inv.vendor_name.toLowerCase().includes(vendorFilter.toLowerCase()))
          return false
        if (invoiceFilter && !inv.invoice_number.toLowerCase().includes(invoiceFilter.toLowerCase()))
          return false
        if (dateFrom && inv.date < dateFrom) return false
        if (dateTo && inv.date > dateTo) return false
        const amount = parseFloat(inv.amount)
        if (amountMin !== '' && amount < parseFloat(amountMin)) return false
        if (amountMax !== '' && amount > parseFloat(amountMax)) return false
        if (olderThan60) {
          const cutoff = new Date()
          cutoff.setDate(cutoff.getDate() - overdueDays)
          if (new Date(inv.date) >= cutoff) return false
        }
        return true
      })
      .sort((a, b) => {
        const aVal = a[sortKey]
        const bVal = b[sortKey]
        if (sortKey === 'amount') {
          return sortDir === 'asc'
            ? parseFloat(aVal) - parseFloat(bVal)
            : parseFloat(bVal) - parseFloat(aVal)
        }
        return sortDir === 'asc' ? aVal.localeCompare(bVal) : bVal.localeCompare(aVal)
      })
  }, [invoices, vendorFilter, invoiceFilter, dateFrom, dateTo, amountMin, amountMax, olderThan60, overdueDays, sortKey, sortDir])

  const totalAmount = useMemo(
    () => filtered.reduce((sum, inv) => sum + parseFloat(inv.amount || '0'), 0),
    [filtered]
  )

  const uniqueVendorCount = useMemo(
    () => new Set(filtered.map((i) => i.vendor_name)).size,
    [filtered]
  )

  const hasFilters = vendorFilter || invoiceFilter || dateFrom || dateTo || amountMin || amountMax || olderThan60
  const hasData = invoices.length > 0

  function clearFilters() {
    setVendorFilter('')
    setInvoiceFilter('')
    setDateFrom('')
    setDateTo('')
    setAmountMin('')
    setAmountMax('')
    setOlderThan60(false)
    setOverdueDays(60)
  }

  function handleSort(key: SortKey) {
    if (key === sortKey) {
      setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
    } else {
      setSortKey(key)
      setSortDir('asc')
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-[1400px] mx-auto">
      <header className="mb-6 flex items-start justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">RPC Invoice Dashboard</h1>
          {hasData && (
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">{vendors.length} vendors · {invoices.length} invoices</p>
          )}
        </div>

        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            {hasData && (
              <Link
                href="/emails"
                className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 text-sm font-medium hover:bg-gray-50 dark:hover:bg-gray-700 hover:border-gray-300 dark:hover:border-gray-600 shadow-sm transition-colors"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                Generate email content
              </Link>
            )}

            {/* Upload */}
            <label className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${uploading ? 'bg-gray-100 text-gray-400 border-gray-200 cursor-not-allowed dark:bg-gray-700 dark:text-gray-500 dark:border-gray-600' : 'bg-white border-gray-200 text-gray-700 hover:bg-gray-50 hover:border-gray-300 shadow-sm dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 dark:hover:bg-gray-700 dark:hover:border-gray-600'}`}>
              <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
              </svg>
              {uploading ? 'Processing...' : uploadedFileName ? 'Replace CSV' : 'Upload CSV'}
              <input
                ref={fileInputRef}
                type="file"
                accept=".csv"
                className="hidden"
                disabled={uploading}
                onChange={handleFileUpload}
              />
            </label>
          </div>
          {uploadedFileName && (
            <p className="text-xs text-green-600 font-medium">{uploadedFileName}</p>
          )}
          {uploadError && (
            <p className="text-xs text-red-500">{uploadError}</p>
          )}
        </div>
      </header>

      {!hasData ? (
        /* Empty state */
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 17v-2m3 2v-4m3 4v-6m2 10H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No data loaded</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Upload a CSV file to view your invoice data</p>
          <label className={`flex items-center gap-2 px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium cursor-pointer hover:bg-blue-700 transition-colors ${uploading ? 'opacity-50 cursor-not-allowed' : ''}`}>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
            </svg>
            {uploading ? 'Processing...' : 'Upload CSV'}
            <input
              type="file"
              accept=".csv"
              className="hidden"
              disabled={uploading}
              onChange={handleFileUpload}
            />
          </label>
          {uploadError && (
            <p className="text-xs text-red-500 mt-3">{uploadError}</p>
          )}
        </div>
      ) : (
        <>
          {/* Filters */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-4 shadow-sm">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-3">
              <div className="xl:col-span-2">
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Vendor Name</label>
                <input
                  type="text"
                  placeholder="Search vendors..."
                  value={vendorFilter}
                  onChange={(e) => setVendorFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Invoice #</label>
                <input
                  type="text"
                  placeholder="Search..."
                  value={invoiceFilter}
                  onChange={(e) => setInvoiceFilter(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date From</label>
                <input
                  type="date"
                  value={dateFrom}
                  onChange={(e) => setDateFrom(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Date To</label>
                <input
                  type="date"
                  value={dateTo}
                  onChange={(e) => setDateTo(e.target.value)}
                  className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>
              <div>
                <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">Amount Range</label>
                <div className="flex gap-1">
                  <input
                    type="number"
                    placeholder="Min"
                    value={amountMin}
                    onChange={(e) => setAmountMin(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <input
                    type="number"
                    placeholder="Max"
                    value={amountMax}
                    onChange={(e) => setAmountMax(e.target.value)}
                    className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                </div>
              </div>
              <div className="flex items-end">
                <label className="flex items-center gap-2 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={olderThan60}
                    onChange={(e) => setOlderThan60(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-blue-600 focus:ring-blue-500 cursor-pointer"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium whitespace-nowrap">Overdue &gt;</span>
                  <input
                    type="number"
                    min={1}
                    value={overdueDays}
                    onChange={(e) => setOverdueDays(Math.max(1, parseInt(e.target.value) || 1))}
                    className="w-14 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 px-2 py-1 text-sm text-center focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300 font-medium">days</span>
                </label>
              </div>
            </div>
            {hasFilters && (
              <div className="mt-3 flex justify-end">
                <button
                  onClick={clearFilters}
                  className="text-xs text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300 font-medium"
                >
                  Clear filters
                </button>
              </div>
            )}
          </div>

          {/* Summary bar */}
          <div className="flex items-center justify-between mb-3 px-1">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Showing <span className="font-semibold text-gray-900 dark:text-white">{filtered.length}</span> invoice{filtered.length !== 1 ? 's' : ''} from{' '}
              <span className="font-semibold text-gray-900 dark:text-white">{uniqueVendorCount}</span> vendor{uniqueVendorCount !== 1 ? 's' : ''}
            </p>
            <p className="text-sm font-semibold text-gray-900 dark:text-white">
              Total: {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(totalAmount)}
            </p>
          </div>

          {/* Table */}
          <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-700/50">
                    {COLUMNS.map((col) => (
                      <th
                        key={col.key}
                        onClick={() => handleSort(col.key)}
                        className="px-4 py-3 text-left text-xs font-semibold text-gray-500 dark:text-gray-400 uppercase tracking-wider cursor-pointer select-none hover:text-gray-900 dark:hover:text-gray-100 whitespace-nowrap"
                      >
                        {col.label}
                        <SortIcon active={sortKey === col.key} dir={sortDir} />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {filtered.length === 0 ? (
                    <tr>
                      <td colSpan={5} className="px-4 py-12 text-center text-gray-400 dark:text-gray-500">
                        No invoices match the current filters.
                      </td>
                    </tr>
                  ) : (
                    filtered.map((inv, i) => (
                      <tr key={i} className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                        <td className="px-4 py-3 font-medium text-gray-900 dark:text-gray-100">{inv.vendor_name}</td>
                        <td className="px-4 py-3 text-gray-600 dark:text-gray-400 whitespace-nowrap">{inv.date}</td>
                        <td className="px-4 py-3">
                          <span className="font-mono text-xs bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded">
                            {inv.invoice_number}
                          </span>
                        </td>
                        <td className={`px-4 py-3 font-medium whitespace-nowrap ${parseFloat(inv.amount) < 0 ? 'text-red-600 dark:text-red-400' : 'text-gray-900 dark:text-gray-100'}`}>
                          {formatAmount(inv.amount)}
                        </td>
                        <td className="px-4 py-3 text-gray-500 dark:text-gray-400">
                          {inv.email ? (
                            <a href={`mailto:${inv.email}`} className="hover:text-blue-600 dark:hover:text-blue-400 hover:underline">
                              {inv.email}
                            </a>
                          ) : (
                            <span className="text-gray-300 dark:text-gray-600">—</span>
                          )}
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
