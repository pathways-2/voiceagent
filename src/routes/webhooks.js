const express = require('express');
const router = express.Router();

// Twilio status callbacks
router.post('/twilio/status', (req, res) => {
  const { MessageSid, MessageStatus, To, From, ErrorCode, ErrorMessage } = req.body;
  
  console.log('📱 Twilio status update:', {
    sid: MessageSid,
    status: MessageStatus,
    to: To,
    from: From,
    error: ErrorCode ? { code: ErrorCode, message: ErrorMessage } : null
  });
  
  // You could store this in database for monitoring
  
  res.status(200).send('OK');
});

// SendGrid webhook for email delivery status
router.post('/sendgrid/events', (req, res) => {
  const events = req.body;
  
  events.forEach(event => {
    console.log('📧 SendGrid event:', {
      email: event.email,
      event: event.event,
      timestamp: event.timestamp,
      reason: event.reason
    });
  });
  
  res.status(200).send('OK');
});

// Google Calendar webhook (if using Calendar API)
router.post('/calendar/notifications', (req, res) => {
  const { resourceId, resourceUri, channelId } = req.headers;
  
  console.log('📅 Calendar notification:', {
    resourceId,
    resourceUri,
    channelId
  });
  
  // Handle calendar changes here
  
  res.status(200).send('OK');
});

// Health check for webhooks
router.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    service: 'webhooks',
    timestamp: new Date().toISOString()
  });
});

module.exports = router; 