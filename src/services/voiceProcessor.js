const ConversationManager = require('./conversationManager');
const ReservationManager = require('./reservationManager');
const NotificationService = require('./notificationService');

class VoiceProcessor {
  constructor() {
    this.conversationManager = new ConversationManager();
    this.reservationManager = new ReservationManager();
    this.notificationService = new NotificationService();
  }

  async processUserInput(speechText, customerPhone, callSid) {
    console.log('🎯 Processing user input:', { speechText, customerPhone, callSid });

    try {
      // Process with conversation manager
      const response = await this.conversationManager.processMessage(
        speechText, 
        callSid, 
        customerPhone
      );

      // Handle reservation creation with proper flow
      if (response.intent === 'reservation') {
        console.log('🎯 Reservation intent detected. Extracted data:', response.extractedData);
        
        const hasBasicInfo = this.hasBasicReservationInfo(response.extractedData);
        const isComplete = this.isReservationComplete(response.extractedData);
        
        console.log('🔍 Reservation status:', {
          hasBasicInfo: hasBasicInfo,
          isComplete: isComplete
        });
        
        if (hasBasicInfo && !isComplete) {
          // We have date/time/party size but missing name/phone
          // CHECK AVAILABILITY FIRST before asking for personal details
          console.log('✅ Basic reservation info complete, checking availability before asking for personal details...');
          
          const normalizedData = this.normalizeReservationData(response.extractedData);
          console.log('🔄 Normalized basic data for availability check:', normalizedData);
          
          const availabilityResult = await this.checkReservationAvailability(
            normalizedData, 
            customerPhone, 
            callSid
          );
          
          console.log('📅 Availability check result:', availabilityResult);
          
          if (availabilityResult.available) {
            // Time slot is available, now ask for personal details
            response.message = `Great! I have availability for ${normalizedData.partySize} people on ${this.formatDate(normalizedData.date)} at ${this.formatTime(normalizedData.time)}. May I please get your name and phone number to complete the reservation?`;
            response.needsMoreInput = true;
            response.followUpQuestion = "What name should I put the reservation under, and what's the best phone number to reach you?";
          } else {
            // Not available, suggest alternatives or ask for different date
            response.message = availabilityResult.message;
            response.needsMoreInput = true;
            response.followUpQuestion = availabilityResult.followUpQuestion;
          }
          
        } else if (isComplete) {
          // We have everything, proceed with booking
          console.log('✅ All reservation data complete, proceeding with booking...');
          
          const normalizedData = this.normalizeReservationData(response.extractedData, customerPhone);
          console.log('🔄 Normalized complete data for booking:', normalizedData);
          
          const reservationResult = await this.handleReservationBooking(
            normalizedData, 
            customerPhone, 
            callSid
          );
          
          console.log('📅 Final booking result:', {
            success: reservationResult.success,
            message: reservationResult.message
          });
          
          if (reservationResult.success) {
            // Send confirmation
            await this.notificationService.sendConfirmation(
              reservationResult.reservation, 
              customerPhone
            );

            // Reset conversation context for fresh start
            this.conversationManager.resetConversationContext(callSid);

            response.message = reservationResult.message + ` Your reservation is confirmed! You'll receive a text message with the details shortly. Is there anything else I can help you with today?`;
            response.needsMoreInput = true; // Wait for user response
            // Clear any AI-generated follow-up questions since reservation is complete
            response.followUpQuestion = null; // Already asked in main message
          } else {
            response.message = reservationResult.message;
            response.needsMoreInput = true;
          }
        } else {
          console.log('⏳ Missing basic reservation info (date/time/party size), continuing conversation...');
        }
      }

      return response;

    } catch (error) {
      console.error('Error processing voice input:', error);
      
      return {
        message: "I apologize, but I'm experiencing some technical difficulties. Let me connect you with one of our team members who can assist you.",
        transferToHuman: true,
        error: true
      };
    }
  }

  isReservationComplete(data) {
    if (!data) {
      console.log('❌ No reservation data provided');
      return false;
    }
    
    // Check for required fields with flexible naming
    const hasDate = data.date;
    const hasTime = data.time;
    const hasPartySize = data.partySize;
    const hasName = data.customerName || data.name;
    const hasPhone = data.customerPhone || data.phone;
    
    console.log('🔍 Reservation completeness check:', {
      hasDate: !!hasDate,
      hasTime: !!hasTime, 
      hasPartySize: !!hasPartySize,
      hasName: !!hasName,
      hasPhone: !!hasPhone,
      actualData: data
    });
    
    const isComplete = hasDate && hasTime && hasPartySize && hasName && hasPhone;
    
    if (!isComplete) {
      const missing = [];
      if (!hasDate) missing.push('date');
      if (!hasTime) missing.push('time'); 
      if (!hasPartySize) missing.push('party size');
      if (!hasName) missing.push('customer name');
      if (!hasPhone) missing.push('phone number');
      console.log(`⚠️ Missing fields: ${missing.join(', ')}`);
    }
    
    return isComplete;
  }

