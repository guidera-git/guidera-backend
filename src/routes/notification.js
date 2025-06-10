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
            `SELECT id,program_id, university_name, message, notification_date,status
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
            id: row.id,
            program_id: row.program_id,
            university: row.university_name,
            message: row.message,
            date: dayjs(row.notification_date).format('YYYY-MM-DD'),
            status: row.status
        }));

        res.json({ reminders: formatted });

    } catch (err) {
        console.error('Error fetching reminders:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});
router.patch('/reminders/:id/read', auth, async (req, res) => {
    const studentId = req.user.id;
    const notificationId = req.params.id;

    try {
        const result = await client.query(
            `UPDATE notifications
             SET status = TRUE
             WHERE id = $1 AND student_id = $2
             RETURNING *`,
            [notificationId, studentId]
        );

        if (result.rowCount === 0) {
            return res.status(404).json({ message: 'Notification not found or access denied.' });
        }

        res.json({ message: 'Notification marked as read.' });

    } catch (err) {
        console.error('Error updating notification status:', err);
        res.status(500).json({ error: 'Internal server error' });
    }
});

module.exports = router;
