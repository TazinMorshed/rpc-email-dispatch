import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'
import Papa from 'papaparse'

export interface Invoice {
  vendor_name: string
  date: string
  invoice_number: string
  amount: string
  email: string
}

const MONTH_MAP: Record<string, string> = {
  Jan: '01', Feb: '02', Mar: '03', Apr: '04', May: '05', Jun: '06',
  Jul: '07', Aug: '08', Sep: '09', Oct: '10', Nov: '11', Dec: '12',
}

// Converts "30-Apr-2025" or "30-4-25" → "2025-04-30"
function formatDate(dateStr: string): string {
  const parts = dateStr.trim().split('-')
  if (parts.length !== 3) return dateStr.trim()
  const [d, m, y] = parts
  const yearNum = parseInt(y)
  if (isNaN(yearNum) || isNaN(parseInt(d))) return dateStr.trim()
  const year = yearNum < 100 ? 2000 + yearNum : yearNum
  const month = MONTH_MAP[m] ?? (isNaN(parseInt(m)) ? m : m.padStart(2, '0'))
  return `${year}-${month}-${d.padStart(2, '0')}`
}

// Raw NetSuite exports carry a 4-line report preamble (company, entity, report
// title, "As of <date>") before the column header, and the header labels may
// have trailing spaces. Everything before the header row is ignored.
const HEADER_FIRST_COL = 'customer'

// CSV columns: Customer, Transaction Type, Date, Document Number, P.O. No., Due Date, Age,
// Open Balance[, Commercial name, email]  — the last two only exist in the enriched export.
export function parseRawCsv(csvContent: string): Invoice[] {
  const { data } = Papa.parse<string[]>(csvContent, { skipEmptyLines: true })

  const invoices: Invoice[] = []
  let currentVendorName = ''
  let skipSection = false
  let headerSeen = false

  for (const row of data) {
    const customer = row[0]?.trim() ?? ''
    const transType = row[1]?.trim() ?? ''
    const date = row[2]?.trim() ?? ''
    const docNumber = row[3]?.trim() ?? ''
    const openBalance = row[7]?.trim() ?? ''
    const commercialName = row[8]?.trim() ?? ''
    const email = row[9]?.trim() ?? ''

    // Report preamble and the column header itself carry no invoice data.
    if (!headerSeen) {
      if (customer.toLowerCase() === HEADER_FIRST_COL) headerSeen = true
      continue
    }

    // Section header or subtotal row (customer has value, no transaction type)
    if (!transType) {
      if (!customer) continue
      if (customer.startsWith('Total')) continue
      if (customer === '- No Customer/Project -') { skipSection = true; continue }
      // Vendor/customer section header — strip CUS/VEN ID prefix
      skipSection = false
      currentVendorName = customer.replace(/^(CUS|VEN)\d+\s+/, '').trim()
      continue
    }

    if (skipSection) continue
    if (transType === 'Journal') continue
    if (!openBalance) continue

    invoices.push({
      vendor_name: commercialName || currentVendorName,
      date: formatDate(date),
      invoice_number: docNumber,
      amount: openBalance.replace(/[$,]/g, ''),
      email,
    })
  }

  return invoices
}

export async function GET() {
  const csvPath = path.join(process.cwd(), '..', 'rpc', 'data.csv')
  const csvContent = fs.readFileSync(csvPath, 'utf-8')
  const invoices = parseRawCsv(csvContent)
  return NextResponse.json(invoices)
}

function loadSupplierEmails(): Record<string, string> {
  try {
    const suppliersPath = path.join(process.cwd(), 'data', 'suppliers.json')
    const raw = fs.readFileSync(suppliersPath, 'utf-8')
    const suppliers: { name: string; email: string }[] = JSON.parse(raw)
    return Object.fromEntries(suppliers.map((s) => [s.name.trim(), s.email.trim()]))
  } catch {
    return {}
  }
}

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const csvContent = await file.text()
  const invoices = parseRawCsv(csvContent)
  const emailMap = loadSupplierEmails()
  for (const inv of invoices) {
    if (!inv.email) inv.email = emailMap[inv.vendor_name] ?? ''
  }
  return NextResponse.json(invoices)
}
