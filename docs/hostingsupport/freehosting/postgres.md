# Free PostgreSQL + pgvector Setup Guide

This guide details **100% free hosting options** for PostgreSQL with the `pgvector` extension required by MiniChatbotAgent.

---

## 1. Option A: Supabase (Recommended)

Supabase offers a free-tier PostgreSQL instance with pre-installed `pgvector`.

### Step-by-Step Setup:

1. **Sign Up / Log In**: Go to [supabase.com](https://supabase.com) and create a free account.
2. **Create a New Project**:
   - Click **New Project**.
   - Choose your Organization.
   - Enter a **Name** (e.g., `minichatbot-db`).
   - Enter a strong **Database Password** (save this securely!).
   - Choose a **Region** closest to you or your users.
   - Click **Create new project** and wait ~2 minutes.

3. **Get the Connection String (Crucial for IPv4 Networks)**:
   - In your Supabase project dashboard, click **Connect** (at the top bar).
   - Select the **Connection Method**: **`Session pooler`** or **`Transaction pooler`**.
     > **Important**: Do NOT use "Direct connection" if your network does not support IPv6. The Session/Transaction Pooler provides an **IPv4** address (`aws-0-[region].pooler.supabase.com`) that avoids DNS errors (`getaddrinfo ENOENT`).
   - Change the **Type** dropdown from `PSQL` to **`URI`**.
   - Copy the URI string:
     ```text
     postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
     ```

4. **Configure in MiniChatbotAgent**:
   - Open `apps/server/.env`.
   - Set `DATABASE_URL`:
     ```env
     DATABASE_URL=postgresql://postgres.[PROJECT-REF]:[YOUR-PASSWORD]@aws-0-[REGION].pooler.supabase.com:5432/postgres
     ```

5. **Run Migrations**:
   ```bash
   npm run db:migrate
   ```

---

## 2. Option B: Neon Serverless Postgres

Neon provides a fast, serverless PostgreSQL with native `pgvector` and built-in connection pooling.

### Step-by-Step Setup:

1. **Sign Up**: Go to [neon.tech](https://neon.tech) and sign up with GitHub/Google.
2. **Create Project**:
   - Project Name: `minichatbot`.
   - Postgres Version: Select `15` or `16`.
   - Region: Pick the region nearest to you.
3. **Get Connection String**:
   - On the Neon dashboard, locate the **Connection Details** card.
   - Ensure **Pooled connection** checkbox is checked.
   - Copy the string (it includes `sslmode=require`):
     ```text
     postgresql://user:password@ep-xyz-pooler.region.aws.neon.tech/neondb?sslmode=require
     ```
4. **Configure in MiniChatbotAgent**:
   - Paste into `apps/server/.env`:
     ```env
     DATABASE_URL=postgresql://user:password@ep-xyz-pooler.region.aws.neon.tech/neondb?sslmode=require
     DATABASE_SSL=true
     ```
5. **Run Migrations**:
   ```bash
   npm run db:migrate
   ```

---

## 3. Option C: Local PostgreSQL with Docker (100% Free & Unlimited)

If you prefer running everything locally without any cloud service or network limits:

### Step-by-Step Setup:

1. **Install Docker**: Download and install [Docker Desktop](https://www.docker.com/products/docker-desktop/).
2. **Run pgvector Container**:
   Open PowerShell / Terminal and run:
   ```bash
   docker run -d \
     --name minichatbot-postgres \
     -e POSTGRES_USER=postgres \
     -e POSTGRES_PASSWORD=postgres \
     -e POSTGRES_DB=minichatbot \
     -p 5432:5432 \
     pgvector/pgvector:pg16
   ```
3. **Configure in `apps/server/.env`**:
   ```env
   DATABASE_URL=postgres://postgres:postgres@localhost:5432/minichatbot
   DATABASE_SSL=false
   ```
4. **Run Migrations**:
   ```bash
   npm run db:migrate
   ```

---

## 🔍 Common Troubleshooting

| Issue | Cause | Fix |
|---|---|---|
| `getaddrinfo ENOENT db.xxx.supabase.co` | Supabase direct host is IPv6-only | Switch to Supabase **Session Pooler** (`aws-0-xxx.pooler.supabase.com:5432`) |
| `password authentication failed` | Special characters in password not URL-encoded | URL-encode symbols (e.g., `@` $\rightarrow$ `%40`, `#` $\rightarrow$ `%23`) or use an alphanumeric password |
| `extension "vector" is not available` | Database image lacks pgvector | Use `pgvector/pgvector` Docker image or Supabase/Neon which include it |
| `Connection terminated unexpectedly` | SSL handshake requirement | Add `DATABASE_SSL=true` or append `?sslmode=require` to connection URL |
