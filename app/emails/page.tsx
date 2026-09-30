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


function formatAmount(val: string): string {
  const n = parseFloat(val)
  if (isNaN(n)) return val
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(n)
}

const TRANSLATIONS = {
  en: {
    greeting: 'Hello,',
    opening: 'I am contacting regarding the overdue payment for RPC.',
    invoiceHeader: 'The following invoices are currently owing and are due more than 60 days:',
    daysOutstanding: 'days outstanding',
    totalOwing: 'Total owing:',
    paymentRequest: 'If payment has already been made, please reply to rpcbilling@lufa.com',
    eTransferNote: 'If you wish to make an electronic transfer, please let us know and we will send you the details.',
    signOff: 'Thank you,',
    company: 'Lufa farms.',
    dateLocale: 'en-CA' as const,
  },
  fr: {
    greeting: 'Bonjour,',
    opening: 'Je vous contacte au sujet du paiement en souffrance pour RPC.',
    invoiceHeader: 'Les factures suivantes sont actuellement impayées et sont dues depuis plus de 60 jours :',
    daysOutstanding: 'jours de retard',
    totalOwing: 'Montant dû :',
    paymentRequest: "Si le paiement a déjà été effectué, veuillez répondre à rpcbilling@lufa.com",
    eTransferNote: "Si vous souhaitez effectuer un virement électronique, veuillez nous le faire savoir et nous vous ferons parvenir les détails.",
    signOff: 'Merci,',
    company: 'Lufa farms.',
    dateLocale: 'fr-CA' as const,
  },
}

function generateEmail(vendor: VendorGroup, lang: 'en' | 'fr'): string {
  const t = TRANSLATIONS[lang]
  const today = new Date().toLocaleDateString(t.dateLocale, { month: 'long', day: 'numeric', year: 'numeric' })
  const subject = `RPC Payment Follow-Up – ${vendor.vendor_name} – ${today}`

  const invoiceLines = vendor.overdueInvoices
    .map((inv) => {
      const dateStr = new Date(inv.date).toLocaleDateString(t.dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })
      return `• ${inv.invoice_number} – ${dateStr} – ${formatAmount(inv.amount)} (${inv.daysOutstanding} ${t.daysOutstanding})`
    })
    .join('\n')

  return `Subject: ${subject}

${t.greeting}

${t.opening} ${t.invoiceHeader}
${invoiceLines}

${t.totalOwing} ${formatAmount(String(vendor.totalOwing))}

${t.paymentRequest}

${t.signOff}
${t.company}`
}

