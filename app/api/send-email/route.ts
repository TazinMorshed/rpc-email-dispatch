import { getServerSession } from 'next-auth'
import { authOptions } from '@/lib/authOptions'
import { isAllowedSender } from '@/lib/allowedSenders'
import { google } from 'googleapis'
import { NextRequest, NextResponse } from 'next/server'

export async function POST(req: NextRequest) {
  const session = await getServerSession(authOptions)

  if (!session?.accessToken) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 })
  }

  const senderEmail = session.user?.email
  if (!isAllowedSender(senderEmail)) {
    console.warn(`[send-email] Blocked send attempt from ${senderEmail ?? 'unknown account'}`)
    return NextResponse.json(
      { error: `${senderEmail ?? 'This account'} is not authorized to send email from this app` },
      { status: 403 },
    )
  }

  let body: { subject?: unknown; bodyHtml?: unknown; bodyText?: unknown; to?: unknown; cc?: unknown; includeSignature?: unknown }
  try {
    body = await req.json()
  } catch {
    return NextResponse.json({ error: 'Invalid request body' }, { status: 400 })
  }

  const subject = body.subject as string | undefined
  const bodyHtml = body.bodyHtml as string | undefined
  const bodyText = body.bodyText as string | undefined
  const toOverride = body.to
  const includeCc = body.cc === true
  const includeSignature = body.includeSignature === true

  const to = typeof toOverride === 'string' && toOverride.trim()
    ? toOverride.trim()
    : process.env.TEST_RECIPIENT

  if (!to || !subject || (!bodyHtml && !bodyText)) {
    return NextResponse.json({ error: 'Missing required fields' }, { status: 400 })
  }

  const rpcBillingEmail = process.env.SEND_AS_EMAIL

  const oauth2Client = new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
  )
  oauth2Client.setCredentials({ access_token: session.accessToken })

  const gmail = google.gmail({ version: 'v1', auth: oauth2Client })

  // Fetch Gmail signature only when requested
  let signature = ''
  if (includeSignature) {
    try {
      const sendAsRes = await gmail.users.settings.sendAs.list({ userId: 'me' })
      const defaultSendAs = sendAsRes.data.sendAs?.find((s) => s.isDefault) ?? sendAsRes.data.sendAs?.[0]
      signature = defaultSendAs?.signature ?? ''
    } catch {
      // Signature fetch failed — send without it
    }
  }

  // Use pre-built HTML body if provided, otherwise convert plain text
  let htmlContent: string
  if (bodyHtml) {
    htmlContent = bodyHtml
  } else {
    const converted = (bodyText as string)
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
      .replace(/\n/g, '<br>')
      .replace(
        /rpcbilling@lufa\.com/g,
        '<a href="mailto:rpcbilling@lufa.com" style="color:#1d4ed8;font-weight:bold;">rpcbilling@lufa.com</a>'
      )
    htmlContent = `<div style="font-family:Arial,sans-serif;font-size:14px;">${converted}</div>`
  }
  const fullHtml = signature ? `${htmlContent}<br>${signature}` : htmlContent

  const encodedSubject = `=?UTF-8?B?${Buffer.from(subject).toString('base64')}?=`

  const emailLines = [
    `To: ${to}`,
    ...(includeCc && rpcBillingEmail ? [`Cc: ${rpcBillingEmail}`] : []),
    ...(rpcBillingEmail ? [`Reply-To: ${rpcBillingEmail}`] : []),
    `Subject: ${encodedSubject}`,
    'Content-Type: text/html; charset=utf-8',
    'MIME-Version: 1.0',
    '',
    fullHtml,
  ]
  const raw = Buffer.from(emailLines.join('\r\n')).toString('base64url')

  try {
    await gmail.users.messages.send({
      userId: 'me',
      requestBody: { raw },
    })
  } catch (err) {
    console.error('[send-email] Gmail API error:', err)
    let message = 'Gmail API error — failed to send email'
    if (err instanceof Error) {
      message = err.message
      const gmailErr = err as { code?: number; errors?: Array<{ message: string }> }
      if (gmailErr.code === 401) message = 'Gmail authentication failed — please sign out and sign in again'
      else if (gmailErr.code === 403) message = 'Gmail permission denied — please sign out and sign in again'
      else if (gmailErr.code === 429) message = 'Gmail rate limit exceeded — please try again shortly'
      else if (gmailErr.errors?.[0]?.message) message = gmailErr.errors[0].message
    }
    return NextResponse.json({ error: message }, { status: 500 })
  }

  return NextResponse.json({ success: true })
}
