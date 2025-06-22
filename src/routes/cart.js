const express = require('express');
const router = express.Router();
const client = require('../db');
const auth = require('../middleware/auth');
router.get('/cart', auth, async (req, res) => {
    const studentId = req.user.id;

    try {
        const { rows } = await client.query(`
            SELECT 
                f.id AS favorite_id,
                p.*,
                u.university_title
            FROM favorites f
            JOIN programs p ON f.program_id = p.id
            JOIN universities u ON u.id = p.university_id
            WHERE f.student_id = $1
        `, [studentId]);

        res.json(rows);
    } catch (err) {
        console.error('Error fetching favorites:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

router.post('/cart', auth, async (req, res) => {
    const studentId = req.user.id;
    const { program_id } = req.body;

    if (!program_id) {
        return res.status(400).json({ error: 'program_id is required' });
    }

    try {
        await client.query(`
      INSERT INTO favorites (student_id, program_id)
      VALUES ($1, $2)
      ON CONFLICT (student_id, program_id) DO NOTHING
    `, [studentId, program_id]);

        const programResult = await client.query(`
      SELECT important_dates::json AS dates, program_title, university_id
      FROM programs
      WHERE id = $1
    `, [program_id]);

        if (programResult.rows.length === 0) {
            return res.status(404).json({ error: 'Program not found' });
        }

        const program = programResult.rows[0];
        const importantDatesArray = program.dates;
        const programTitle = program.program_title;
        const universityId = program.university_id;

        const uniResult = await client.query(`
      SELECT university_title FROM universities
      WHERE id = $1
    `, [universityId]);

        const universityName = uniResult.rows[0]?.university_title || 'Unknown University';

        console.log('Important Dates:', importantDatesArray);
        console.log('University:', universityName);

        const cleanDateString = (dateStr) => dateStr.replace(/(\d+)(st|nd|rd|th)/, '$1');

        if (Array.isArray(importantDatesArray) && importantDatesArray.length > 0) {
            const importantDates = importantDatesArray[0];

            for (const [key, dateStr] of Object.entries(importantDates)) {
                if (typeof dateStr === 'string' && dateStr.trim() !== '') {
                    const cleanedDateStr = cleanDateString(dateStr);
                    const parsedDate = new Date(cleanedDateStr);

                    console.log('Date key:', key);
                    console.log('Original dateStr:', dateStr);
                    console.log('Cleaned date string:', cleanedDateStr);
                    console.log('Parsed Date:', parsedDate, 'Is valid:', !isNaN(parsedDate));

                    if (!isNaN(parsedDate)) {
                        const messageKey = key.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
                        const message = `${messageKey} for ${programTitle}`;

                        console.log('Inserting notification:', { studentId, program_id, universityName, message, parsedDate });

                        await client.query(`
              INSERT INTO notifications (
                student_id, program_id, university_name, message, notification_date
              ) VALUES ($1, $2, $3, $4, $5)
            `, [studentId, program_id, universityName, message, parsedDate]);
                    }
                }
            }
        }

        res.status(201).json({ message: 'Program added to favorites and notifications created' });

    } catch (err) {
        console.error('Error in /cart:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});




router.delete('/cart/:programId', auth, async (req, res) => {
    const studentId = req.user.id;
    const programId = req.params.programId;

    try {
        const result = await client.query(`
            DELETE FROM favorites 
            WHERE student_id = $1 AND program_id = $2
        `, [studentId, programId]);

        if (result.rowCount === 0) {
            return res.status(404).json({ error: 'Favorite not found' });
        }

        res.json({ message: 'Program removed from favorites' });
    } catch (err) {
        console.error('Error deleting favorite:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
