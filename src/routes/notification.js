const express = require('express');
const router = express.Router();
const client = require('../db');
const auth = require('../middleware/auth');
const { applicationEvents, EVENTS } = require('../utils/eventEmitter');

const NotificationRules = require('../utils/notificationRules');

// Utility to extract student ID from the token payload
function getStudentId(req) {
  return req.user.student_id ?? req.user.userId ?? req.user.id;
}

// Phase 2: Event Subscription - Set up notification event listeners
applicationEvents.on(EVENTS.APPLICATION_CREATED, async (eventData) => {
  console.log('Processing application.created event:', eventData);
  await NotificationRules.processApplicationCreated(eventData);
});

applicationEvents.on(EVENTS.APPLICATION_PHASE_CHANGED, async (eventData) => {
  console.log('Processing application.phaseChanged event:', eventData);
  await NotificationRules.processPhaseChanged(eventData);
});

// ─── 1) CREATE NOTIFICATION (Manual) ────────────────────────────────────────────
router.post('/notifications', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { title, message, type, related_id, scheduled_for } = req.body;
    if (!title || !message || !type) {
      return res.status(400).json({ error: 'title, message, and type are required' });
    }

    const insertQuery = `
      INSERT INTO notifications (
        student_id,
        title,
        message,
        type,
        related_id,
        scheduled_for,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      RETURNING *
    `;

    const result = await client.query(insertQuery, [
      student_id,
      title,
      message,
      type,
      related_id || null,
      scheduled_for || null
    ]);

    return res.status(201).json(result.rows[0]);
  } catch (err) {
    console.error('Error creating notification:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 2) GET ALL NOTIFICATIONS FOR USER ──────────────────────────────────────────
router.get('/notifications', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { limit = 50, offset = 0, unread_only = false } = req.query;

    let query = `
      SELECT
        n.*,
        CASE
          WHEN n.type IN ('deadline', 'milestone') AND n.related_id IS NOT NULL THEN (
            SELECT u.university_title
            FROM applications a
            JOIN universities u ON a.university_id = u.id
            WHERE a.id = n.related_id::int
          )
          ELSE NULL
        END AS university_title
      FROM notifications n
      WHERE n.student_id = $1
    `;

    const queryParams = [student_id];
    let paramCount = 1;

    if (unread_only === 'true') {
      query += ` AND n.is_read = false`;
    }

    query += ` ORDER BY n.created_at DESC LIMIT $${++paramCount} OFFSET $${++paramCount}`;
    queryParams.push(parseInt(limit), parseInt(offset));

    const result = await client.query(query, queryParams);

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching notifications:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 3) MARK NOTIFICATION AS READ ───────────────────────────────────────────────
router.patch('/notifications/:notification_id/read', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { notification_id } = req.params;
    const updateQuery = `
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE id = $1 AND student_id = $2
      RETURNING *
    `;
    const result = await client.query(updateQuery, [notification_id, student_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error marking notification as read:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 3.1) MARK ALL NOTIFICATIONS AS READ ────────────────────────────────────────
router.patch('/notifications/mark-all-read', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const updateQuery = `
      UPDATE notifications
      SET is_read = true, read_at = NOW()
      WHERE student_id = $1 AND is_read = false
      RETURNING *
    `;
    const result = await client.query(updateQuery, [student_id]);

    return res.json({ 
      message: 'All notifications marked as read',
      updated_count: result.rows.length,
      notifications: result.rows
    });
  } catch (err) {
    console.error('Error marking all notifications as read:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 4) GET NOTIFICATION SUMMARY ────────────────────────────────────────────────
router.get('/notifications/summary', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const summaryQuery = `
      SELECT
        COUNT(*) as total_notifications,
        COUNT(CASE WHEN is_read = false THEN 1 END) as unread_count,
        COUNT(CASE WHEN type = 'deadline' THEN 1 END) as deadline_notifications,
        COUNT(CASE WHEN type = 'milestone' THEN 1 END) as milestone_notifications,
        COUNT(CASE WHEN type = 'welcome' THEN 1 END) as welcome_notifications,
        COUNT(CASE WHEN created_at >= NOW() - INTERVAL '7 days' THEN 1 END) as recent_notifications
      FROM notifications
      WHERE student_id = $1
    `;

    const result = await client.query(summaryQuery, [student_id]);
    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching notification summary:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 5) GET DEADLINE NOTIFICATIONS ──────────────────────────────────────────────
router.get('/deadlines', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const query = `
      SELECT
        a.id AS application_id,
        u.university_title,
        p.program_title,
        p.important_dates,
        a.created_at AS application_date,
        a.status AS application_status,
        a.phases
      FROM applications a
      JOIN programs p ON a.program_id = p.id
      JOIN universities u ON a.university_id = u.id
      WHERE a.student_id = $1
        AND p.important_dates IS NOT NULL
        AND jsonb_array_length(p.important_dates) > 0
        AND a.status != 'completed'
      ORDER BY a.created_at DESC
    `;

    const result = await client.query(query, [student_id]);
    const deadlines = [];

    for (const row of result.rows) {
      const dates = row.important_dates[0];
      const phases = row.phases;
      const currentDate = new Date();
      
      // Check which phases are not completed and have deadlines
      const phaseDeadlines = [];

      // Application submission deadline - show only if not completed
      const appSubmissionPhase = phases.find(p => p.phase === 'application_submission');
      if (!appSubmissionPhase?.completed && dates.deadline_application_submission) {
        const deadline = new Date(dates.deadline_application_submission);
        if (deadline > currentDate) {
          phaseDeadlines.push({
            date: dates.deadline_application_submission,
            type: 'Application Submission'
          });
        }
      }

      // Application fee deadline - show only if not completed
      const appFeePhase = phases.find(p => p.phase === 'application_fee_submission');
      if (!appFeePhase?.completed && dates.deadline_application_fee) {
        const deadline = new Date(dates.deadline_application_fee);
        if (deadline > currentDate) {
          phaseDeadlines.push({
            date: dates.deadline_application_fee,
            type: 'Application Fee Payment'
          });
        }
      }

      // Entry test deadline - show only if not completed
      const entryTestPhase = phases.find(p => p.phase === 'entry_test_and_result');
      if (!entryTestPhase?.completed && dates.deadline_admission_test_ecat) {
        const deadline = new Date(dates.deadline_admission_test_ecat);
        if (deadline > currentDate) {
          phaseDeadlines.push({
            date: dates.deadline_admission_test_ecat,
            type: 'Entry Test'
          });
        }
      }

      // Add each deadline to the results
      for (const deadline of phaseDeadlines) {
        const daysUntil = Math.ceil((new Date(deadline.date) - currentDate) / (1000 * 60 * 60 * 24));
        
        deadlines.push({
          application_id: row.application_id,
          university: row.university_title,
          program: row.program_title,
          deadline: deadline.date,
          deadline_type: deadline.type,
          days_until: daysUntil,
          is_urgent: daysUntil <= 7
        });
      }
    }

    // Sort by urgency and days until
    deadlines.sort((a, b) => {
      if (a.is_urgent && !b.is_urgent) return -1;
      if (!a.is_urgent && b.is_urgent) return 1;
      return a.days_until - b.days_until;
    });

    return res.json(deadlines);
  } catch (err) {
    console.error('Error fetching deadlines:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 6) DELETE NOTIFICATION ─────────────────────────────────────────────────────
router.delete('/notifications/:notification_id', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { notification_id } = req.params;
    const deleteQuery = `
      DELETE FROM notifications
      WHERE id = $1 AND student_id = $2
      RETURNING *
    `;
    const result = await client.query(deleteQuery, [notification_id, student_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Notification not found' });
    }

    return res.json({ message: 'Notification deleted successfully' });
  } catch (err) {
    console.error('Error deleting notification:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;