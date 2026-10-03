# Security

## Reporting a vulnerability

Please **don't open a public issue** for a security problem.

Report it privately instead: on GitHub, open the **Security** tab of this repository and choose **Report a vulnerability**. Include what you found, the steps to reproduce it, and what an attacker could do with it. You will get a reply as soon as possible, and the problem will be fixed before it is discussed publicly.

## Running it safely

This project is meant to be self-hosted, so the safety of your copy depends on how you set it up. Before you put it on the internet:

- **Set your own secrets.** Use a long random `ADMIN_JWT_SECRET` (16+ characters). Never commit a real `.env` file — only `.env.example` belongs in the repository.
- **Limit who can call the server.** Set `ALLOWED_ORIGINS` and `ADMIN_ORIGINS` to your own domains. If you don't, every website is allowed.
- **Change the example passwords.** `docker-compose.yml` uses a throwaway database password for local development only. Don't expose it, and don't reuse it.
- **Give people only the access they need.** Use roles (Access Control in the admin panel) instead of making everyone a full Admin. The server checks every permission on every request.
- **Keep AI and speech keys private.** They are stored on the server and are never sent to the browser.
- **Run the server next to its database**, and keep Node.js and your dependencies up to date.

## What the project already does

- Permissions are enforced on the server for every admin action; hiding a button is never the only protection.
- Admin and visitor sign-in tokens can't be used for each other.
- A role can't be given a permission that its creator doesn't have.
- Important administrative actions are written to an audit log, with passwords and keys removed.
- Content fetched from a web address you give is blocked from reaching private or internal network addresses.
- Error messages in production don't reveal internal details.
