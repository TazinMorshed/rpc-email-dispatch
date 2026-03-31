# RPC Email Dispatch

Internal tool for automating vendor payment follow-up emails at Lufa Farms.

## Prerequisites

- Node.js 20+
- Docker Desktop

## Environment Variables

Create a `.env.local` for local development or `.env.docker` for Docker:

```
NEXTAUTH_SECRET=
NEXTAUTH_URL=
GOOGLE_CLIENT_ID=
GOOGLE_CLIENT_SECRET=
TEST_RECIPIENT=
HOSTNAME=0.0.0.0        # Docker only
```

## Running Locally

```bash
npm install
npm run dev
```

## Running with Docker

```bash
# App only
docker build -t rpc-email-dispatch .
docker run -p 3000:3000 --env-file .env.docker rpc-email-dispatch

# With oauth2-proxy (restricts access to @lufa.com accounts)
docker compose up --build
```

Access the app at `http://localhost:4180` when using oauth2-proxy.

## Google Cloud Setup

Add the following redirect URIs to your OAuth 2.0 client:

- `http://localhost:3000/api/auth/callback/google`
- `http://localhost:4180/oauth2/callback`
