const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');
const GoogleCalendarService = require('./googleCalendarService');
const { globalTimer } = require('../utils/timer');

class ReservationManager {
  constructor() {
    this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/reservations.db');
    this.db = null;
    this.googleCalendar = new GoogleCalendarService();
    this.initDatabase();
    
    // Restaurant configuration
    this.restaurantConfig = {
      openHours: {
        tuesday: { open: '17:00', close: '22:00' },
        wednesday: { open: '17:00', close: '22:00' },
        thursday: { open: '17:00', close: '22:00' },
        friday: { open: '17:00', close: '23:00' },
        saturday: { open: '17:00', close: '23:00' },
        sunday: { open: '16:30', close: '21:30' },
        monday: null // Closed
      },
      maxPartySize: 8,
      maxReservationsPerSlot: 20, // Allow 20 reservations per time slot
      timeSlots: ['17:00', '17:30', '18:00', '18:30', '19:00', '19:30', '20:00', '20:30', '21:00', '21:30']
    };
  }

  initDatabase() {
    const fs = require('fs');
    const dataDir = path.dirname(this.dbPath);
    
    // Create data directory if it doesn't exist
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
    }

    this.db = new sqlite3.Database(this.dbPath, (err) => {
      if (err) {
        console.error('Error opening database:', err);
      } else {
        console.log('📊 Connected to SQLite database');
        this.createTables();
      }
    });
  }

  createTables() {
    const createReservationsTable = `
      CREATE TABLE IF NOT EXISTS reservations (
        id TEXT PRIMARY KEY,
        customer_name TEXT NOT NULL,
        customer_phone TEXT NOT NULL,
        customer_email TEXT,
        party_size INTEGER NOT NULL,
        reservation_date DATE NOT NULL,
        reservation_time TIME NOT NULL,
        table_id INTEGER,
        status TEXT DEFAULT 'confirmed',
        special_requests TEXT,
        source TEXT DEFAULT 'voice_call',
        call_sid TEXT,
        google_calendar_event_id TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    const createCustomersTable = `
      CREATE TABLE IF NOT EXISTS customers (
        phone TEXT PRIMARY KEY,
        name TEXT,
        email TEXT,
        visit_count INTEGER DEFAULT 1,
        last_visit DATE,
        preferences TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `;

    this.db.run(createReservationsTable, (err) => {
      if (err) console.error('Error creating reservations table:', err);
    });

    this.db.run(createCustomersTable, (err) => {
      if (err) console.error('Error creating customers table:', err);
    });
  }

  async checkAvailability(date, time, partySize, sessionHours = null) {
    return new Promise((resolve, reject) => {
      // Validate inputs - ensure we have a valid date
      let reservationMoment;
      
      // Handle case where date might still be a day name that wasn't normalized
      if (!moment(date, 'YYYY-MM-DD', true).isValid()) {
        console.log(`⚠️ Invalid date format: ${date}, attempting to parse...`);
        
        const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
        const inputDay = date.toLowerCase();
        
        if (dayNames.includes(inputDay)) {
          const today = moment();
          const todayIndex = today.day();
          const targetIndex = dayNames.indexOf(inputDay);
          let daysToAdd = targetIndex - todayIndex;
          if (daysToAdd <= 0) daysToAdd += 7;
          
          const targetDate = today.add(daysToAdd, 'days');
          date = targetDate.format('YYYY-MM-DD');
          console.log(`📅 Converted day name "${inputDay}" to date: ${date}`);
        }
      }
      
      reservationMoment = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
      
      if (!reservationMoment.isValid()) {
        console.log(`⚠️ Invalid reservation moment: ${date} ${time}`);
        resolve({
          available: false,
          reason: 'I\'m sorry, I couldn\'t understand that date and time. Could you please try again?',
          alternatives: []
        });
        return;
      }
      
      const dayOfWeek = reservationMoment.format('dddd').toLowerCase();
      console.log(`🗓️ Checking availability for ${dayOfWeek}, ${date} at ${time}`);
      
      // Use session hours if provided, otherwise fall back to hardcoded config
      let hours;
      if (sessionHours && sessionHours[dayOfWeek]) {
        hours = sessionHours[dayOfWeek];
        console.log(`📖 Using session hours from RAG: ${JSON.stringify(hours)}`);
      } else {
        hours = this.restaurantConfig.openHours[dayOfWeek];
        console.log(`⚠️ Falling back to hardcoded hours: ${JSON.stringify(hours)}`);
      }
      
      // Check if restaurant is open
      if (!hours || hours.status === 'closed') {
        // Get hours display info for better error message
        const hoursInfo = this.getHoursDisplayMessage(sessionHours);
        resolve({
          available: false,
          reason: hoursInfo.closedMessage,
          alternatives: this.getSuggestedAlternatives(date, time, partySize, sessionHours)
        });
        return;
      }

      // Check if time is within operating hours
      const requestTime = moment(time, 'HH:mm');
      const openTime = moment(hours.open, 'HH:mm');
      const closeTime = moment(hours.close, 'HH:mm');
      
      if (requestTime.isBefore(openTime) || requestTime.isAfter(closeTime)) {
        const displayHours = hours.display || `${moment(hours.open, 'HH:mm').format('h:mm A')} to ${moment(hours.close, 'HH:mm').format('h:mm A')}`;
        resolve({
          available: false,
          reason: `We are open from ${displayHours} on ${dayOfWeek}s.`,
          alternatives: this.getSuggestedAlternatives(date, time, partySize, sessionHours)
        });
        return;
      }

      // Check party size
      if (partySize > this.restaurantConfig.maxPartySize) {
        resolve({
          available: false,
          reason: `I am sorry, our maximum party size is ${this.restaurantConfig.maxPartySize} people. For larger groups, please call us directly.`,
          alternatives: []
        });
        return;
      }

      // Check for existing reservations count
      const query = `
        SELECT COUNT(*) as count 
        FROM reservations 
        WHERE reservation_date = ? 
        AND reservation_time = ? 
        AND status != 'cancelled'
      `;

      globalTimer.start('Database-Availability-Check');
      this.db.get(query, [date, time], (err, row) => {
        globalTimer.end('Database-Availability-Check');
        if (err) {
          reject(err);
          return;
        }

        const currentReservations = row.count || 0;
        console.log(`📊 Current reservations for ${date} ${time}: ${currentReservations}/${this.restaurantConfig.maxReservationsPerSlot}`);
        
        if (currentReservations < this.restaurantConfig.maxReservationsPerSlot) {
          resolve({
            available: true,
            tableId: currentReservations + 1, // Simple table assignment
            message: `Table for ${partySize} available at ${moment(time, 'HH:mm').format('h:mm A')} on ${moment(date).format('dddd, MMMM Do')}`
          });
        } else {
          const alternatives = this.getSuggestedAlternatives(date, time, partySize, sessionHours);
          const alternativeText = alternatives.length > 0 
            ? ` I don't have any availability for ${partySize} people within 2 hours of your requested time.`
            : ' Unfortunately, we are fully booked around that time.';
            
          resolve({
            available: false,
            message: `I am sorry, but we're fully booked at ${moment(time, 'HH:mm').format('h:mm A')} on ${moment(date).format('dddd, MMMM Do')}.${alternativeText}`,
            followUpQuestion: 'Would you like to try a different date, or would a different party size work?'
          });
        }
      });
    });
  }

  getHoursDisplayMessage(sessionHours) {
    if (sessionHours) {
      // Use session hours for accurate messaging
      const openDays = [];
      const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
      
      for (const day of days) {
        const dayHours = sessionHours[day];
        if (dayHours && dayHours.status !== 'closed') {
          openDays.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${dayHours.display}`);
        }
      }
      
      const closedDays = days.filter(day => 
        sessionHours[day] && sessionHours[day].status === 'closed'
      ).map(day => day.charAt(0).toUpperCase() + day.slice(1));
      
      let message = '';
      if (closedDays.length > 0) {
        message = `We are closed on ${closedDays.join(' and ')}${closedDays.length === 1 ? '' : 's'}. `;
      }
      
      if (openDays.length > 0) {
        message += `Our hours are: ${openDays.slice(0, 2).join(', ')}`;
        if (openDays.length > 2) {
          message += `, and similar hours other days. Would you like to make a reservation for another day?`;
        }
        message += '.';
      }
      
      return {
        closedMessage: message,
        fullHours: sessionHours
      };
    } else {
      // Fallback to hardcoded message
      return {
        closedMessage: 'We are closed on Mondays. We are open Tuesday through Sunday from 5 PM to 10 PM.',
        fullHours: null
      };
    }
  }

  getSuggestedAlternatives(date, time, partySize, sessionHours = null) {
    // Simple algorithm to suggest nearby times
    const requestTime = moment(time, 'HH:mm');
    const alternatives = [];
    
    console.log(`🔍 Looking for alternatives to ${time} for ${partySize} people`);
    
    // Determine available time slots based on session hours or fallback
    let timeSlots = this.restaurantConfig.timeSlots;
    
    if (sessionHours) {
      const dayOfWeek = moment(date).format('dddd').toLowerCase();
      const dayHours = sessionHours[dayOfWeek];
      
      if (dayHours && dayHours.status !== 'closed') {
        // Generate time slots based on actual hours
        timeSlots = this.generateTimeSlotsFromHours(dayHours.open, dayHours.close);
      }
    }
    
    // Check 30 minutes before and after, then 60 minutes
    for (let offset of [-30, 30, -60, 60, -90, 90]) {
      const altTime = moment(requestTime).add(offset, 'minutes');
      const altTimeStr = altTime.format('HH:mm');
      
      if (timeSlots.includes(altTimeStr)) {
        // Convert to user-friendly format (7:00 PM instead of 19:00)
        const displayTime = altTime.format('h:mm A');
        alternatives.push(displayTime);
      }
    }
    
    const finalAlternatives = alternatives.slice(0, 3); // Return up to 3 alternatives
    console.log(`💡 Suggesting alternatives: ${finalAlternatives.join(', ')}`);
    
    return finalAlternatives;
  }

  generateTimeSlotsFromHours(openTime, closeTime) {
    const slots = [];
    const start = moment(openTime, 'HH:mm');
    const end = moment(closeTime, 'HH:mm').subtract(30, 'minutes'); // Stop 30 min before close
    
    const current = start.clone();
    while (current.isSameOrBefore(end)) {
      slots.push(current.format('HH:mm'));
      current.add(30, 'minutes');
    }
    
    console.log(`⏰ Generated time slots from ${openTime}-${closeTime}:`, slots);
    return slots;
  }

  async createReservation(reservationData) {
    return new Promise((resolve, reject) => {
      const reservationId = uuidv4();
      const {
        customerName,
        customerPhone,
        customerEmail,
        partySize,
        date,
        time,
        specialRequests,
        source,
        callSid
      } = reservationData;

      console.log('💾 Creating reservation directly (availability already confirmed)');

      // Get current reservation count for table ID assignment
      const countQuery = `
        SELECT COUNT(*) as count 
        FROM reservations 
        WHERE reservation_date = ? 
        AND reservation_time = ? 
        AND status != 'cancelled'
      `;

      this.db.get(countQuery, [date, time], (err, row) => {
        if (err) {
          reject(err);
          return;
        }

        const currentReservations = row.count || 0;
        const tableId = currentReservations + 1;

        console.log(`📊 Assigning table ID ${tableId} for ${date} ${time}`);

        const insertQuery = `
          INSERT INTO reservations (
            id, customer_name, customer_phone, customer_email,
            party_size, reservation_date, reservation_time, table_id,
            special_requests, source, call_sid, google_calendar_event_id
          ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        `;

        this.db.run(insertQuery, [
          reservationId,
          customerName,
          customerPhone,
          customerEmail || null,
          partySize,
          date,
          time,
          tableId,
          specialRequests || null,
          source || 'voice_call',
          callSid || null,
          null // Placeholder for google_calendar_event_id - will be updated after calendar event creation
        ], async (err) => {
          if (err) {
            reject(err);
          } else {
            // Update customer record
            const customerQuery = `
              INSERT OR REPLACE INTO customers (phone, name, email, visit_count, last_visit)
              VALUES (?, ?, ?, 
                COALESCE((SELECT visit_count FROM customers WHERE phone = ?) + 1, 1),
                ?)
            `;
            
            this.db.run(customerQuery, [
              customerPhone, customerName, customerEmail, customerPhone, date
            ]);

            // Create Google Calendar event
            const calendarData = {
              reservationId,
              customerName,
              customerPhone,
              customerEmail,
              partySize,
              date,
              time,
              specialRequests
            };

            const calendarResult = await this.googleCalendar.createReservationEvent(calendarData);
            
            let googleCalendarEventId = null;
            if (calendarResult.success) {
              googleCalendarEventId = calendarResult.eventId;
              console.log('📅 Google Calendar event created:', googleCalendarEventId);
              
              // Update reservation with Google Calendar event ID
              const updateCalendarQuery = `
                UPDATE reservations 
                SET google_calendar_event_id = ? 
                WHERE id = ?
              `;
              
              this.db.run(updateCalendarQuery, [googleCalendarEventId, reservationId], (updateErr) => {
                if (updateErr) {
                  console.error('❌ Failed to update reservation with calendar event ID:', updateErr);
                }
              });
            } else {
              console.log('⚠️ Google Calendar event creation failed:', calendarResult.reason || calendarResult.error);
            }

            resolve({
              id: reservationId,
              customerName,
              customerPhone,
              partySize,
              date,
              time,
              tableId: tableId,
              status: 'confirmed',
              googleCalendarEventId: googleCalendarEventId,
              googleCalendarLink: calendarResult.eventLink
            });
          }
        });
      });
    });
  }

  async getReservation(id) {
    return new Promise((resolve, reject) => {
      const query = 'SELECT * FROM reservations WHERE id = ?';
      
      this.db.get(query, [id], (err, row) => {
        if (err) {
          reject(err);
        } else {
          resolve(row);
        }
      });
    });
  }

  async getTotalReservations() {
    return new Promise((resolve, reject) => {
      this.db.get('SELECT COUNT(*) as count FROM reservations', (err, row) => {
        if (err) reject(err);
        else resolve(row.count);
      });
    });
  }

  async getTodaysReservations() {
    return new Promise((resolve, reject) => {
      const today = moment().format('YYYY-MM-DD');
      const query = 'SELECT * FROM reservations WHERE reservation_date = ? ORDER BY reservation_time';
      
      this.db.all(query, [today], (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
  }

  async getAllReservations() {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM reservations 
        ORDER BY reservation_date ASC, reservation_time ASC
      `;

      this.db.all(query, [], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async getReservationsByDate(date) {
    return new Promise((resolve, reject) => {
      const query = `
        SELECT * FROM reservations 
        WHERE reservation_date = ? AND status != 'cancelled'
        ORDER BY reservation_time ASC
      `;

      this.db.all(query, [date], (err, rows) => {
        if (err) {
          reject(err);
          return;
        }
        resolve(rows);
      });
    });
  }

  async updateReservation(reservationId, updates) {
    return new Promise(async (resolve, reject) => {
      try {
        // Get existing reservation
        const existingReservation = await this.getReservation(reservationId);
        if (!existingReservation) {
          reject(new Error('Reservation not found'));
          return;
        }

        // Update database
        const updateFields = [];
        const updateValues = [];
        
        Object.keys(updates).forEach(key => {
          if (key !== 'id') {
            updateFields.push(`${key} = ?`);
            updateValues.push(updates[key]);
          }
        });
        
        updateValues.push(reservationId);
        
        const updateQuery = `
          UPDATE reservations 
          SET ${updateFields.join(', ')}, updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `;

        this.db.run(updateQuery, updateValues, async (err) => {
          if (err) {
            reject(err);
          } else {
            // Update Google Calendar event if it exists
            if (existingReservation.google_calendar_event_id) {
              const calendarUpdates = {};
              
              if (updates.reservation_date || updates.reservation_time) {
                const date = updates.reservation_date || existingReservation.reservation_date;
                const time = updates.reservation_time || existingReservation.reservation_time;
                const startDateTime = moment(`${date} ${time}`, 'YYYY-MM-DD HH:mm');
                const endDateTime = startDateTime.clone().add(2, 'hours');
                
                calendarUpdates.start = {
                  dateTime: startDateTime.toISOString(),
                  timeZone: process.env.RESTAURANT_TIMEZONE || 'America/Los_Angeles',
                };
                calendarUpdates.end = {
                  dateTime: endDateTime.toISOString(),
                  timeZone: process.env.RESTAURANT_TIMEZONE || 'America/Los_Angeles',
                };
              }
              
              if (updates.customer_name || updates.party_size) {
                const customerName = updates.customer_name || existingReservation.customer_name;
                const partySize = updates.party_size || existingReservation.party_size;
                calendarUpdates.summary = `Reservation: ${customerName} (Party of ${partySize})`;
              }

              const calendarResult = await this.googleCalendar.updateReservationEvent(
                existingReservation.google_calendar_event_id, 
                calendarUpdates
              );
              
              if (!calendarResult.success) {
                console.log('⚠️ Google Calendar event update failed:', calendarResult.error);
              }
            }

            resolve({ success: true, id: reservationId });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async cancelReservation(reservationId, reason = 'Customer cancellation') {
    return new Promise(async (resolve, reject) => {
      try {
        // Get existing reservation
        const existingReservation = await this.getReservation(reservationId);
        if (!existingReservation) {
          reject(new Error('Reservation not found'));
          return;
        }

        // Update database status
        const updateQuery = `
          UPDATE reservations 
          SET status = 'cancelled', updated_at = CURRENT_TIMESTAMP 
          WHERE id = ?
        `;

        this.db.run(updateQuery, [reservationId], async (err) => {
          if (err) {
            reject(err);
          } else {
            // Delete Google Calendar event if it exists
            if (existingReservation.google_calendar_event_id) {
              const calendarResult = await this.googleCalendar.deleteReservationEvent(
                existingReservation.google_calendar_event_id
              );
              
              if (!calendarResult.success) {
                console.log('⚠️ Google Calendar event deletion failed:', calendarResult.error);
              } else {
                console.log('📅 Google Calendar event deleted for cancelled reservation');
              }
            }

            resolve({ 
              success: true, 
              id: reservationId, 
              status: 'cancelled',
              reason: reason 
            });
          }
        });
      } catch (error) {
        reject(error);
      }
    });
  }

  async syncWithGoogleCalendar(startDate, endDate) {
    try {
      const calendarEvents = await this.googleCalendar.getReservationEvents(startDate, endDate);
      
      if (!calendarEvents.success) {
        console.log('⚠️ Failed to sync with Google Calendar:', calendarEvents.error);
        return { success: false, error: calendarEvents.error };
      }

      console.log(`📅 Found ${calendarEvents.events.length} calendar events to sync`);
      
      // This could be expanded to sync calendar events back to database
      // For now, just return the events for reference
      return {
        success: true,
        events: calendarEvents.events,
        count: calendarEvents.events.length
      };
    } catch (error) {
      console.error('❌ Calendar sync error:', error);
      return { success: false, error: error.message };
    }
  }

  async testGoogleCalendarConnection() {
    return await this.googleCalendar.testConnection();
  }

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = ReservationManager; 