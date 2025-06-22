const EventEmitter = require('events');

class ApplicationEventEmitter extends EventEmitter {}
const applicationEvents = new ApplicationEventEmitter();

// Event types
const EVENTS = {
  APPLICATION_CREATED: 'application.created',
  APPLICATION_PHASE_CHANGED: 'application.phaseChanged',
  NOTIFICATION_SENT: 'notification.sent',
  NOTIFICATION_READ: 'notification.read'
};

module.exports = {
  applicationEvents,
  EVENTS
};