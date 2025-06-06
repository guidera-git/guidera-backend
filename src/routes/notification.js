const express = require('express');
const dayjs = require('dayjs');
const auth = require('../middleware/auth');
const client = require('../db');

const router = express.Router();

router.get('/reminders', auth, async (req, res) => {
    const studentId = req.user.id;

    try {
        const today = dayjs().startOf('day');

        const result = await client.query(
            `SELECT program_id, university_name, message, notification_date
       FROM notifications
       WHERE student_id = $1`,
            [studentId]
        );

        const reminders = result.rows.filter(row => {
            const date = dayjs(row.notification_date).startOf('day');
            const diff = date.diff(today, 'day');
            return [0, 1, 3, 7].includes(diff);
        });

        const formatted = reminders.map(row => ({
            program_id: row.program_id,
            university: row.university_name,
            message: row.message,
            date: dayjs(row.notification_date).format('YYYY-MM-DD')
        }));

        res.json({ reminders: formatted });

    } catch (err) {
        console.error('Error fetching reminders:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
