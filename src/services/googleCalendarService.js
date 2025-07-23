const { google } = require('googleapis');
const moment = require('moment');

class GoogleCalendarService {
  constructor() {
    this.calendar = null;
    this.auth = null;
    this.isConfigured = false;
    this.init();
  }

  init() {
    try {
      // Check if Google Calendar is configured
      if (!process.env.GOOGLE_CALENDAR_CLIENT_ID || 
          !process.env.GOOGLE_CALENDAR_CLIENT_SECRET ||
          !process.env.GOOGLE_CALENDAR_REFRESH_TOKEN) {
        console.log('⚠️ Google Calendar not configured - skipping calendar sync');
        return;
      }

      // Set up OAuth2 client
      this.auth = new google.auth.OAuth2(
        process.env.GOOGLE_CALENDAR_CLIENT_ID,
        process.env.GOOGLE_CALENDAR_CLIENT_SECRET,
        process.env.GOOGLE_CALENDAR_REDIRECT_URI || 'http://localhost:3000/auth/google/callback'
      );

      // Set refresh token
      this.auth.setCredentials({
        refresh_token: process.env.GOOGLE_CALENDAR_REFRESH_TOKEN
      });

      // Initialize Calendar API
      this.calendar = google.calendar({ version: 'v3', auth: this.auth });
      this.isConfigured = true;
      
      console.log('✅ Google Calendar service initialized');
    } catch (error) {
      console.error('❌ Failed to initialize Google Calendar:', error.message);
      this.isConfigured = false;
    }
  }

  async createReservationEvent(reservationData) {
    if (!this.isConfigured) {
      console.log('⚠️ Google Calendar not configured - skipping event creation');
      return { success: false, reason: 'Calendar not configured' };
    }

    try {
      const {
        customerName,
        customerPhone,
        customerEmail,
        partySize,
        date,
        time,
        specialRequests,
        reservationId
      } = reservationData;

      // Create event start and end times
      const startDateTime = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
      const endDateTime = startDateTime.clone().add(2, 'hours'); // Assume 2-hour dining duration

      // Format event details
      const eventTitle = `Reservation: ${customerName} (Party of ${partySize})`;
      const eventDescription = this.formatEventDescription(reservationData);

      const event = {
        summary: eventTitle,
        description: eventDescription,
        start: {
          dateTime: startDateTime.toISOString(),
          timeZone: process.env.RESTAURANT_TIMEZONE || 'America/Los_Angeles',
        },
        end: {
          dateTime: endDateTime.toISOString(),
          timeZone: process.env.RESTAURANT_TIMEZONE || 'America/Los_Angeles',
        },
        attendees: customerEmail ? [{ email: customerEmail }] : [],
        reminders: {
          useDefault: false,
          overrides: [
            { method: 'email', minutes: 24 * 60 }, // 24 hours before
            { method: 'popup', minutes: 60 }, // 1 hour before
          ],
        },
        colorId: '2', // Green color for reservations
        extendedProperties: {
          private: {
            reservationId: reservationId,
            source: 'voice-agent',
            customerPhone: customerPhone,
            partySize: partySize.toString()
          }
        }
      };

      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const response = await this.calendar.events.insert({
        calendarId: calendarId,
        resource: event,
      });

      console.log('✅ Google Calendar event created:', response.data.id);

      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink
      };

    } catch (error) {
      console.error('❌ Failed to create Google Calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  formatEventDescription(reservationData) {
    const {
      customerName,
      customerPhone,
      customerEmail,
      partySize,
      date,
      time,
      specialRequests,
      reservationId
    } = reservationData;

    let description = `🍽️ RESERVATION DETAILS\n\n`;
    description += `👤 Customer: ${customerName}\n`;
    description += `📞 Phone: ${customerPhone}\n`;
    if (customerEmail) description += `📧 Email: ${customerEmail}\n`;
    description += `👥 Party Size: ${partySize} people\n`;
    description += `📅 Date: ${moment(date).format('dddd, MMMM Do, YYYY')}\n`;
    description += `🕒 Time: ${moment(time, 'HH:mm').format('h:mm A')}\n`;
    if (specialRequests) description += `📝 Special Requests: ${specialRequests}\n`;
    description += `\n🆔 Reservation ID: ${reservationId}\n`;
    description += `🤖 Created by: Rooney Voice Agent\n`;
    description += `⏰ Created: ${moment().format('YYYY-MM-DD HH:mm:ss')}`;

    return description;
  }

  async updateReservationEvent(eventId, updates) {
    if (!this.isConfigured) {
      console.log('⚠️ Google Calendar not configured - skipping event update');
      return { success: false, reason: 'Calendar not configured' };
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      // Get existing event
      const existingEvent = await this.calendar.events.get({
        calendarId: calendarId,
        eventId: eventId,
      });

      // Update event with new data
      const updatedEvent = {
        ...existingEvent.data,
        ...updates
      };

      const response = await this.calendar.events.update({
        calendarId: calendarId,
        eventId: eventId,
        resource: updatedEvent,
      });

      console.log('✅ Google Calendar event updated:', eventId);

      return {
        success: true,
        eventId: response.data.id,
        eventLink: response.data.htmlLink
      };

    } catch (error) {
      console.error('❌ Failed to update Google Calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async deleteReservationEvent(eventId) {
    if (!this.isConfigured) {
      console.log('⚠️ Google Calendar not configured - skipping event deletion');
      return { success: false, reason: 'Calendar not configured' };
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      await this.calendar.events.delete({
        calendarId: calendarId,
        eventId: eventId,
      });

      console.log('✅ Google Calendar event deleted:', eventId);

      return { success: true };

    } catch (error) {
      console.error('❌ Failed to delete Google Calendar event:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async getReservationEvents(startDate, endDate) {
    if (!this.isConfigured) {
      console.log('⚠️ Google Calendar not configured - skipping event retrieval');
      return { success: false, reason: 'Calendar not configured' };
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      
      const response = await this.calendar.events.list({
        calendarId: calendarId,
        timeMin: moment(startDate).toISOString(),
        timeMax: moment(endDate).toISOString(),
        singleEvents: true,
        orderBy: 'startTime',
        q: 'Reservation:', // Filter for reservation events
      });

      console.log(`✅ Retrieved ${response.data.items.length} reservation events`);

      return {
        success: true,
        events: response.data.items
      };

    } catch (error) {
      console.error('❌ Failed to retrieve Google Calendar events:', error.message);
      return {
        success: false,
        error: error.message
      };
    }
  }

  // Test connection to Google Calendar
  async testConnection() {
    if (!this.isConfigured) {
      return { success: false, message: 'Google Calendar not configured' };
    }

    try {
      const calendarId = process.env.GOOGLE_CALENDAR_ID || 'primary';
      const response = await this.calendar.calendars.get({
        calendarId: calendarId,
      });

      return {
        success: true,
        message: 'Google Calendar connection successful',
        calendarName: response.data.summary
      };

    } catch (error) {
      return {
        success: false,
        message: `Google Calendar connection failed: ${error.message}`
      };
    }
  }
}

module.exports = GoogleCalendarService; 