  hasBasicReservationInfo(data) {
    if (!data) {
      console.log('❌ No reservation data provided');
      return false;
    }
    
    const hasDate = data.date;
    const hasTime = data.time;
    const hasPartySize = data.partySize;
    
    console.log('🔍 Basic reservation info check:', {
      hasDate: !!hasDate,
      hasTime: !!hasTime, 
      hasPartySize: !!hasPartySize,
      actualData: data
    });
    
    return hasDate && hasTime && hasPartySize;
  }

  normalizeReservationData(data, customerPhone = null) {
    const normalized = { ...data };
    
    // Normalize date format
    if (normalized.date) {
      normalized.date = this.normalizeDate(normalized.date);
    }
    
    // Normalize time format  
    if (normalized.time) {
      normalized.time = this.normalizeTime(normalized.time);
    }
    
    // Normalize names (for complete reservations)
    if (customerPhone) {
      normalized.customerName = normalized.customerName || normalized.name;
      normalized.customerPhone = normalized.customerPhone || normalized.phone || customerPhone;
    }
    
    return normalized;
  }

  async checkReservationAvailability(reservationData, customerPhone, callSid) {
    try {
      console.log('🔍 Checking reservation availability...', {
        date: reservationData.date,
        time: reservationData.time,
        partySize: reservationData.partySize
      });

      // Get session hours from conversation context
      const sessionHours = this.conversationManager.getSessionHours(callSid);
      console.log('📅 Using session hours for availability check:', sessionHours ? 'Yes (from RAG)' : 'No (fallback)');

      const availability = await this.reservationManager.checkAvailability(
        reservationData.date,
        reservationData.time,
        reservationData.partySize,
        sessionHours // Pass session hours from RAG
      );

      return {
        available: availability.available,
        message: availability.message || availability.reason,
        followUpQuestion: availability.followUpQuestion,
        alternatives: availability.alternatives || [],
        tableId: availability.tableId
      };

    } catch (error) {
      console.error('❌ Error checking availability:', error);
      
      return {
        available: false,
        message: "I'm sorry, I'm having trouble checking our availability right now. Please try again or call us directly.",
        followUpQuestion: "Would you like me to transfer you to someone who can help?",
        alternatives: []
      };
    }
  }

  async getAlternativeTimesWithinRange(date, requestedTime, partySize, hoursRange) {
    const moment = require('moment');
    const alternatives = [];
    
    const requestedMoment = moment(`${date} ${requestedTime}`, 'YYYY-MM-DD HH:mm');
    const startRange = moment(requestedMoment).subtract(hoursRange, 'hours');
    const endRange = moment(requestedMoment).add(hoursRange, 'hours');
    
    // Get restaurant time slots within operating hours
    const timeSlots = this.reservationManager.restaurantConfig.timeSlots;
    
    for (const timeSlot of timeSlots) {
      const slotMoment = moment(`${date} ${timeSlot}`, 'YYYY-MM-DD HH:mm');
      
      // Check if slot is within range and not the originally requested time
      if (slotMoment.isBetween(startRange, endRange, null, '[]') && 
          timeSlot !== requestedTime) {
        
        try {
          const availability = await this.reservationManager.checkAvailability(
            date, timeSlot, partySize
          );
          
          if (availability.available) {
            alternatives.push(timeSlot);
          }
        } catch (error) {
          console.error(`Error checking availability for ${timeSlot}:`, error);
        }
      }
    }
    
    // Sort by proximity to requested time and return max 3
    return alternatives
      .sort((a, b) => {
        const aMoment = moment(`${date} ${a}`, 'YYYY-MM-DD HH:mm');
        const bMoment = moment(`${date} ${b}`, 'YYYY-MM-DD HH:mm');
        return Math.abs(aMoment.diff(requestedMoment)) - Math.abs(bMoment.diff(requestedMoment));
      })
      .slice(0, 3);
  }

  formatDate(dateStr) {
    const moment = require('moment');
    return moment(dateStr).format('dddd, MMMM Do');
  }

