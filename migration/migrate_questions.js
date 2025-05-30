// migration/migrate_questions.js

const fs     = require('fs');
const path   = require('path');
const client = require('../src/db');

async function migrateQuestions() {
  try {
    console.log('▶️ Connecting to Postgres…');
    await client.connect();

    const dir = path.join(__dirname, 'data', 'cleaned', 'questions');
    const files = fs.readdirSync(dir).filter(f => f.endsWith('.json'));

    for (const file of files) {
      const subject = path.basename(file, '.json').toUpperCase();
      const filePath = path.join(dir, file);
      const raw      = fs.readFileSync(filePath, 'utf8');
      let questions  = JSON.parse(raw);

      // 1) Filter out any with missing or empty correct_answer
      const beforeCount = questions.length;
      questions = questions.filter(q =>
        q.correct_answer != null &&
        String(q.correct_answer).trim() !== ''
      );
      console.log(`\n${file}: filtered out ${beforeCount - questions.length} items without correct_answer`);

      // 2) Sort ascending by id (lexical)
      questions.sort((a, b) => a.id.localeCompare(b.id, undefined, { numeric: true }));

      console.log(`Migrating ${questions.length} questions for subject ${subject}`);

      for (const q of questions) {
        const {
          id,
          question,
          options,
          correct_answer,
          explanation = null,
          difficulty
        } = q;

        const insertSql = `
          INSERT INTO test_questions
            (id, subject, question, options, correct_ans, explanation, difficulty)
          VALUES
            ($1, $2, $3, $4, $5, $6, $7)
          ON CONFLICT (id) DO NOTHING;
        `;
        const values = [
          id,
          subject,
          question,
          options,
          correct_answer,
          explanation,
          difficulty
        ];

        try {
          await client.query(insertSql, values);
        } catch (err) {
          console.error(`  ✖ Error inserting ${id}:`, err.message);
        }
      }

      console.log(`✅ Finished migrating ${file}`);
    }

    console.log('\n🎉 All question banks migrated.');
  } catch (err) {
    console.error('❌ Migration error:', err);
  } finally {
    await client.end();
    console.log('🛑 Disconnected from Postgres.');
  }
}

migrateQuestions();
