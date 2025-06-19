const fs = require('fs');
const path = require('path');
const client = require('../src/db');

// Helper function to standardize program names
function standardizeProgramName(programTitle) {
  if (!programTitle) return programTitle;
  
  // Convert to lowercase for comparison
  const lower = programTitle.toLowerCase();
  
  // Remove timing indicators (Morning/Evening) and clean up
  const cleanTitle = programTitle.replace(/\s*\([^)]*\)\s*/g, '').trim();
  
  // Standardization mappings
  const standardizations = {
    // Computer Science variations
    'bachelor of science in computer science': 'BS Computer Science',
    'bs computer science(morning)': 'BS Computer Science',
    'bs computer science(evening)': 'BS Computer Science',
    'bsc computer science': 'BS Computer Science',
    'b.sc computer science': 'BS Computer Science',
    
    // Software Engineering variations
    'bachelor of science in software engineering': 'BS Software Engineering',
    'b.sc. software engineering': 'BS Software Engineering',
    'bsc software engineering': 'BS Software Engineering',
    
    // Information Technology variations
    'bachelor of science in information technology': 'BS Information Technology',
    'bs information technology(morning)': 'BS Information Technology',
    'bs information technology(evening)': 'BS Information Technology',
    'bsc information technology': 'BS Information Technology',
    'b.sc information technology': 'BS Information Technology',
    
    // Artificial Intelligence variations
    'bachelor of science in artificial intelligence': 'BS Artificial Intelligence',
    'bachelor of science in robotics and artificial intelligence': 'BS Robotics and Artificial Intelligence',
    'bs artfical intelligence': 'BS Artificial Intelligence', // Fix typo
    'bsc artificial intelligence': 'BS Artificial Intelligence',
    'b.sc artificial intelligence': 'BS Artificial Intelligence',
    
    // Data Science variations
    'bachelor of science in data science': 'BS Data Science',
    'b.sc. data science': 'BS Data Science',
    'bsc data science': 'BS Data Science',
    'bs data scheince': 'BS Data Science', // Fix typo
    
    // Electrical Engineering variations
    'bachelor of science in electrical engineering': 'BS Electrical Engineering',
    'b.sc. electrical engineering': 'BS Electrical Engineering',
    'bsc electrical engineering': 'BS Electrical Engineering',
    
    // Mechanical Engineering variations
    'bachelor of science in mechanical engineering': 'BS Mechanical Engineering',
    'bachelor of science in mechanical engineering technology': 'BS Mechanical Engineering Technology',
    'b.sc mechanical engineering': 'BS Mechanical Engineering',
    'b.sc. mechanical engineering': 'BS Mechanical Engineering',
    'bsc mechanical engineering': 'BS Mechanical Engineering',
    
    // Civil Engineering variations
    'bachelor of science in civil engineering': 'BS Civil Engineering',
    'bachelor of science in civil engineering technology': 'BS Civil Engineering Technology',
    'b.sc. civil engineering': 'BS Civil Engineering',
    'bsc civil engineering': 'BS Civil Engineering',
    
    // Biomedical Engineering variations
    'bachelor of science in bio-medical engineering technology': 'BS Biomedical Engineering Technology',
    'bs bio-medical engineering technology': 'BS Biomedical Engineering Technology',
    'bs biomedical engineering': 'BS Biomedical Engineering',
    
    // Cyber Security variations
    'bachelor of science in cyber security': 'BS Cyber Security',
    'bsc cyber security': 'BS Cyber Security',
    
    // Medical programs
    'bachelor of medicine & bachelor of surgery (mbbs)': 'Bachelor of Medicine & Bachelor of Surgery (MBBS)',
    'bs mbbs': 'Bachelor of Medicine & Bachelor of Surgery (MBBS)',
    
    // Dental programs
    'bachelor of dental surgery (bds)': 'Bachelor of Dental Surgery (BDS)',
    'bs bachelor of dental surgerys': 'Bachelor of Dental Surgery (BDS)', // Fix typo
    
    // Pharmacy programs
    'doctor of pharmacy': 'Doctor of Pharmacy (Pharm.D)',
    'bs pharma d': 'Doctor of Pharmacy (Pharm.D)',
    'pharm.d': 'Doctor of Pharmacy (Pharm.D)',
    
    // Physical Therapy
    'bs doctor of physical therapy': 'Doctor of Physical Therapy (DPT)',
    'doctor of physical therapy (dpt)': 'Doctor of Physical Therapy (DPT)',
    
    // Nursing
    'bs nursing': 'BS Nursing',
    'bachelor of science in nursing': 'BS Nursing'
  };
  
  // Check for exact matches first
  const lowerClean = cleanTitle.toLowerCase();
  if (standardizations[lowerClean]) {
    return standardizations[lowerClean];
  }
  
  // Return the cleaned title if no standardization found
  return cleanTitle;
}

