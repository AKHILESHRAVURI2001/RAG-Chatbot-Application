import { authService } from '../features/auth/authService';
import { pool } from '../db/pool';

function parseArgs(): { email?: string; password?: string } {
  const args: Record<string, string> = {};
  for (const arg of process.argv.slice(2)) {
    const match = arg.match(/^--([^=]+)=(.*)$/);
    if (match) args[match[1]] = match[2];
  }
  return args;
}

async function main() {
  const args = parseArgs();
  const email = args.email || process.env.ADMIN_EMAIL;
  const password = args.password || process.env.ADMIN_PASSWORD;
  if (!email || !password) {
    console.error('Usage: npm run create-admin -w apps/server -- --email=you@example.com --password=change-me');
    console.error('   (or set ADMIN_EMAIL/ADMIN_PASSWORD in .env and run with no flags)');
    process.exitCode = 1;
    return;
  }
  if (password.length < 8) {
    console.error('❌ Password must be at least 8 characters.');
    process.exitCode = 1;
    return;
  }

  const admin = await authService.upsertAdmin(email, password);
  console.log(`✅ Admin account ready: ${admin.email}`);
  console.log('   Sign in at the admin panel with this email and the password you just set.');
}

main()
  .catch((err) => {
    console.error('❌ Failed to create admin:', err.message ?? err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
