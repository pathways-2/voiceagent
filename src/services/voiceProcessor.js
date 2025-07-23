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
        
        // Get full conversation context to merge data from all messages
        const conversation = await this.conversationManager.getConversation(callSid);
        const fullReservationData = { ...conversation.context, ...response.extractedData };
        console.log('📋 Full reservation context:', fullReservationData);
        
        const hasBasicInfo = this.hasBasicReservationInfo(fullReservationData);
        const isComplete = this.isReservationComplete(fullReservationData);
        
        console.log('🔍 Reservation status:', {
          hasBasicInfo: hasBasicInfo,
          isComplete: isComplete
        });
        
        if (hasBasicInfo && !isComplete) {
          // We have date/time/party size but missing name/phone
          // CHECK AVAILABILITY FIRST before asking for personal details
          console.log('✅ Basic reservation info complete, checking availability before asking for personal details...');
          
          const normalizedData = this.normalizeReservationData(fullReservationData);
          console.log('🔄 Normalized basic data for availability check:', normalizedData);
          
          // Check for date parsing errors
          if (normalizedData.dateParseError) {
            response.message = normalizedData.dateParseError;
            response.needsMoreInput = true;
            response.followUpQuestion = "Please tell me the date you'd like to dine with us.";
            return response;
          }
          
          const availabilityResult = await this.checkReservationAvailability(
            normalizedData, 
            customerPhone, 
            callSid
          );
          
          console.log('📅 Availability check result:', availabilityResult);
          
          if (availabilityResult.available) {
            // Time slot is available, now ask for personal details
            // Check what's actually missing and ask only for that
            const hasName = !!(fullReservationData.name || fullReservationData.customerName);
            const hasPhone = !!(fullReservationData.phone || fullReservationData.customerPhone);
            
            let missingInfo = [];
            let followUpQuestion = "";
            
            if (!hasName && !hasPhone) {
              missingInfo = ["your name", "phone number"];
              followUpQuestion = "What name should I put the reservation under, and what's the best phone number to reach you?";
            } else if (!hasName) {
              missingInfo = ["your name"];
              followUpQuestion = "What name should I put the reservation under?";
            } else if (!hasPhone) {
              missingInfo = ["your phone number"];
              followUpQuestion = "What's the best phone number to reach you?";
            }
            
            const missingText = missingInfo.length === 2 ? 
              `${missingInfo[0]} and ${missingInfo[1]}` : 
              missingInfo[0];
            
            response.message = `Great! I have availability for ${normalizedData.partySize} people on ${this.formatDate(normalizedData.date)} at ${this.formatTime(normalizedData.time)}. May I please get ${missingText} to complete the reservation?`;
            response.needsMoreInput = true;
            response.followUpQuestion = followUpQuestion;
          } else {
            // Not available, suggest alternatives or ask for different date
            response.message = availabilityResult.message;
            response.needsMoreInput = true;
            response.followUpQuestion = availabilityResult.followUpQuestion;
          }
          
        } else if (isComplete) {
          // We have everything, proceed with booking
          console.log('✅ All reservation data complete, proceeding with booking...');
          
          const normalizedData = this.normalizeReservationData(fullReservationData, customerPhone);
          console.log('🔄 Normalized complete data for booking:', normalizedData);
          
          // Check for date parsing errors
          if (normalizedData.dateParseError) {
            response.message = normalizedData.dateParseError;
            response.needsMoreInput = true;
            response.followUpQuestion = "Please tell me the date you'd like to dine with us.";
            return response;
          }
          
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
            // Send confirmation using the customer's provided phone number, not the original caller's phone
            const smsTargetPhone = reservationResult.reservation.customerPhone || reservationResult.reservation.customer_phone;
            console.log('📱 SMS target phone:', {
              originalCallerPhone: customerPhone,
              customerProvidedPhone: smsTargetPhone,
              usingForSMS: smsTargetPhone
            });
            
            await this.notificationService.sendConfirmation(
              reservationResult.reservation, 
              smsTargetPhone
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
    
    // Check for required fields with flexible naming (convert to boolean)
    const hasDate = !!data.date;
    const hasTime = !!data.time;
    const hasPartySize = !!data.partySize;
    const hasName = !!(data.customerName || data.name);
    const hasPhone = !!(data.customerPhone || data.phone);
    
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
      const normalizedDate = this.normalizeDate(normalized.date);
      if (!normalizedDate) {
        console.log(`❌ Failed to parse date: "${normalized.date}"`);
        // Return error state to prevent processing with invalid date
        return { 
          ...normalized, 
          date: null, 
          dateParseError: `I couldn't understand the date "${normalized.date}". Please specify the date in a format like "July 26", "July 26 2025", or "07/26".`
        };
      }
      normalized.date = normalizedDate;
    }
    
    // Normalize time format  
    if (normalized.time) {
      normalized.time = this.normalizeTime(normalized.time);
    }
    
    // Normalize names (for complete reservations) - use consistent field names
    if (customerPhone) {
      // Use consistent field names and avoid duplicates
      normalized.customerName = normalized.customerName || normalized.name;
      normalized.customerPhone = normalized.customerPhone || normalized.phone || customerPhone;
      
      // Remove duplicate fields to keep data clean
      if (normalized.customerName && normalized.name && normalized.customerName === normalized.name) {
        delete normalized.name;
      }
      if (normalized.customerPhone && normalized.phone && normalized.customerPhone === normalized.phone) {
        delete normalized.phone;
      }
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
      
      // Try to parse as a regular date with explicit formats
      const currentYear = moment().year();
      const dateFormats = [
        'YYYY-MM-DD',     // 2025-09-27
        'MM-DD-YYYY',     // 09-27-2025
        'MMM DD',         // Sep 27 (July 26)
        'MMMM DD',        // September 27 (July 26)
        'DD MMM',         // 27 Sep (26 July)
        'DD MMMM',        // 27 September (26 July)
        'MMM DD YYYY',    // Sep 27 2025
        'MMMM DD YYYY',   // September 27 2025
        'DD MMM YYYY',    // 27 Sep 2025 (26 July 2025)
        'DD MMMM YYYY',   // 27 September 2025 (26 July 2025)
        'MM/DD/YYYY',     // 07/26/2025
        'MM/DD',          // 07/26
      ];
      
      console.log(`🔍 Attempting to parse date: "${dateInput}"`);
      let parsedDate;
      
      // Try parsing with explicit formats first
      for (const format of dateFormats) {
        parsedDate = moment(dateInput, format, true); // strict parsing
        console.log(`  - Trying format "${format}": ${parsedDate.isValid() ? parsedDate.format('YYYY-MM-DD') : 'invalid'}`);
        
        if (parsedDate.isValid()) {
          // If no year was provided, assume current year
          const formatsWithoutYear = ['MMM DD', 'MMMM DD', 'DD MMM', 'DD MMMM', 'MM/DD'];
          if (formatsWithoutYear.includes(format)) {
            // Check if the parsed date is in the past, if so, assume next year
            const today = moment();
            if (parsedDate.year() === 2001) { // moment defaults to 2001 for 2-digit years
              parsedDate.year(currentYear);
            }
            
            // If the date has already passed this year, move to next year
            if (parsedDate.isBefore(today, 'day')) {
              parsedDate.add(1, 'year');
              console.log(`📅 Date was in past, moved to next year: ${parsedDate.format('YYYY-MM-DD')}`);
            }
          }
          
          console.log(`✅ Successfully parsed "${dateInput}" as ${parsedDate.format('YYYY-MM-DD')} using format "${format}"`);
          return parsedDate.format('YYYY-MM-DD');
        }
      }
      
      // Special handling for common natural language dates
      const normalizedInput = input.replace(/(\d{1,2})(st|nd|rd|th)/, '$1'); // Remove ordinals
      
      // Try parsing month name + number combinations (both orders)
      // Format: "July 26" or "26 July"
      const monthNamePattern = /^(january|february|march|april|may|june|july|august|september|october|november|december)\s+\d{1,2}$/i;
      const dayMonthPattern = /^\d{1,2}\s+(january|february|march|april|may|june|july|august|september|october|november|december)$/i;
      
      if (monthNamePattern.test(normalizedInput)) {
        parsedDate = moment(normalizedInput, 'MMMM DD', true);
        if (parsedDate.isValid()) {
          parsedDate.year(currentYear);
          
          // If the date has already passed this year, move to next year
          const today = moment();
          if (parsedDate.isBefore(today, 'day')) {
            parsedDate.add(1, 'year');
            console.log(`📅 Date was in past, moved to next year: ${parsedDate.format('YYYY-MM-DD')}`);
          }
          
          console.log(`✅ Successfully parsed "${dateInput}" as ${parsedDate.format('YYYY-MM-DD')} using month-day parsing`);
          return parsedDate.format('YYYY-MM-DD');
        }
      } else if (dayMonthPattern.test(normalizedInput)) {
        parsedDate = moment(normalizedInput, 'DD MMMM', true);
        if (parsedDate.isValid()) {
          parsedDate.year(currentYear);
          
          // If the date has already passed this year, move to next year
          const today = moment();
          if (parsedDate.isBefore(today, 'day')) {
            parsedDate.add(1, 'year');
            console.log(`📅 Date was in past, moved to next year: ${parsedDate.format('YYYY-MM-DD')}`);
          }
          
          console.log(`✅ Successfully parsed "${dateInput}" as ${parsedDate.format('YYYY-MM-DD')} using day-month parsing`);
          return parsedDate.format('YYYY-MM-DD');
        }
      }
      
      console.log(`⚠️ Could not parse date with explicit formats, skipping auto-detection to avoid errors`);
      console.log(`⚠️ Could not normalize date: ${dateInput}`);
      return null; // Return null instead of the input to prevent errors
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