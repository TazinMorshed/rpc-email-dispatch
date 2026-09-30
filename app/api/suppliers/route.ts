import { NextResponse } from 'next/server'
import fs from 'fs'
import path from 'path'

export async function GET() {
  try {
    const suppliersPath = path.join(process.cwd(), 'data', 'suppliers.json')
    const raw = fs.readFileSync(suppliersPath, 'utf-8')
    const suppliers: { name: string; email: string }[] = JSON.parse(raw)
    return NextResponse.json(suppliers)
  } catch {
    return NextResponse.json([], { status: 200 })
  }
}
