const fs = require('fs');
const path = require('path');
const client = require('../src/db');

// Function to drop and recreate the tables
async function recreateTables() {
  const dropProgramsQuery = 'DROP TABLE IF EXISTS programs CASCADE;';
  const dropUniversitiesQuery = 'DROP TABLE IF EXISTS universities CASCADE;';
  
  // Recreate universities with qs_ranking as TEXT
  const createUniversitiesQuery = `
    CREATE TABLE universities (
      id SERIAL PRIMARY KEY,
      university_title VARCHAR(255) NOT NULL,
      main_link TEXT,
      qs_ranking TEXT,
      social_links JSONB,
      contact_details JSONB,
      introduction TEXT,
      campuses JSONB
    );
  `;
  
  // Recreate programs table
  const createProgramsQuery = `
    CREATE TABLE programs (
      id SERIAL PRIMARY KEY,
      university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE,
      program_key VARCHAR(50),
      program_title VARCHAR(255),
      program_description TEXT,
      program_duration VARCHAR(50),
      credit_hours VARCHAR(50),
      fee JSONB,
      important_dates JSONB,
      merit TEXT,
      teaching_system VARCHAR(50),
      admission_criteria JSONB,
      merit_formula JSONB,
      course_outline TEXT
    );
  `;
  
  try {
    console.log("Dropping existing tables (if any)...");
    await client.query(dropProgramsQuery);
    await client.query(dropUniversitiesQuery);
    
    console.log("Creating tables...");
    await client.query(createUniversitiesQuery);
    await client.query(createProgramsQuery);
    console.log("Tables recreated successfully.");
  } catch (err) {
    console.error("Error recreating tables:", err);
    throw err;
  }
}

// Main migration function
async function migrateAllUniversities() {
  try {
    // Drop and recreate tables first
    await recreateTables();

    // Define the directory with cleaned JSON files
    const cleanedDir = path.join(__dirname, 'data', 'cleaned');
    const files = fs.readdirSync(cleanedDir).filter(file => file.endsWith('.json'));

    for (const file of files) {
      const filePath = path.join(cleanedDir, file);
      const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

      // Each file is assumed to contain an array of university objects
      for (const uni of data) {
        const insertUniQuery = `
          INSERT INTO universities 
            (university_title, main_link, qs_ranking, social_links, contact_details, introduction, campuses)
          VALUES 
            ($1, $2, $3, $4, $5, $6, $7)
          RETURNING id;
        `;
        const uniValues = [
          uni.university_title,
          uni.main_link,
          uni.qs_ranking ? uni.qs_ranking.trim() : null, // ranking kept as string
          JSON.stringify(uni.social_links),
          JSON.stringify(uni.contact_details),
          uni.introduction,
          uni.campuses
        ];
        const uniResult = await client.query(insertUniQuery, uniValues);
        const universityId = uniResult.rows[0].id;
        console.log(`Inserted University: ${uni.university_title} with id ${universityId}`);

        // Insert programs if available
        if (uni.programs) {
          for (const [programKey, program] of Object.entries(uni.programs)) {
            const insertProgQuery = `
              INSERT INTO programs 
                (university_id, program_key, program_title, program_description, program_duration, credit_hours, fee, important_dates, merit, teaching_system, admission_criteria, merit_formula, course_outline)
              VALUES 
                ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13);
            `;
            const progValues = [
              universityId,
              programKey,
              program.program_title,
              program.program_description,
              program.program_duration,
              program.credit_hours,  // credit_hours is kept as provided (string)
              JSON.stringify(program.fee),
              JSON.stringify(program.important_dates),
              program.merit,
              program.teaching_system,
              JSON.stringify(program.admission_criteria),
              JSON.stringify(program.merit_formula),
              program.course_outline
            ];
            await client.query(insertProgQuery, progValues);
            console.log(`  Inserted Program: ${program.program_title}`);
          }
        }
      }
    }
    console.log('All universities migrated successfully.');
  } catch (err) {
    console.error('Migration error:', err);
  } finally {
    client.end();
  }
}

migrateAllUniversities();
