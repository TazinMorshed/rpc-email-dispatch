# RPC Email Dispatch

Internal tool for automating vendor payment follow-up emails. Upload a CSV of vendor invoices, identify overdue accounts, and send payment reminders directly from the app.

## Getting Started

### Prerequisites

- Node.js 20+

### Installation

```bash
npm install
```

Create a `.env.local` file in the project root and fill in the required values:

```
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TEST_RECIPIENT=
ALLOWED_SENDERS=
```

### Restricting who can send

`ALLOWED_SENDERS` is a comma-separated allowlist of the accounts permitted to
sign in and send mail. Entries are either full addresses or whole domains:

```
ALLOWED_SENDERS=@lufa.com                              # anyone in the domain
ALLOWED_SENDERS=rpcbilling@lufa.com,m.shad@lufa.com    # named accounts only
```

A `@domain` entry matches that domain exactly — `someone@mail.lufa.com` is not
covered by `@lufa.com`. Matching is case-insensitive, and the address compared
is the verified one from the Google profile, not anything client-supplied.

Any other Google account is rejected at sign-in, and `/api/send-email` returns
403 for a session that is not on the list. Leaving the variable unset or empty
disables the restriction, so it must be set in every deployed environment.


Deployed : https://email-dispatch-production.up.railway.app

### Development

```bash
npm run dev
```

App runs at `http://localhost:3000`.
