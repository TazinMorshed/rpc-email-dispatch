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
```


Deployed : https://email-dispatch-production.up.railway.app

### Development

```bash
npm run dev
```

App runs at `http://localhost:3000`.
