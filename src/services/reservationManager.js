const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');
const moment = require('moment');
const path = require('path');

class ReservationManager {
  constructor() {
    this.dbPath = process.env.DATABASE_PATH || path.join(__dirname, '../../data/reservations.db');
    this.db = null;
    this.initDatabase();
    
    // Restaurant configuration
    this.restaurantConfig = {
      openHours: {
        tuesday: { open: '17:00', close: '22:00' },
        wednesday: { open: '17:00', close: '22:00' },
        thursday: { open: '17:00', close: '22:00' },
        friday: { open: '17:00', close: '22:00' },
        saturday: { open: '17:00', close: '22:00' },
        sunday: { open: '17:00', close: '22:00' },
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

  async checkAvailability(date, time, partySize) {
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
      
      // Check if restaurant is open
      const hours = this.restaurantConfig.openHours[dayOfWeek];
      if (!hours) {
        resolve({
          available: false,
          reason: 'We are closed on Mondays. We are open Tuesday through Sunday from 5 PM to 10 PM.',
          alternatives: this.getSuggestedAlternatives(date, time, partySize)
        });
        return;
      }

      // Check if time is within operating hours
      const requestTime = moment(time, 'HH:mm');
      const openTime = moment(hours.open, 'HH:mm');
      const closeTime = moment(hours.close, 'HH:mm');
      
      if (requestTime.isBefore(openTime) || requestTime.isAfter(closeTime)) {
        resolve({
          available: false,
          reason: `We are open from ${moment(hours.open, 'HH:mm').format('h:mm A')} to ${moment(hours.close, 'HH:mm').format('h:mm A')} on ${dayOfWeek}s.`,
          alternatives: this.getSuggestedAlternatives(date, time, partySize)
        });
        return;
      }

      // Check party size
      if (partySize > this.restaurantConfig.maxPartySize) {
        resolve({
          available: false,
          reason: `I'm sorry, our maximum party size is ${this.restaurantConfig.maxPartySize} people. For larger groups, please call us directly.`,
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

      this.db.get(query, [date, time], (err, row) => {
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
          const alternatives = this.getSuggestedAlternatives(date, time, partySize);
          const alternativeText = alternatives.length > 0 
            ? ` I don't have any availability for ${partySize} people within 2 hours of your requested time.`
            : ' Unfortunately, we are fully booked around that time.';
            
          resolve({
            available: false,
            message: `I'm sorry, but we're fully booked at ${moment(time, 'HH:mm').format('h:mm A')} on ${moment(date).format('dddd, MMMM Do')}.${alternativeText}`,
            followUpQuestion: 'Would you like to try a different date, or would a different party size work?'
          });
        }
      });
    });
  }

  // Removed findAvailableTable - now using simple reservation count system

  getSuggestedAlternatives(date, time, partySize) {
    // Simple algorithm to suggest nearby times
    const requestTime = moment(time, 'HH:mm');
    const alternatives = [];
    
    console.log(`🔍 Looking for alternatives to ${time} for ${partySize} people`);
    
    // Check 30 minutes before and after, then 60 minutes
    for (let offset of [-30, 30, -60, 60, -90, 90]) {
      const altTime = moment(requestTime).add(offset, 'minutes');
      const altTimeStr = altTime.format('HH:mm');
      
      if (this.restaurantConfig.timeSlots.includes(altTimeStr)) {
        // Convert to user-friendly format (7:00 PM instead of 19:00)
        const displayTime = altTime.format('h:mm A');
        alternatives.push(displayTime);
      }
    }
    
    const finalAlternatives = alternatives.slice(0, 3); // Return up to 3 alternatives
    console.log(`💡 Suggesting alternatives: ${finalAlternatives.join(', ')}`);
    
    return finalAlternatives;
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

      // First, check availability and get table
      this.checkAvailability(date, time, partySize)
        .then(availability => {
          if (!availability.available) {
            reject(new Error(availability.reason));
            return;
          }

          const query = `
            INSERT INTO reservations (
              id, customer_name, customer_phone, customer_email,
              party_size, reservation_date, reservation_time, table_id,
              special_requests, source, call_sid
            ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
          `;

          this.db.run(query, [
            reservationId,
            customerName,
            customerPhone,
            customerEmail || null,
            partySize,
            date,
            time,
            availability.tableId,
            specialRequests || null,
            source || 'voice_call',
            callSid || null
          ], (err) => {
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

              resolve({
                id: reservationId,
                customerName,
                customerPhone,
                partySize,
                date,
                time,
                tableId: availability.tableId,
                status: 'confirmed'
              });
            }
          });
        })
        .catch(reject);
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

  close() {
    if (this.db) {
      this.db.close();
    }
  }
}

module.exports = ReservationManager; 