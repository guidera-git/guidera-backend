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

// ─── DEADLINE VALIDATION HELPER ─────────────────────────────────────────────
async function checkApplicationDeadline(programId, universityId) {
  try {
    const query = `
      SELECT p.important_dates
      FROM programs p
      WHERE p.id = $1 AND p.university_id = $2
    `;
    const result = await client.query(query, [programId, universityId]);
    
    if (result.rows.length === 0) {
      return { canApply: false, reason: 'Program not found' };
    }

    const importantDates = result.rows[0].important_dates;
    if (!importantDates || !importantDates.length) {
      return { canApply: true }; // No deadline restrictions
    }

    const dates = importantDates[0];
    const currentDate = new Date();
    
    // Check application submission deadline
    if (dates.deadline_application_submission) {
      const deadline = new Date(dates.deadline_application_submission);
      if (currentDate > deadline) {
        return { 
          canApply: false, 
          reason: `Application submission deadline has passed. The deadline was ${deadline.toLocaleDateString()}.`,
          deadline: deadline.toISOString()
        };
      }
    }

    return { canApply: true };
  } catch (err) {
    console.error('Error checking deadline:', err);
    return { canApply: false, reason: 'Error checking application deadline' };
  }
}

// ─── NEW ENDPOINT: CHECK DEADLINE BEFORE APPLYING ───────────────────────────
router.get('/programs/:program_id/:university_id/deadline-check', auth, async (req, res) => {
  try {
    const { program_id, university_id } = req.params;
    const deadlineCheck = await checkApplicationDeadline(program_id, university_id);
    
    return res.json(deadlineCheck);
  } catch (err) {
    console.error('Error in deadline check:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 1) START NEW APPLICATION (WITH DEADLINE VALIDATION) ────────────────────
router.post('/applications', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { program_id, university_id } = req.body;
    if (!program_id || !university_id) {
      return res.status(400).json({ error: 'program_id and university_id are required' });
    }

    // ─── DEADLINE VALIDATION ─────────────────────────────────────────────────
    const deadlineCheck = await checkApplicationDeadline(program_id, university_id);
    if (!deadlineCheck.canApply) {
      return res.status(400).json({ 
        error: deadlineCheck.reason,
        deadline_exceeded: true 
      });
    }

    // Check if application already exists
    const existingQuery = `
      SELECT id FROM applications
      WHERE student_id = $1 AND program_id = $2
    `;
    const existing = await client.query(existingQuery, [student_id, program_id]);
    if (existing.rows.length > 0) {
      return res.status(400).json({ error: 'Application already exists for this program' });
    }

    // Get program and university details for events
    const detailsQuery = `
      SELECT p.program_title, u.university_title, p.important_dates
      FROM programs p
      JOIN universities u ON u.id = $2
      WHERE p.id = $1
    `;
    const detailsResult = await client.query(detailsQuery, [program_id, university_id]);
    if (detailsResult.rows.length === 0) {
      return res.status(404).json({ error: 'Program or university not found' });
    }

    const { program_title, university_title, important_dates } = detailsResult.rows[0];

    // New simplified 4-stage application phases
    const defaultPhases = [
      { 
        phase: 'document_gathering', 
        completed: false, 
        completed_at: null, 
        description: 'Start gathering all required documents for your application. Get your transcripts, certificates, and other necessary paperwork ready.' 
      },
      { 
        phase: 'application_submission', 
        completed: false, 
        completed_at: null, 
        description: 'Submit your completed application form with all required documents to the university.' 
      },
      { 
        phase: 'application_fee_submission', 
        completed: false, 
        completed_at: null, 
        description: 'Pay the application fee as required by the university. Check deadlines to avoid missing the payment window.' 
      },
      { 
        phase: 'entry_test_and_result', 
        completed: false, 
        completed_at: null, 
        description: 'Complete your entry test, attend interview if required, and receive your admission result.' 
      }
    ];

    // Insert new application with status = "started"
    const insertQuery = `
      INSERT INTO applications (
        student_id,
        program_id,
        university_id,
        status,
        progress_percentage,
        phases,
        created_at
      ) VALUES ($1, $2, $3, 'started', 0, $4, NOW())
      RETURNING *
    `;
    const result = await client.query(insertQuery, [
      student_id,
      program_id,
      university_id,
      JSON.stringify(defaultPhases)
    ]);

    const application = result.rows[0];

    // Emit event for notification system
    const eventData = {
      applicationId: application.id,
      userId: student_id,
      uniId: university_id,
      programId: program_id,
      programTitle: program_title,
      universityTitle: university_title,
      importantDates: important_dates
    };

    applicationEvents.emit(EVENTS.APPLICATION_CREATED, eventData);

    // Schedule deadline reminders
    if (important_dates) {
      await NotificationRules.scheduleDeadlineReminders(application.id, student_id, important_dates);
    }

    return res.status(201).json({
      message: 'Application started successfully',
      application: {
        ...application,
        program_title,
        university_title
      }
    });
  } catch (err) {
    console.error('Error creating application:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 2) GET ALL APPLICATIONS FOR USER ───────────────────────────────────────
router.get('/applications', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const query = `
      SELECT
        a.*,
        p.program_title,
        p.standardized_title,
        p.program_duration,
        p.important_dates,
        u.university_title,
        u.location
      FROM applications a
      JOIN programs p ON a.program_id = p.id
      JOIN universities u ON a.university_id = u.id
      WHERE a.student_id = $1
      ORDER BY a.created_at DESC
    `;
    const result = await client.query(query, [student_id]);

    return res.json(result.rows);
  } catch (err) {
    console.error('Error fetching applications:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 3) GET SPECIFIC APPLICATION ────────────────────────────────────────────
router.get('/applications/:application_id', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { application_id } = req.params;
    const query = `
      SELECT
        a.*,
        p.program_title,
        p.standardized_title,
        p.important_dates,
        u.university_title,
        u.location
      FROM applications a
      JOIN programs p ON a.program_id = p.id
      JOIN universities u ON a.university_id = u.id
      WHERE a.id = $1 AND a.student_id = $2
    `;
    const result = await client.query(query, [application_id, student_id]);
    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    return res.json(result.rows[0]);
  } catch (err) {
    console.error('Error fetching application:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 4) UPDATE APPLICATION PHASE (WITH SMART DEADLINE REMOVAL) ──────────────
router.patch('/applications/:application_id/phase', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { application_id } = req.params;
    const { phase, completed, note } = req.body;
    if (!phase || typeof completed !== 'boolean') {
      return res.status(400).json({ error: 'phase and completed (boolean) are required' });
    }

    // Fetch current application details
    const getQuery = `
      SELECT a.phases, p.program_title, u.university_title, p.important_dates
      FROM applications a
      JOIN programs p ON a.program_id = p.id
      JOIN universities u ON a.university_id = u.id
      WHERE a.id = $1 AND a.student_id = $2
    `;
    const appResult = await client.query(getQuery, [application_id, student_id]);
    if (appResult.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    const { phases, program_title, university_title, important_dates } = appResult.rows[0];
    const phaseIndex = phases.findIndex(p => p.phase === phase);

    if (phaseIndex === -1) {
      return res.status(400).json({ error: 'Invalid phase' });
    }

    // Update phase
    phases[phaseIndex].completed = completed;
    phases[phaseIndex].completed_at = completed ? new Date() : null;
    if (note !== undefined) {
      phases[phaseIndex].note = note;
    }

    // Recalculate progress (25% per phase)
    const completedCount = phases.filter(p => p.completed).length;
    const progressPercentage = Math.round((completedCount / phases.length) * 100);

    // Determine application status based on progress
    let status = 'started';
    if (progressPercentage === 100) {
      status = 'completed';
    } else if (progressPercentage > 0) {
      status = 'in_progress';
    }

    // Write to application_phases table for tracking
    const phaseInsertQuery = `
      INSERT INTO application_phases (
        application_id, phase, status, completed_at, notes, created_at
      ) VALUES ($1, $2, $3, $4, $5, NOW())
      RETURNING *
    `;
    await client.query(phaseInsertQuery, [
      application_id,
      phase,
      completed ? 'completed' : 'pending',
      completed ? new Date() : null,
      note || null
    ]);

    // Update main application record
    const updateQuery = `
      UPDATE applications
      SET phases = $1, progress_percentage = $2, status = $3, updated_at = NOW()
      WHERE id = $4 AND student_id = $5
      RETURNING *
    `;
    const updateResult = await client.query(updateQuery, [
      JSON.stringify(phases),
      progressPercentage,
      status,
      application_id,
      student_id
    ]);

    // ─── SMART DEADLINE REMOVAL ──────────────────────────────────────────────
    if (completed) {
      // Remove corresponding deadline notifications
      if (phase === 'application_submission') {
        await NotificationRules.removeDeadlineNotifications(application_id, student_id, 'Application Submission');
      } else if (phase === 'application_fee_submission') {
        await NotificationRules.removeDeadlineNotifications(application_id, student_id, 'Application Fee Payment');
      } else if (phase === 'entry_test_and_result') {
        await NotificationRules.removeDeadlineNotifications(application_id, student_id, 'Entry Test');
      }

      // Emit event for milestone notification
      const eventData = {
        applicationId: application_id,
        userId: student_id,
        phase,
        programTitle: program_title,
        universityTitle: university_title,
        progressPercentage,
        importantDates: important_dates
      };

      applicationEvents.emit(EVENTS.APPLICATION_PHASE_CHANGED, eventData);
    }

    return res.json(updateResult.rows[0]);
  } catch (err) {
    console.error('Error updating phase:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 5) DELETE APPLICATION ──────────────────────────────────────────────────
router.delete('/applications/:application_id', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { application_id } = req.params;
    const deleteQuery = `
      DELETE FROM applications
      WHERE id = $1 AND student_id = $2
      RETURNING *
    `;
    const result = await client.query(deleteQuery, [application_id, student_id]);

    if (result.rows.length === 0) {
      return res.status(404).json({ error: 'Application not found' });
    }

    return res.json({ message: 'Application deleted successfully' });
  } catch (err) {
    console.error('Error deleting application:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

// ─── 6) CHECK APPLICATION STATUS FOR PROGRAM ───────────────────────────────
router.get('/applications/check/:program_id/:university_id', auth, async (req, res) => {
  try {
    const student_id = getStudentId(req);
    if (!student_id) {
      return res.status(401).json({ error: 'Invalid authentication payload' });
    }

    const { program_id, university_id } = req.params;

    const query = `
      SELECT 
        id,
        status,
        progress_percentage,
        phases,
        created_at,
        updated_at
      FROM applications
      WHERE student_id = $1 AND program_id = $2 AND university_id = $3
    `;

    const result = await client.query(query, [student_id, program_id, university_id]);

    if (result.rows.length === 0) {
      return res.json({ exists: false });
    }

    const application = result.rows[0];
    return res.json({
      exists: true,
      application: application
    });
  } catch (err) {
    console.error('Error checking application status:', err);
    return res.status(500).json({ error: 'Internal server error' });
  }
});

module.exports = router;