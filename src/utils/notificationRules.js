const client = require('../db');

class NotificationRules {
  static async processApplicationCreated(eventData) {
    const { applicationId, userId, uniId, programTitle, universityTitle } = eventData;
    
    try {
      // Rule: Send welcome notification on application creation
      const welcomeNotification = {
        student_id: userId,
        title: 'Application Started Successfully!',
        message: `Congratulations! Your application to ${universityTitle} for ${programTitle} has been started. Complete all the required steps to finalize your application.`,
        type: 'welcome',
        related_id: applicationId.toString(),
        created_at: new Date()
      };

      const insertQuery = `
        INSERT INTO notifications (
          student_id, title, message, type, related_id, created_at
        ) VALUES ($1, $2, $3, $4, $5, $6)
        RETURNING *
      `;

      const result = await client.query(insertQuery, [
        welcomeNotification.student_id,
        welcomeNotification.title,
        welcomeNotification.message,
        welcomeNotification.type,
        welcomeNotification.related_id,
        welcomeNotification.created_at
      ]);

      console.log(`Welcome notification sent for application ${applicationId}`);
      return result.rows[0];
    } catch (err) {
      console.error('Error processing application created notification:', err);
    }
  }

  static async processPhaseChanged(eventData) {
    const { applicationId, userId, phase, programTitle, universityTitle } = eventData;
    
    try {
      let notificationData = null;

      // Rule engine for different phases
      switch (phase) {
        case 'documents_uploaded':
          notificationData = {
            title: 'Next Step: Prepare for Tests',
            message: `Documents uploaded successfully for ${universityTitle}! Time to prepare for your admission tests.`,
            type: 'milestone'
          };
          break;
        
        case 'test_scheduled':
          notificationData = {
            title: 'Test Scheduled Successfully',
            message: `Your admission test for ${programTitle} at ${universityTitle} has been scheduled. Check your important dates for details.`,
            type: 'milestone'
          };
          break;
        
        case 'test_completed':
          notificationData = {
            title: 'Test Completed! Next: Interview',
            message: `Great job completing your test for ${universityTitle}! Now prepare for the interview phase.`,
            type: 'milestone'
          };
          break;
        
        case 'interview_scheduled':
          notificationData = {
            title: 'Interview Scheduled',
            message: `Your interview for ${programTitle} at ${universityTitle} has been scheduled. Best of luck!`,
            type: 'milestone'
          };
          break;
        
        case 'offer_received':
          notificationData = {
            title: '🎉 Admission Offer Received!',
            message: `Congratulations! You've received an admission offer from ${universityTitle} for ${programTitle}. Time to make your decision!`,
            type: 'milestone'
          };
          break;
      }

      if (notificationData) {
        const insertQuery = `
          INSERT INTO notifications (
            student_id, title, message, type, related_id, created_at
          ) VALUES ($1, $2, $3, $4, $5, NOW())
          RETURNING *
        `;

        const result = await client.query(insertQuery, [
          userId,
          notificationData.title,
          notificationData.message,
          notificationData.type,
          applicationId.toString()
        ]);

        console.log(`Phase change notification sent: ${phase} for application ${applicationId}`);
        return result.rows[0];
      }
    } catch (err) {
      console.error('Error processing phase change notification:', err);
    }
  }

  static async scheduleDeadlineReminders(applicationId, userId, importantDates) {
    try {
      if (!importantDates || !importantDates.length) return;

      const dates = importantDates[0];
      const deadlines = [
        { date: dates.deadline_application_submission, type: 'application_deadline' },
        { date: dates.deadline_admission_test_ecat, type: 'test_deadline' },
        { date: dates.deadline_sat, type: 'sat_deadline' }
      ].filter(d => d.date);

      for (const deadline of deadlines) {
        // Schedule reminder notification 7 days before deadline
        const reminderDate = new Date(deadline.date);
        reminderDate.setDate(reminderDate.getDate() - 7);

        if (reminderDate > new Date()) {
          const insertQuery = `
            INSERT INTO notifications (
              student_id, title, message, type, related_id, scheduled_for, created_at
            ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
            RETURNING *
          `;

          await client.query(insertQuery, [
            userId,
            'Deadline Reminder',
            `Your ${deadline.type.replace('_', ' ')} is approaching in 7 days. Don't forget to complete all requirements!`,
            'deadline',
            applicationId.toString(),
            reminderDate
          ]);

          console.log(`Deadline reminder scheduled for application ${applicationId}`);
        }
      }
    } catch (err) {
      console.error('Error scheduling deadline reminders:', err);
    }
  }
}

module.exports = NotificationRules;