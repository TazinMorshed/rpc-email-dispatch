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

function formatDate(dateStr: string): string {
  const [d, m, y] = dateStr.split('-')
  const year = parseInt(y) < 100 ? 2000 + parseInt(y) : parseInt(y)
  return `${year}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`
}

export function parseRawCsv(csvContent: string): Invoice[] {
  const { data } = Papa.parse<string[]>(csvContent, { skipEmptyLines: true })

  const invoices: Invoice[] = []
  let currentVendorName = ''
  let skipSection = false

  for (const row of data) {
    const [customer, transType, date, docNumber, , , , openBalance, commercialName, email] = row

    // Skip header row
    if (customer === 'Customer') continue

    // Section header or total row (customer has value, no transaction type)
    if (customer && !transType) {
      if (customer.startsWith('Total')) continue
      if (customer === '- No Customer/Project -') {
        skipSection = true
        continue
      }
      // Vendor/customer header row — strip the CUS/VEN ID prefix
      skipSection = false
      currentVendorName = customer.replace(/^(CUS|VEN)\d+\s+/, '').trim()
      continue
    }

    if (skipSection) continue
    if (!transType || transType === 'Journal') continue

    const vendorName = commercialName?.trim() || currentVendorName
    const amount = openBalance.replace(/[$,]/g, '')

    invoices.push({
      vendor_name: vendorName,
      date: formatDate(date),
      invoice_number: docNumber,
      amount,
      email: email?.trim() || '',
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

export async function POST(request: Request) {
  const formData = await request.formData()
  const file = formData.get('file') as File | null
  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 })
  }
  const csvContent = await file.text()
  const invoices = parseRawCsv(csvContent)
  return NextResponse.json(invoices)
}