  formatTime(timeStr) {
    const moment = require('moment');
    return moment(timeStr, 'HH:mm').format('h:mm A');
  }

  async handleReservationBooking(reservationData, customerPhone, callSid) {
    try {
      console.log('📝 Processing reservation booking...', {
        customerName: reservationData.customerName,
        partySize: reservationData.partySize,
        date: reservationData.date,
        time: reservationData.time
      });

      console.log('✅ Availability already confirmed - proceeding directly to booking');

      // Create the reservation directly (availability was already confirmed)
      const reservation = await this.reservationManager.createReservation({
        customerName: reservationData.customerName,
        customerPhone: reservationData.customerPhone,
        customerEmail: reservationData.customerEmail || null,
        partySize: parseInt(reservationData.partySize),
        date: reservationData.date,
        time: reservationData.time,
        specialRequests: reservationData.specialRequests || null,
        source: 'voice_call',
        callSid: callSid
      });

      if (reservation && reservation.id) {
        const confirmationMessage = `Perfect! I've successfully booked your table for ${reservation.partySize} people on ${this.formatDate(reservation.date)} at ${this.formatTime(reservation.time)} under the name ${reservation.customerName}.`;
        
        return {
          success: true,
          message: confirmationMessage,
          reservation: {
            id: reservation.id,
            customerName: reservation.customerName,
            partySize: reservation.partySize,
            date: reservation.date,
            time: reservation.time,
            customerPhone: reservationData.customerPhone
          }
        };
      } else {
        throw new Error('Reservation creation failed - no ID returned');
      }

    } catch (error) {
      console.error('❌ Error creating reservation:', error);
      
      return {
        success: false,
        message: "I'm sorry, there was an issue completing your reservation. Please try again or call us directly to book your table."
      };
    }
  }

  normalizeDate(dateInput) {
    const moment = require('moment');
    
    if (!dateInput) return null;
    
    const input = dateInput.toLowerCase().trim();
    
    if (input === 'today') {
      return moment().format('YYYY-MM-DD');
    } else if (input === 'tomorrow') {
      return moment().add(1, 'day').format('YYYY-MM-DD');
    } else if (input.includes('tonight')) {
      return moment().format('YYYY-MM-DD');
    } else {
      // Handle day names (Wednesday, Thursday, etc.)
      const dayNames = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday'];
      const inputDay = input.toLowerCase();
      
      if (dayNames.includes(inputDay)) {
        const today = moment();
        const todayIndex = today.day(); // 0 = Sunday, 1 = Monday, etc.
        const targetIndex = dayNames.indexOf(inputDay);
        
        let daysToAdd = targetIndex - todayIndex;
        
        // If the target day is today or in the past this week, move to next week
        if (daysToAdd <= 0) {
          daysToAdd += 7;
        }
        
        const targetDate = today.add(daysToAdd, 'days');
        console.log(`📅 Converted "${inputDay}" to ${targetDate.format('YYYY-MM-DD')} (${targetDate.format('dddd')})`);
        return targetDate.format('YYYY-MM-DD');
      }
      
      // Try to parse as a regular date
      const parsedDate = moment(dateInput);
      if (parsedDate.isValid()) {
        return parsedDate.format('YYYY-MM-DD');
      }
    }
    
    console.log(`⚠️ Could not normalize date: ${dateInput}`);
    return dateInput; // Return as-is if we can't parse it
  }
  
  normalizeTime(timeInput) {
    const moment = require('moment');
    
    if (!timeInput) return null;
    
    // Handle various time formats
    const timeStr = timeInput.toLowerCase().trim();
    
    // Try common patterns
    const patterns = [
      'h:mm A',     // 8:00 PM
      'h:mm a',     // 8:00 pm  
      'h A',        // 8 PM
      'h a',        // 8 pm
      'HH:mm',      // 20:00
      'H:mm'        // 8:00 (24hr)
    ];
    
    for (const pattern of patterns) {
      const parsed = moment(timeStr, pattern);
      if (parsed.isValid()) {
        return parsed.format('HH:mm'); // Return in 24-hour format
      }
    }
    
    console.log(`⚠️ Could not normalize time: ${timeInput}`);
    return timeInput; // Return as-is if we can't parse it
  }

  // Get processor statistics for monitoring
  getStats() {
    return {
      activeConversations: this.conversationManager.getActiveConversations(),
      totalReservations: this.reservationManager.getTotalReservations(),
      timestamp: new Date().toISOString()
    };
  }
}

module.exports = VoiceProcessor; 