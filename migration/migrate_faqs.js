// migration/migrate_faqs.js

const fs     = require('fs');
const path   = require('path');
const client = require('../src/db');   // your existing PG client

async function migrateFaqs() {
  try {
    console.log('▶️  Connecting to Postgres…');
    await client.connect();

    // Adjust path if needed
    const filePath = path.join(__dirname, 'data', 'cleaned', 'faqs', 'faqs.json');
    if (!fs.existsSync(filePath)) {
      throw new Error(`File not found: ${filePath}`);
    }

    const raw = fs.readFileSync(filePath, 'utf8');
    const faqs = JSON.parse(raw);

    console.log(`🔄 Migrating ${faqs.length} FAQs…`);
    let inserted = 0, skipped = 0;

    for (const { question, answer } of faqs) {
      // Validate fields
      if (!question || !answer) {
        console.warn('  ⚠️  Skipping entry with missing question or answer');
        skipped++;
        continue;
      }

      const sql = `
        INSERT INTO faqs (question, answer)
        VALUES ($1, $2)
        ON CONFLICT DO NOTHING;
      `;
      try {
        const res = await client.query(sql, [question.trim(), answer.trim()]);
        if (res.rowCount > 0) inserted++;
        else skipped++;
      } catch (err) {
        console.error(`  ✖ Error inserting FAQ: ${err.message}`);
        skipped++;
      }
    }

    console.log(`✅ Done. Inserted: ${inserted}, Skipped: ${skipped}`);
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await client.end();
    console.log('🛑 Disconnected from Postgres.');
  }
}

migrateFaqs();
