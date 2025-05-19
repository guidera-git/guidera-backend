const fs = require('fs');
const path = require('path');

// Function to clean a single university object
function cleanUniversityData(uni) {
  // Clean top-level fields
  if (uni.university_title) {
    uni.university_title = uni.university_title.trim();
  }
  if (uni.main_link) {
    uni.main_link = uni.main_link.trim();
  }
  if (uni.qs_ranking) {
    uni.qs_ranking = parseInt(uni.qs_ranking) || null;
  }
  
  // Clean social_links object
  if (uni.social_links) {
    for (let key in uni.social_links) {
      if (uni.social_links[key]) {
        uni.social_links[key] = uni.social_links[key].trim();
      }
    }
  }

  // Clean contact_details object
  if (uni.contact_details) {
    for (let key in uni.contact_details) {
      if (uni.contact_details[key]) {
        uni.contact_details[key] = uni.contact_details[key].trim();
      }
    }
  }
  
  // Clean introduction field
  if (uni.introduction) {
    uni.introduction = uni.introduction.trim();
  }
  
  // Clean programs object
  if (uni.programs) {
    Object.keys(uni.programs).forEach(programKey => {
      const prog = uni.programs[programKey];
      
      if (prog.program_title) {
        prog.program_title = prog.program_title.trim();
      }
      if (prog.program_description) {
        prog.program_description = prog.program_description.trim();
      }
      if (prog.program_duration) {
        prog.program_duration = prog.program_duration.trim();
      }
      // Handle credit_hours: if string, trim; if not, convert to string.
      if (prog.credit_hours != null) {
        if (typeof prog.credit_hours === 'string') {
          prog.credit_hours = prog.credit_hours.trim();
        } else {
          prog.credit_hours = prog.credit_hours.toString();
        }
      }
      
      // Clean fee array if present
      if (prog.fee && Array.isArray(prog.fee)) {
        prog.fee = prog.fee.map(feeObj => ({
          per_credit_hour_fee: (feeObj.per_credit_hour_fee != null && typeof feeObj.per_credit_hour_fee === 'string') 
            ? feeObj.per_credit_hour_fee.trim() 
            : feeObj.per_credit_hour_fee,
          total_tution_fee: (feeObj.total_tution_fee != null && typeof feeObj.total_tution_fee === 'string') 
            ? feeObj.total_tution_fee.trim() 
            : feeObj.total_tution_fee,
        }));
      }
      
      // Clean important_dates array if present
      if (prog.important_dates && Array.isArray(prog.important_dates)) {
        prog.important_dates = prog.important_dates.map(dateObj => {
          for (let key in dateObj) {
            if (dateObj[key] && typeof dateObj[key] === 'string') {
              dateObj[key] = dateObj[key].trim();
            }
          }
          return dateObj;
        });
      }
      
      // Clean admission_criteria array if present
      if (prog.admission_criteria && Array.isArray(prog.admission_criteria)) {
        prog.admission_criteria = prog.admission_criteria.map(criteriaObj => {
          if (criteriaObj.criteria) {
            criteriaObj.criteria = criteriaObj.criteria.trim();
          }
          return criteriaObj;
        });
      }
      
      // Clean merit_formula array if present
      if (prog.merit_formula && Array.isArray(prog.merit_formula)) {
        prog.merit_formula = prog.merit_formula.map(formula => {
          for (let key in formula) {
            if (formula[key] && typeof formula[key] === 'string') {
              formula[key] = formula[key].trim();
            }
          }
          return formula;
        });
      }
      
      if (prog.course_outline) {
        prog.course_outline = prog.course_outline.trim();
      }
    });
  }
  return uni;
}

// Define directories for raw and cleaned files
const inputDir = path.join(__dirname, 'data', 'raw');    // Folder where your raw JSON files are located
const outputDir = path.join(__dirname, 'data', 'cleaned'); // Folder where cleaned JSON files will be saved

// Ensure the output directory exists
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

// Read all JSON files from the raw folder
const files = fs.readdirSync(inputDir).filter(file => file.endsWith('.json'));

files.forEach(file => {
  const inputPath = path.join(inputDir, file);
  const rawData = JSON.parse(fs.readFileSync(inputPath, 'utf8'));
  
  // Assume each file contains an array of university objects
  const cleanedData = rawData.map(cleanUniversityData);
  
  const outputPath = path.join(outputDir, file);
  fs.writeFileSync(outputPath, JSON.stringify(cleanedData, null, 2), 'utf8');
  console.log(`Cleaned ${file} and saved to ${outputPath}`);
});

console.log('All files cleaned successfully.');