function generateEmailHtmlBody(vendor: VendorGroup, lang: 'en' | 'fr'): string {
  const t = TRANSLATIONS[lang]

  const cell = 'padding:4px 10px;border:1px solid #e5e7eb;font-size:13px;'
  const rows = vendor.overdueInvoices
    .map((inv) => {
      const dateStr = new Date(inv.date).toLocaleDateString(t.dateLocale, { month: 'short', day: 'numeric', year: 'numeric' })
      return `<tr>
        <td style="${cell}">${inv.invoice_number}</td>
        <td style="${cell}">${dateStr}</td>
        <td style="${cell}background-color:#fef08a;font-weight:600;">${formatAmount(inv.amount)}</td>
      </tr>`
    })
    .join('')

  const totalRow = `<tr>
    <td style="${cell}font-weight:700;">${t.totalOwing}</td>
    <td style="${cell}"></td>
    <td style="${cell}background-color:#fef08a;font-weight:700;">${formatAmount(String(vendor.totalOwing))}</td>
  </tr>`

  const rpcEmailLink = '<a href="mailto:rpcbilling@lufa.com" style="color:#1d4ed8;font-weight:bold;">rpcbilling@lufa.com</a>'
  const paymentRequestHtml = t.paymentRequest.replace('rpcbilling@lufa.com', rpcEmailLink)

  return `<div style="font-family:Arial,sans-serif;font-size:14px;line-height:1.6;color:#111827;">
<p style="margin:0 0 24px 0;">${t.greeting}</p>
<p style="margin:0 0 14px 0;">${t.opening} ${t.invoiceHeader}</p>
<table style="border-collapse:collapse;margin:0 0 14px 0;font-size:13px;">
  <thead>
    <tr style="background-color:#f3f4f6;">
      <th style="${cell}text-align:left;">Invoice #</th>
      <th style="${cell}text-align:left;">Date</th>
      <th style="${cell}text-align:left;">Amount (CAD)</th>
    </tr>
  </thead>
  <tbody>
    ${rows}
    ${totalRow}
  </tbody>
</table>
<p style="margin:0 0 14px 0;">${paymentRequestHtml}</p>
<p style="margin:0 0 24px 0;">${t.eTransferNote}</p>
<p style="margin:0;">${t.signOff}<br>${t.company}</p>
</div>`
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
  const [sendToSupplier, setSendToSupplier] = useState(false)
  const [ccRpcBilling, setCcRpcBilling] = useState(false)
  const [includeSignature, setIncludeSignature] = useState(true)
  const [pendingEmails, setPendingEmails] = useState<string[]>([])
  const [committedEmails, setCommittedEmails] = useState<string[]>([])
  const [tagInput, setTagInput] = useState('')
  const [lang, setLang] = useState<'en' | 'fr'>('en')
  const [supplierEmailMap, setSupplierEmailMap] = useState<Record<string, string>>({})

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

  useEffect(() => {
    fetch('/api/suppliers')
      .then((res) => res.json())
      .then((suppliers: { name: string; email: string }[]) => {
        const map: Record<string, string> = {}
        for (const s of suppliers) {
          if (s.name && s.email) map[s.name.trim()] = s.email.trim()
        }
        setSupplierEmailMap(map)
      })
      .catch(() => {/* ignore */})
  }, [])

  useEffect(() => {
    const emails = selectedGroup?.email ? [selectedGroup.email] : []
    setPendingEmails(emails)
    setCommittedEmails(emails)
    setTagInput('')
    setSendToSupplier(false)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedVendor])

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
  const emailContent = selectedGroup ? generateEmail(selectedGroup, lang) : null

  function isValidEmail(email: string): boolean {
    return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())
  }

  function buildUpdatedEmails(baseEmails: string[], candidate: string): string[] {
    const val = candidate.trim()
    if (!val || !isValidEmail(val) || baseEmails.includes(val)) return baseEmails
    return [...baseEmails, val]
  }

  const tagInputValid = tagInput.trim() === '' || isValidEmail(tagInput)
  const emailDirty = JSON.stringify(pendingEmails) !== JSON.stringify(committedEmails) || tagInput.trim() !== ''
  const noEmailConfigured = sendToSupplier && pendingEmails.length === 0 && tagInput.trim() === ''
  const noLiveRecipients = sendToSupplier && pendingEmails.length === 0 && (tagInput.trim() === '' || !tagInputValid)

  function addTag() {
    const updated = buildUpdatedEmails(pendingEmails, tagInput)
    setPendingEmails(updated)
    if (updated !== pendingEmails) setTagInput('')
  }

  function removeTag(i: number) { setPendingEmails((prev) => prev.filter((_, idx) => idx !== i)) }

  function handleTagKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter' || e.key === 'Tab' || e.key === ',') { e.preventDefault(); addTag() }
    else if (e.key === 'Backspace' && tagInput === '') removeTag(pendingEmails.length - 1)
  }

  function commitPendingEmails() {
    const updated = buildUpdatedEmails(pendingEmails, tagInput)
    setPendingEmails(updated)
    setCommittedEmails(updated)
    setTagInput('')
    return updated
  }

  function handleSendToSupplierChange(nextValue: boolean) {
    if (nextValue && selectedVendor) {
      const supplierEmail = supplierEmailMap[selectedVendor] ?? ''
      const emails = supplierEmail ? [supplierEmail] : []
      setPendingEmails(emails)
      setCommittedEmails(emails)
      setTagInput('')
    }
    setSendToSupplier(nextValue)
  }

  async function handleCopy() {
    if (!emailContent) return
    await navigator.clipboard.writeText(emailContent)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  async function handleSend() {
    if (!emailContent || !selectedGroup) return
    const liveRecipients = sendToSupplier ? commitPendingEmails() : []
    if (sendToSupplier && liveRecipients.length === 0) {
      setSendError('No recipients — add at least one email address before sending live.')
      return
    }
    setSending(true)
    setSendError(null)
    setSent(false)
    try {
      const { subject } = parseEmailContent(emailContent)
      const res = await fetch('/api/send-email', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          subject,
          bodyHtml: generateEmailHtmlBody(selectedGroup, lang),
          to: sendToSupplier ? liveRecipients.join(', ') : undefined,
          cc: ccRpcBilling,
          includeSignature,
        }),
      })
      if (!res.ok) {
        let message = `Server error (${res.status})`
        try {
          const data = await res.json()
          message = data.error ?? message
        } catch { /* non-JSON body */ }
        throw new Error(message)
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
    <div className="min-h-screen bg-white p-6 max-w-[1400px] mx-auto">
      <header className="mb-6 flex items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <Link
            href="/"
            className="flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-800 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
            </svg>
            Back
          </Link>
          <div>
            <h1 className="text-2xl font-semibold text-gray-900">Generate Email Content</h1>
            {vendorGroups.length > 0 && (
              <p className="text-sm text-gray-500 mt-0.5">
                {vendorGroups.length} vendor{vendorGroups.length !== 1 ? 's' : ''} with overdue invoices (&gt;60 days)
              </p>
            )}
          </div>
        </div>

        {/* Google auth */}
        {status === 'loading' ? (
          <div className="h-9 w-36 rounded-lg bg-gray-100 animate-pulse" />
        ) : session ? (
          <div className="flex items-center gap-3">
            <span className="text-sm text-gray-500">{session.user?.email}</span>
            <button
              onClick={() => signOut()}
              className="text-sm text-gray-500 hover:text-gray-800 transition-colors underline underline-offset-2"
            >
              Sign out
            </button>
          </div>
        ) : (
          <button
            onClick={() => signIn('google')}
            className="flex items-center gap-2.5 px-4 py-2 rounded-lg border border-gray-200 bg-white text-sm font-medium text-gray-700 hover:bg-gray-50 shadow-sm transition-colors"
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
          <div className="w-16 h-16 rounded-full bg-gray-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-1">No data loaded</h2>
          <p className="text-sm text-gray-500 mb-6">Go back and upload a CSV file first.</p>
          <Link
            href="/"
            className="px-4 py-2.5 rounded-lg bg-blue-600 text-white text-sm font-medium hover:bg-blue-700 transition-colors"
          >
            Go to dashboard
          </Link>
        </div>
      ) : vendorGroups.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-32 text-center">
          <div className="w-16 h-16 rounded-full bg-green-100 flex items-center justify-center mb-4">
            <svg className="w-8 h-8 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
            </svg>
          </div>
          <h2 className="text-lg font-medium text-gray-900 mb-1">No overdue invoices</h2>
          <p className="text-sm text-gray-500">All invoices are within 60 days.</p>
        </div>
      ) : (
        <div className="flex gap-6 h-[calc(100vh-140px)]">
          {/* Vendor list */}
          <div className="w-80 flex-shrink-0 bg-white rounded-xl border border-gray-200 shadow-sm overflow-y-auto">
            <div className="p-3 border-b border-gray-100 flex flex-col gap-2">
              <p className="text-xs font-medium text-gray-400 uppercase tracking-wider">Select a vendor</p>
              <input
                type="text"
                placeholder="Search vendors..."
                value={vendorSearch}
                onChange={(e) => setVendorSearch(e.target.value)}
                className="w-full rounded-lg border border-gray-200 bg-white text-gray-900 placeholder-gray-400 px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
            </div>
            <ul className="divide-y divide-gray-100">
              {filteredVendorGroups.length === 0 && (
                <li className="px-4 py-6 text-sm text-center text-gray-400">No vendors match.</li>
              )}
              {filteredVendorGroups.map((group) => (
                <li key={group.vendor_name}>
                  <button
                    onClick={() => { setSelectedVendor(group.vendor_name); setCopied(false) }}
                    className={`w-full text-left px-4 py-3.5 transition-colors hover:bg-gray-50 ${selectedVendor === group.vendor_name ? 'bg-blue-50 border-l-2 border-blue-500' : ''}`}
                  >
                    <p className={`text-sm font-medium leading-snug ${selectedVendor === group.vendor_name ? 'text-blue-700' : 'text-gray-900'}`}>
                      {group.vendor_name}
                    </p>
                    <div className="flex items-center justify-between mt-1">
                      <span className="text-xs text-gray-400">
                        {group.overdueInvoices.length} invoice{group.overdueInvoices.length !== 1 ? 's' : ''}
                      </span>
                      <span className="text-xs font-medium text-red-600">
                        {new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(group.totalOwing)}
                      </span>
                    </div>
                    {group.email && (
                      <p className="text-xs text-gray-400 truncate mt-0.5">{group.email}</p>
                    )}
                  </button>
                </li>
              ))}
            </ul>
          </div>

          {/* Email content */}
          <div className="flex-1 flex flex-col bg-white rounded-xl border border-gray-200 shadow-sm overflow-hidden">
            {!selectedGroup ? (
              <div className="flex-1 flex flex-col items-center justify-center text-center p-8">
                <svg className="w-10 h-10 text-gray-200 mb-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M3 8l7.89 5.26a2 2 0 002.22 0L21 8M5 19h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v10a2 2 0 002 2z" />
                </svg>
                <p className="text-sm text-gray-400">Select a vendor to generate the email</p>
              </div>
            ) : (
              <>
                {/* Vendor header */}
                <div className="flex items-center justify-between px-5 py-3.5 border-b border-gray-100">
                  <div>
                    <p className="text-sm font-medium text-gray-900">{selectedGroup.vendor_name}</p>
                    {selectedGroup.email && (
                      <p className="text-xs text-gray-400">{selectedGroup.email}</p>
                    )}
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => setLang(l => l === 'en' ? 'fr' : 'en')}
                      className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-semibold transition-colors bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200"
                    >
                      <span className={lang === 'en' ? 'text-blue-600' : 'text-gray-400'}>EN</span>
                      <span className="text-gray-300">/</span>
                      <span className={lang === 'fr' ? 'text-blue-600' : 'text-gray-400'}>FR</span>
                    </button>
                    <button
                      onClick={handleCopy}
                      className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${copied ? 'bg-green-50 text-green-700 border border-green-200' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
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
                  </div>
                </div>

                {/* Send settings bar */}
                <div className={`flex shrink-0 items-center justify-between gap-4 border-b px-5 py-3 transition-colors ${noEmailConfigured ? 'border-red-200 bg-red-50/60' : sendToSupplier ? 'border-emerald-200 bg-emerald-50/70' : 'border-gray-100 bg-gray-50/70'}`}>
                  <div className="flex flex-col gap-2 flex-1 min-w-0">
                    {/* LIVE / TEST toggle */}
                    <button
                      type="button"
                      onClick={() => handleSendToSupplierChange(!sendToSupplier)}
                      className="flex items-center gap-2 cursor-pointer select-none w-fit"
                    >
                      <div className={`relative h-5 w-9 rounded-full transition-colors duration-300 ease-in-out ${noEmailConfigured ? 'bg-red-400' : sendToSupplier ? 'bg-green-500' : 'bg-gray-300'}`}>
                        <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ease-in-out ${sendToSupplier ? 'translate-x-4' : 'translate-x-0'}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                      </div>
                      <span className={`text-xs font-semibold ${noEmailConfigured ? 'text-red-600' : 'text-gray-700'}`}>
                        {sendToSupplier ? 'LIVE — Sending to vendor' : 'TEST — Sending to test address'}
                      </span>
                      {sendToSupplier ? (
                        !noEmailConfigured && (
                          <span className="text-xs font-medium text-emerald-700">
                            → {pendingEmails.length > 0 ? pendingEmails.join(', ') : tagInput.trim()}
                          </span>
                        )
                      ) : (
                        process.env.NEXT_PUBLIC_TEST_RECIPIENT && (
                          <span className="text-xs font-medium text-gray-500">
                            → {process.env.NEXT_PUBLIC_TEST_RECIPIENT}
                          </span>
                        )
                      )}
                    </button>

                    {/* Recipient area */}
                    {sendToSupplier && (
                      <div className="max-w-xl">
                        {noEmailConfigured ? (
                          <p className="text-xs font-medium text-red-500 pl-0">
                            No email on file for this supplier — update <code className="bg-red-100 px-1 rounded">suppliers.json</code> or enter one below.
                          </p>
                        ) : null}
                        <div className={`flex flex-wrap items-center gap-1.5 rounded-2xl border px-3 py-2 shadow-sm transition-colors ${noEmailConfigured ? 'border-red-300 bg-white mt-1.5' : !tagInputValid ? 'border-red-300 bg-red-50 focus-within:ring-2 focus-within:ring-red-200' : emailDirty ? 'border-blue-300 bg-blue-50/60 focus-within:ring-2 focus-within:ring-blue-200' : 'border-gray-200 bg-white focus-within:ring-2 focus-within:ring-blue-100'}`}>
                          {pendingEmails.map((email, i) => (
                            <span key={email} className="flex items-center gap-1 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                              {email}
                              <button onClick={() => removeTag(i)} className="ml-0.5 font-bold leading-none text-emerald-500 hover:text-red-500 transition-colors">×</button>
                            </span>
                          ))}
                          <input
                            type="text"
                            value={tagInput}
                            onChange={(e) => setTagInput(e.target.value)}
                            onKeyDown={handleTagKeyDown}
                            onBlur={addTag}
                            className="min-w-[160px] flex-1 bg-transparent text-xs text-gray-700 outline-none placeholder:text-gray-400"
                            placeholder={pendingEmails.length === 0 ? 'email@domain.com' : 'Add email, press Enter'}
                          />
                        </div>
                        <div className="flex items-center gap-2 mt-1">
                          {!tagInputValid && <span className="text-xs font-medium text-red-500">Invalid email address</span>}
                          {emailDirty && tagInputValid && (
                            <>
                              <button onClick={commitPendingEmails} className="rounded-lg bg-blue-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-blue-700 transition-colors">Accept</button>
                              <span className="text-xs font-medium text-blue-600">Unsaved changes</span>
                            </>
                          )}
                        </div>
                      </div>
                    )}

                    {/* CC + Signature toggles — same row, same size */}
                    <div className="flex items-center gap-5">
                      <button
                        type="button"
                        onClick={() => setCcRpcBilling(v => !v)}
                        className="flex items-center gap-2 cursor-pointer select-none w-fit"
                      >
                        <div className={`relative h-5 w-9 rounded-full transition-colors duration-300 ease-in-out ${ccRpcBilling ? 'bg-violet-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ease-in-out ${ccRpcBilling ? 'translate-x-4' : 'translate-x-0'}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">
                          {ccRpcBilling ? `CC: ${process.env.NEXT_PUBLIC_SEND_AS_EMAIL}` : 'CC rpcbilling'}
                        </span>
                      </button>

                      <button
                        type="button"
                        onClick={() => setIncludeSignature(v => !v)}
                        className="flex items-center gap-2 cursor-pointer select-none w-fit"
                      >
                        <div className={`relative h-5 w-9 rounded-full transition-colors duration-300 ease-in-out ${includeSignature ? 'bg-blue-500' : 'bg-gray-300'}`}>
                          <span className={`absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white transition-all duration-300 ease-in-out ${includeSignature ? 'translate-x-4' : 'translate-x-0'}`} style={{ boxShadow: '0 1px 4px rgba(0,0,0,0.25)' }} />
                        </div>
                        <span className="text-xs font-semibold text-gray-700">
                          {includeSignature ? 'Signature ON' : 'Signature OFF'}
                        </span>
                      </button>
                    </div>
                  </div>

                  {/* Send button */}
                  {session ? (
                    <button
                      onClick={handleSend}
                      disabled={sending || noLiveRecipients}
                      className={`flex shrink-0 items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold shadow-sm transition-colors disabled:cursor-not-allowed disabled:opacity-50 ${sent ? 'border border-emerald-200 bg-emerald-50 text-emerald-700' : sendToSupplier ? 'bg-green-600 text-white hover:bg-green-700' : 'bg-blue-600 text-white hover:bg-blue-700'}`}
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
                            <circle cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" className="opacity-25" />
                            <path d="M4 12a8 8 0 018-8v8H4z" fill="currentColor" className="opacity-75" />
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
                      className="flex shrink-0 items-center gap-2 rounded-xl bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-blue-700 transition-colors"
                    >
                      Sign in to Send
                    </button>
                  )}
                </div>

                {sendError && (
                  <div className="px-5 py-2 bg-red-50 border-b border-red-100">
                    <p className="text-sm text-red-600">{sendError}</p>
                  </div>
                )}
                <div className="flex-1 overflow-y-auto">
                  <div className="px-5 py-2.5 border-b border-gray-100 bg-gray-50">
                    <span className="text-xs font-medium text-gray-400 uppercase tracking-wider">Subject: </span>
                    <span className="text-xs text-gray-700 font-medium">{parseEmailContent(emailContent ?? '').subject}</span>
                  </div>
                  <div
                    className="p-6 bg-white"
                    dangerouslySetInnerHTML={{ __html: generateEmailHtmlBody(selectedGroup, lang) }}
                  />
                </div>
              </>
            )}
          </div>
        </div>
      )}

      {/* Toast */}
      <div className={`fixed bottom-6 left-1/2 -translate-x-1/2 flex items-center gap-2.5 px-4 py-3 rounded-xl bg-gray-900 text-white text-sm font-medium shadow-lg transition-all duration-300 ${sent ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-2 pointer-events-none'}`}>
        <svg className="w-4 h-4 text-green-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
        </svg>
        Email successfully sent
      </div>
    </div>
  )
}
