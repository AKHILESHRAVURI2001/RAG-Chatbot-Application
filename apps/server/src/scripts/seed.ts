import knowledgeSeed from '../config/knowledge.seed.json';
import { faqService } from '../features/faqs/faqService';
import { pool } from '../db/pool';

async function main() {
  const { created, skipped } = await faqService.importJson(knowledgeSeed.faqs);
  console.log(`✅ Imported ${created.length} FAQ(s) from knowledge.seed.json${skipped > 0 ? ` (skipped ${skipped} blank entries)` : ''}`);
}

main()
  .catch((err) => {
    console.error('❌ Seed failed:', err);
    process.exitCode = 1;
  })
  .finally(() => pool.end());
