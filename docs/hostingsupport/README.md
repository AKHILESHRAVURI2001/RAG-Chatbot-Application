# Hosting guides

Pick the route that matches what you want to run. All of them deploy the same three pieces: the API server, the admin panel and the widget, plus Postgres with `pgvector`.

| Guide | Use it when |
| --- | --- |
| [`freehosting/`](freehosting/) | You want to run it for free to try it or for a small site: Postgres on Supabase/Neon, the server on Render, the admin panel and widget on Vercel. Start with [`postgres.md`](freehosting/postgres.md). |
| [`awshosting/`](awshosting/) | You want it on AWS. Three equivalent ways to build the same stack — [CLI](awshosting/aws-cli/), [Console](awshosting/aws-console/), [Terraform](awshosting/terraform/) — plus an advanced container route ([ECS/EKS + Jenkins](awshosting/pipeline/)). Start with [`awshosting/README.md`](awshosting/README.md). |

Whichever you choose:

- **Run the server in the same region as its database.** A chat message makes about 25 queries; cross-region latency multiplies.
- **Set `ALLOWED_ORIGINS` and `ADMIN_ORIGINS`** to your real domains (the defaults allow every origin) and use a long random `ADMIN_JWT_SECRET`.
- **Apply migrations** with `npm run db:migrate`, or from the admin panel under Settings → Admin → Database. They are safe to re-run.
- **Create the first admin** with `npm run create-admin -w apps/server -- --email=… --password=…`; add everyone else under Access Control.
