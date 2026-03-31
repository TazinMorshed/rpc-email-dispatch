# RPC Email Dispatch

Internal tool for automating payment follow-up emails to vendors with overdue invoices (60+ days). Built for Lufa Farms.

## What it does

- Upload a vendor invoice CSV exported from the accounting system
- View and filter invoices in a dashboard
- Auto-identify overdue invoices (60+ days, RPC prefix)
- Generate and send payment reminder emails via Gmail

## Tech Stack

- **Next.js 16** — framework (App Router)
- **NextAuth** — Google OAuth2 authentication
- **Gmail API** — email sending
- **PapaParse** — CSV parsing
- **Tailwind CSS** — styling
- **oauth2-proxy** — restricts access to `@lufa.com` accounts only
- **Docker** — containerized deployment

## Local Development

### Prerequisites

- Node.js 20+
- npm

### Setup

```bash
npm install
```

Create a `.env.local` file in the project root:

```
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
TEST_RECIPIENT=your_test_email@gmail.com
```

```bash
npm run dev
```

App runs at `http://localhost:3000`.

## Running with Docker

### Prerequisites

- Docker Desktop

### Setup

Create a `.env.docker` file in the project root:

```
NEXTAUTH_SECRET=your_nextauth_secret
NEXTAUTH_URL=http://localhost:3000
GOOGLE_CLIENT_ID=your_google_client_id
GOOGLE_CLIENT_SECRET=your_google_client_secret
TEST_RECIPIENT=your_test_email@gmail.com
HOSTNAME=0.0.0.0
```

### Run (app only)

```bash
docker build -t rpc-email-dispatch .
docker run -p 3000:3000 --env-file .env.docker rpc-email-dispatch
```

### Run with oauth2-proxy (recommended)

Runs the app behind oauth2-proxy, restricting access to `@lufa.com` Google accounts only.

```bash
docker compose up --build
```

App is accessible at `http://localhost:4180`. Sign in with your `@lufa.com` Google account.

## Google Cloud Console Setup

1. Create a project at [console.cloud.google.com](https://console.cloud.google.com)
2. Enable the **Gmail API**
3. Configure the **OAuth consent screen** (External, add test users)
4. Create an **OAuth 2.0 Client ID** (Web application) with these redirect URIs:
   - `http://localhost:3000/api/auth/callback/google` (local dev)
   - `http://localhost:4180/oauth2/callback` (Docker with oauth2-proxy)
5. Add your server's IP/domain redirect URIs when deploying

## Project Structure

```
app/
  api/
    auth/[...nextauth]/   # NextAuth Google OAuth handler
    invoices/             # CSV upload and parsing
    send-email/           # Gmail API email sending
  emails/                 # Email generation and send UI
  page.tsx                # Invoice dashboard
lib/
  authOptions.ts          # NextAuth configuration
types/
  next-auth.d.ts          # Session/JWT type augmentation
Dockerfile                # Multi-stage Docker build
docker-compose.yml        # App + oauth2-proxy setup
```

## Environment Variables

| Variable | Required | Description |
|---|---|---|
| `NEXTAUTH_SECRET` | Yes | Random secret for JWT signing |
| `NEXTAUTH_URL` | Yes | Base URL of the app |
| `GOOGLE_CLIENT_ID` | Yes | Google OAuth2 client ID |
| `GOOGLE_CLIENT_SECRET` | Yes | Google OAuth2 client secret |
| `TEST_RECIPIENT` | Yes | Email address all emails are sent to during testing |
| `HOSTNAME` | Docker only | Set to `0.0.0.0` for Docker networking |

## Deployment

The app is designed to be deployed via Docker. Provide the dev team with:

1. The `docker-compose.yml`
2. A filled-in `.env.docker` file
3. Ensure the server has Docker installed

Update `NEXTAUTH_URL` and Google Cloud Console redirect URIs to match the server's IP/domain before deploying.