// Helper function to calculate total tuition fee
function calculateTotalFee(feeArray, creditHours) {
  if (!feeArray || feeArray.length === 0) return null;
  
  const fee = feeArray[0];
  
  // If total_tuition_fee is available and valid, use it
  if (fee.total_tution_fee && fee.total_tution_fee !== "Not Available") {
    return fee.total_tution_fee;
  }
  
  // If per_credit_hour_fee is available, calculate total
  if (fee.per_credit_hour_fee && fee.per_credit_hour_fee !== "Not Available" && creditHours) {
    const perCreditFee = parseFloat(fee.per_credit_hour_fee.replace(/[^\d.]/g, ''));
    const credits = parseFloat(creditHours.replace(/[^\d]/g, ''));
    
    if (!isNaN(perCreditFee) && !isNaN(credits)) {
      return `${(perCreditFee * credits).toLocaleString()} PKR`;
    }
  }
  
  return fee.total_tution_fee || "Not Available";
}

// Function to drop and recreate the tables
async function recreateTables() {
  const dropProgramsQuery = 'DROP TABLE IF EXISTS programs CASCADE;';
  const dropUniversitiesQuery = 'DROP TABLE IF EXISTS universities CASCADE;';
  
  // Recreate universities table with location fields
  const createUniversitiesQuery = `
    CREATE TABLE universities (
      id SERIAL PRIMARY KEY,
      university_title VARCHAR(255) NOT NULL,
      main_link TEXT,
      location VARCHAR(100),
      additional_locations TEXT[],
      qs_ranking TEXT,
      social_links JSONB,
      contact_details JSONB,
      introduction TEXT,
      campuses JSONB,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  // Recreate programs table with enhanced fields
  const createProgramsQuery = `
    CREATE TABLE programs (
      id SERIAL PRIMARY KEY,
      university_id INTEGER REFERENCES universities(id) ON DELETE CASCADE,
      program_key VARCHAR(50),
      program_title VARCHAR(255),
      standardized_title VARCHAR(255),
      program_description TEXT,
      program_duration VARCHAR(50),
      credit_hours VARCHAR(50),
      fee JSONB,
      calculated_total_fee TEXT,
      important_dates JSONB,
      merit TEXT,
      teaching_system VARCHAR(50),
      admission_criteria JSONB,
      merit_formula JSONB,
      course_outline TEXT,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `;
  
  // Create indexes for better performance
  const createIndexesQuery = `
    CREATE INDEX idx_universities_location ON universities(location);
    CREATE INDEX idx_universities_ranking ON universities(qs_ranking);
    CREATE INDEX idx_programs_university_id ON programs(university_id);
    CREATE INDEX idx_programs_standardized_title ON programs(standardized_title);
    CREATE INDEX idx_programs_duration ON programs(program_duration);
  `;
  
  try {
    console.log("🗑️  Dropping existing tables (if any)...");
    await client.query(dropProgramsQuery);
    await client.query(dropUniversitiesQuery);
    
    console.log("🏗️  Creating tables...");
    await client.query(createUniversitiesQuery);
    await client.query(createProgramsQuery);
    await client.query(createIndexesQuery);
    
    console.log("✅ Tables recreated successfully with indexes.");
  } catch (err) {
    console.error("❌ Error recreating tables:", err);
    throw err;
  }
}

// Main migration function
async function migrateAllUniversities() {
  try {
    console.log("🚀 Starting university data migration...");
    
    // Drop and recreate tables first
    await recreateTables();

    // Define the directory with cleaned JSON files
    const cleanedDir = path.join(__dirname, '..', 'migration' , 'data', 'cleaned', 'universities');
    
    if (!fs.existsSync(cleanedDir)) {
      throw new Error(`Cleaned data directory not found: ${cleanedDir}`);
    }
    
    const files = fs.readdirSync(cleanedDir).filter(file => file.endsWith('.json'));
    
    console.log(`📁 Found ${files.length} JSON files to process`);

    let totalUniversities = 0;
    let totalPrograms = 0;

    for (const file of files) {
      const filePath = path.join(cleanedDir, file);
      console.log(`\n📄 Processing file: ${file}`);
      
      try {
        const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

        // Each file contains an array of university objects
        for (const uni of data) {
          console.log(`\n🏫 Processing University: ${uni.university_title}`);
          
          // Insert university data
          const insertUniQuery = `
            INSERT INTO universities 
              (university_title, main_link, location, additional_locations, qs_ranking, social_links, contact_details, introduction, campuses)
            VALUES 
              ($1, $2, $3, $4, $5, $6, $7, $8, $9)
            RETURNING id;
          `;
          
          const uniValues = [
            uni.university_title,
            uni.main_link,
            uni.location || null,
            uni.additional_locations || [],
            uni.qs_ranking ? uni.qs_ranking.toString().trim() : null,
            JSON.stringify(uni.social_links || {}),
            JSON.stringify(uni.contact_details || {}),
            uni.introduction || null,
            JSON.stringify(uni.campuses || {})
          ];
          
          const uniResult = await client.query(insertUniQuery, uniValues);
          const universityId = uniResult.rows[0].id;
          totalUniversities++;
          
          console.log(`   ✅ Inserted University with ID: ${universityId}`);
          console.log(`   📍 Location: ${uni.location || 'Not specified'}`);
          if (uni.additional_locations && uni.additional_locations.length > 0) {
            console.log(`   📍 Additional Locations: ${uni.additional_locations.join(', ')}`);
          }

          // Insert programs if available
          if (uni.programs) {
            const programCount = Object.keys(uni.programs).length;
            console.log(`   📚 Processing ${programCount} programs...`);
            
            for (const [programKey, program] of Object.entries(uni.programs)) {
              // Standardize the program title
              const standardizedTitle = standardizeProgramName(program.program_title);
              
              // Calculate total fee
              const calculatedFee = calculateTotalFee(program.fee, program.credit_hours);
              
              const insertProgQuery = `
                INSERT INTO programs 
                  (university_id, program_key, program_title, standardized_title, program_description, program_duration, credit_hours, fee, calculated_total_fee, important_dates, merit, teaching_system, admission_criteria, merit_formula, course_outline)
                VALUES 
                  ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15);
              `;
              
              const progValues = [
                universityId,
                programKey,
                program.program_title,
                standardizedTitle,
                program.program_description,
                program.program_duration,
                program.credit_hours,
                JSON.stringify(program.fee || []),
                calculatedFee,
                JSON.stringify(program.important_dates || []),
                program.merit,
                program.teaching_system,
                JSON.stringify(program.admission_criteria || []),
                JSON.stringify(program.merit_formula || []),
                program.course_outline
              ];
              
              await client.query(insertProgQuery, progValues);
              totalPrograms++;
              
              console.log(`      ✅ ${program.program_title} → ${standardizedTitle}`);
              
              // Show fee calculation if available
              if (calculatedFee && calculatedFee !== "Not Available") {
                console.log(`         💰 Fee: ${calculatedFee}`);
              }
            }
          } else {
            console.log(`   ⚠️  No programs found for this university`);
          }
        }
      } catch (fileError) {
        console.error(`❌ Error processing file ${file}:`, fileError.message);
        continue; // Continue with next file
      }
    }
    
    console.log('\n🎉 Migration completed successfully!');
    console.log(`📊 Summary:`);
    console.log(`   - Universities migrated: ${totalUniversities}`);
    console.log(`   - Programs migrated: ${totalPrograms}`);
    console.log(`   - Average programs per university: ${totalPrograms > 0 ? (totalPrograms / totalUniversities).toFixed(1) : 0}`);
    
  } catch (err) {
    console.error('❌ Migration error:', err);
    process.exit(1);
  } finally {
    await client.end();
    console.log('\n🔌 Database connection closed');
  }
}

// Run migration if this file is executed directly
if (require.main === module) {
  migrateAllUniversities();
}

module.exports = {
  migrateAllUniversities,
  standardizeProgramName,
  calculateTotalFee
};