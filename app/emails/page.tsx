'use client'

import { useEffect, useState, useMemo } from 'react'
import Link from 'next/link'
import { useSession, signIn, signOut } from 'next-auth/react'

interface Invoice {
  vendor_name: string
  date: string
  invoice_number: string
  amount: string
  email: string
}

interface VendorGroup {
  vendor_name: string
  email: string
  overdueInvoices: (Invoice & { daysOutstanding: number })[]
  totalOwing: number
}

function daysAgo(dateStr: string): number {
  const invoiceDate = new Date(dateStr)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  return Math.floor((today.getTime() - invoiceDate.getTime()) / (1000 * 60 * 60 * 24))
}

function formatDateLong(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-CA', {
    month: 'short',
    day: 'numeric',
    year: 'numeric',
  })
}

function formatAmount(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

function generateEmail(vendor: VendorGroup): string {
  const today = new Date().toLocaleDateString('en-CA', { month: 'long', day: 'numeric', year: 'numeric' })
  const subject = `RPC Payment Follow-Up – ${vendor.vendor_name} – ${today}`

  const invoiceLines = vendor.overdueInvoices
    .map((inv) => `• ${inv.invoice_number} – ${formatDateLong(inv.date)} – ${formatAmount(inv.amount)} (${inv.daysOutstanding} days outstanding)`)
    .join('\n')

  return `Subject: ${subject}

Hello,
I hope this message finds you well. I am reaching out regarding several invoices on your account that have been outstanding for more than 60 days and require payment at your earliest convenience.

The following invoices are currently owing:
${invoiceLines}

Total owing: ${formatAmount(String(vendor.totalOwing))}

We kindly ask that you arrange payment at your earliest convenience. If payment has already been processed, please reply with the following details so we can update our records.

Should you have any questions, please don't hesitate to get in touch.

Thank you,
Lufa farms.`
}

function parseEmailContent(content: string): { subject: string; body: string } {
  const lines = content.split('\n')
  const subjectLine = lines[0] ?? ''
  const subject = subjectLine.startsWith('Subject: ') ? subjectLine.slice('Subject: '.length) : subjectLine
  // Body starts after the blank line following the subject
  const bodyStart = lines.indexOf('') !== -1 ? lines.indexOf('') + 1 : 1
  const body = lines.slice(bodyStart).join('\n')
  return { subject, body }
}

export default function EmailsPage() {
  const { data: session, status } = useSession()
  const [allInvoices, setAllInvoices] = useState<Invoice[]>([])
  const [selectedVendor, setSelectedVendor] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)
  const [vendorSearch, setVendorSearch] = useState('')
  const [sending, setSending] = useState(false)
  const [sent, setSent] = useState(false)
  const [sendError, setSendError] = useState<string | null>(null)

  useEffect(() => {
    const stored = sessionStorage.getItem('invoices')
    if (stored) {
      try {
        setAllInvoices(JSON.parse(stored))
      } catch {
        // ignore parse errors
      }
    }
  }, [])

  const vendorGroups = useMemo<VendorGroup[]>(() => {
    const cutoff = new Date()
    cutoff.setHours(0, 0, 0, 0)
    cutoff.setDate(cutoff.getDate() - 60)

    const map = new Map<string, VendorGroup>()

    for (const inv of allInvoices) {
      const days = daysAgo(inv.date)
      if (days <= 60) continue
      if (!inv.invoice_number.toUpperCase().startsWith('RPC')) continue

      if (!map.has(inv.vendor_name)) {
        map.set(inv.vendor_name, {
          vendor_name: inv.vendor_name,
          email: inv.email,
          overdueInvoices: [],
          totalOwing: 0,
        })
      }

      const group = map.get(inv.vendor_name)!
      const amount = parseFloat(inv.amount) || 0
      group.overdueInvoices.push({ ...inv, daysOutstanding: days })
      group.totalOwing += amount
      if (!group.email && inv.email) group.email = inv.email
    }

    return Array.from(map.values()).sort((a, b) => b.totalOwing - a.totalOwing)
  }, [allInvoices])

  const filteredVendorGroups = useMemo(
    () => vendorSearch
      ? vendorGroups.filter((v) => v.vendor_name.toLowerCase().includes(vendorSearch.toLowerCase()))
      : vendorGroups,
    [vendorGroups, vendorSearch]
  )

  const selectedGroup = vendorGroups.find((v) => v.vendor_name === selectedVendor) ?? null
  const emailContent = selectedGroup ? generateEmail(selectedGroup) : null

  async function handleCopy() {
    if (!emailContent) return
    await navigator.clipboard.writeText(emailContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!emailContent || !selectedGroup?.email) return
    setSending(true)
    setSendError(null)
    setSent(false)
    try {
      const { subject, body } = parseEmailContent(emailContent)
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ subject, body }),
      })
      if (!res.ok) {
        const data = await res.json()
        throw new Error(data.error ?? 'Failed to send email')
      }
      setSent(true)
      setTimeout(() => setSent(false), 4000)
    } catch (err) {
      setSendError(err instanceof Error ? err.message : 'Failed to send email')
    } finally {
      setSending(false)
    }
  }

  return (
    <div className="min-h-screen p-6 max-w-[1400px] mx-auto">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900 dark:text-white">Generate Email Content</h1>
            {vendorGroups.length > 0 && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {vendorGroups.length} vendor{vendorGroups.length !== 1 ? 's' : ''} with overdue invoices (&gt;60 days)
              </p>
            )}
          </div>
        </div>

        {/* Google auth */}
        {status === 'loading' ? (
          <div className="h-9 w-36 rounded-lg bg-gray-100 dark:bg-gray-700 animate-pulse" />
        ) : session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500 dark:text-gray-400">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-500 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-100 transition-colors underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('google')}
            className="flex items-center gap-2.5 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-800 text-sm font-medium text-gray-700 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700 shadow-sm transition-colors"
          >
            <svg className="w-4 h-4" viewBox="0 0 24 24">
              <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
              <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
              <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
              <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
            </svg>
            Sign in with Google
          </button>
        )}
      </header>

      {allInvoices.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-full bg-gray-100 dark:bg-gray-700 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400 dark:text-gray-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No data loaded</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mb-6">Go back and upload a CSV file first.</p>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      ) : vendorGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 dark:bg-green-900/30 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-500 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 dark:text-white mb-1">No overdue invoices</h2>
          <p className="text-sm text-gray-500 dark:text-gray-400">All invoices are within 60 days.</p>
        </div>
      ) : (
        <div className="flex gap-6 h-[calc(100vh-140px)]">
          {/* Vendor list */}
          <div className="w-80 flex-shrink-0 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-y-auto">
            <div className="p-3 border-b border-gray-100 dark:border-gray-700 flex flex-col gap-2">
              <p className="text-xs font-medium text-gray-400 dark:text-gray-500 uppercase tracking-wider">Select a vendor</p>
              <input
                type="text"
                placeholder="Search vendors..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-gray-200 placeholder-gray-400 dark:placeholder-gray-500 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <ul className="divide-y divide-gray-100 dark:divide-gray-700">
              {filteredVendorGroups.length === 0 && (
                <li className="px-4 py-6 text-sm text-center text-gray-400 dark:text-gray-500">No vendors match.</li>
              )}
              {filteredVendorGroups.map((group) => (
                <li key={group.vendor_name}>
                  <button
                    onClick={() => { setSelectedVendor(group.vendor_name); setCopied(false) }}
                    className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-gray-50 dark:hover:bg-gray-700/50 ${selectedVendor === group.vendor_name ? 'bg-blue-50 dark:bg-blue-900/30 border-l-2 border-blue-500' : ''}`}
                  >
                    <p className={`text-sm font-medium leading-snug ${selectedVendor === group.vendor_name ? 'text-blue-700 dark:text-blue-300' : 'text-gray-900 dark:text-gray-100'}`}>
                      {group.vendor_name}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400 dark:text-gray-500">
                        {group.overdueInvoices.length} invoice{group.overdueInvoices.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-medium text-red-600 dark:text-red-400">
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(group.totalOwing)}
                      </span>
                    </div>
                    {group.email && (
                      <p className="text-xs text-gray-400 dark:text-gray-500 truncate mt-0.5">{group.email}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Email content */}
          <div className="flex-1 flex flex-col bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 shadow-sm overflow-hidden">
            {!selectedGroup ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <svg className="w-10 h-10 text-gray-200 dark:text-gray-600 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400 dark:text-gray-500">Select a vendor to generate the email</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100 dark:border-gray-700">
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-gray-100">{selectedGroup.vendor_name}</p>
                    {selectedGroup.email && (
                      <p className="text-xs text-gray-400 dark:text-gray-500">{selectedGroup.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-700 dark:text-gray-300 dark:hover:bg-gray-600'}`}
                    >
                      {copied ? (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                          </svg>
                          Copied!
                        </>
                      ) : (
                        <>
                          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                          </svg>
                          Copy
                        </>
                      )}
                    </button>

                    {session ? (
                      <button
                        onClick={handleSend}
                        disabled={sending || !selectedGroup.email}
                        className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors disabled:opacity-50 disabled:cursor-not-allowed ${sent ? 'bg-green-50 text-green-700 border border-green-200 dark:bg-green-900/30 dark:text-green-400 dark:border-green-800' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
                      >
                        {sent ? (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                            </svg>
                            Sent!
                          </>
                        ) : sending ? (
                          <>
                            <svg className="w-4 h-4 animate-spin" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 12a8 8 0 018-8v8H4z" />
                            </svg>
                            Sending...
                          </>
                        ) : (
                          <>
                            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 19l9 2-9-18-9 18 9-2zm0 0v-8" />
                            </svg>
                            Send Email
                          </>
                        )}
                      </button>
                    ) : (
                      <button
                        onClick={() => signIn('google')}
                        className="flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium bg-blue-600 text-white hover:bg-blue-700 transition-colors"
                      >
                        Sign in to Send
                      </button>
                    )}
                  </div>
                </div>
                {sendError && (
                  <div className="px-5 py-2 bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800">
                    <p className="text-sm text-red-600 dark:text-red-400">{sendError}</p>
                  </div>
                )}
                <pre className="flex-1 p-5 text-sm text-gray-700 dark:text-gray-300 font-mono whitespace-pre-wrap overflow-y-auto leading-relaxed">
                  {emailContent}
                </pre>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-gray-900 dark:bg-gray-100 text-white dark:text-gray-900 text-sm font-medium shadow-lg transition-all duration-300 ${sent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <svg className="w-4 h-4 text-green-400 dark:text-green-600 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Email successfully sent
      </div>
    </div>
  )
}
