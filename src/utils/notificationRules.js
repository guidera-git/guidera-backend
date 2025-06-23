const client = require('../db');

class NotificationRules {
  static async processApplicationCreated(eventData) {
    const { applicationId, userId, uniId, programTitle, universityTitle } = eventData;
    
    try {
      // Rule: Send welcome notification on application creation
      const welcomeNotification = {
        student_id: userId,
        title: 'Application Started - Begin Document Gathering!',
        message: `Welcome! Your application to ${universityTitle} for ${programTitle} has been started. First step: Start gathering all required documents like transcripts, certificates, and other necessary paperwork. Complete each stage to move forward with your application.`,
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
    const { applicationId, userId, phase, programTitle, universityTitle, progressPercentage } = eventData;
    
    try {
      let notificationData = null;

      // Rule engine for the new 4 phases
      switch (phase) {
        case 'document_gathering':
          notificationData = {
            title: 'Great Start! Next Step: Submit Application',
            message: `Excellent! You've completed document gathering for ${programTitle} at ${universityTitle}. Now proceed to submit your application with all the documents you've prepared.`,
            type: 'milestone'
          };
          break;
        
        case 'application_submission':
          notificationData = {
            title: 'Application Submitted! Time for Fee Payment',
            message: `Your application for ${programTitle} at ${universityTitle} has been successfully submitted! Next step: Pay the application fee. Check the deadline to ensure timely payment.`,
            type: 'milestone'
          };
          break;
        
        case 'application_fee_submission':
          notificationData = {
            title: 'Fee Paid! Prepare for Entry Test',
            message: `Application fee payment completed for ${programTitle} at ${universityTitle}! Now prepare for your entry test and interview. Good luck with the final stage!`,
            type: 'milestone'
          };
          break;
        
        case 'entry_test_and_result':
          notificationData = {
            title: '🎉 Congratulations! Application Process Complete!',
            message: `Fantastic news! You have successfully completed all stages for your application to ${programTitle} at ${universityTitle}. Your admission journey is now complete. Whether you received an offer or not, you've shown great dedication. Best wishes for your future endeavors!`,
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
        { date: dates.deadline_application_submission, type: 'Application Submission', phase: 'application_submission' },
        { date: dates.deadline_application_fee, type: 'Application Fee Payment', phase: 'application_fee_submission' },
        { date: dates.deadline_admission_test_ecat, type: 'Entry Test', phase: 'entry_test_and_result' }
      ].filter(d => d.date);

      for (const deadline of deadlines) {
        // Only create deadline notification if it's in the future
        const deadlineDate = new Date(deadline.date);
        const currentDate = new Date();
        
        if (deadlineDate > currentDate) {
          const insertQuery = `
            INSERT INTO notifications (
              student_id, title, message, type, related_id, created_at
            ) VALUES ($1, $2, $3, $4, $5, NOW())
            RETURNING *
          `;

          await client.query(insertQuery, [
            userId,
            `${deadline.type} Deadline`,
            `Don't forget! Your ${deadline.type.toLowerCase()} deadline is approaching on ${deadlineDate.toLocaleDateString()}. Make sure to complete this step on time to keep your application on track.`,
            'deadline',
            applicationId.toString()
          ]);

          console.log(`Deadline notification created for ${deadline.type} - application ${applicationId}`);
        }
      }
    } catch (err) {
      console.error('Error scheduling deadline reminders:', err);
    }
  }

  // ─── NEW METHOD: REMOVE SPECIFIC DEADLINE NOTIFICATIONS ─────────────────────
  static async removeDeadlineNotifications(applicationId, userId, deadlineType) {
    try {
      const updateQuery = `
        UPDATE notifications
        SET is_read = true, read_at = NOW()
        WHERE student_id = $1 
          AND related_id = $2 
          AND type = 'deadline'
          AND title LIKE $3
          AND is_read = false
        RETURNING *
      `;

      const result = await client.query(updateQuery, [
        userId, 
        applicationId.toString(), 
        `%${deadlineType}%`
      ]);
      
      console.log(`Removed ${result.rowCount} deadline notifications for ${deadlineType} - application ${applicationId}`);
      return result.rows;
    } catch (err) {
      console.error('Error removing deadline notifications:', err);
    }
  }

  static async removeApplicationFeeDeadline(applicationId, userId) {
    try {
      // Mark application fee deadline notifications as read/completed
      const updateQuery = `
        UPDATE notifications
        SET is_read = true, read_at = NOW()
        WHERE student_id = $1 
          AND related_id = $2 
          AND type = 'deadline'
          AND title LIKE '%Fee%'
          AND is_read = false
        RETURNING *
      `;

      const result = await client.query(updateQuery, [userId, applicationId.toString()]);
      
      console.log(`Removed ${result.rowCount} fee deadline notifications for application ${applicationId}`);
      return result.rows;
    } catch (err) {
      console.error('Error removing application fee deadline:', err);
    }
  }
}

module.exports = NotificationRules;