const twilio = require('twilio');
const sgMail = require('@sendgrid/mail');

class NotificationService {
  constructor() {
    // Initialize Twilio only if real credentials are available (not placeholders)
    const hasTwilioCredentials = process.env.TWILIO_ACCOUNT_SID && 
                                 process.env.TWILIO_AUTH_TOKEN &&
                                 process.env.TWILIO_ACCOUNT_SID.startsWith('AC') &&
                                 !process.env.TWILIO_ACCOUNT_SID.includes('your_twilio');
    
    if (hasTwilioCredentials) {
      this.twilioClient = twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
      console.log('✅ Twilio client initialized');
    } else {
      console.log('⚠️ Twilio credentials not configured - SMS notifications disabled');
      this.twilioClient = null;
    }
    
    // Initialize SendGrid
    if (process.env.SENDGRID_API_KEY) {
      sgMail.setApiKey(process.env.SENDGRID_API_KEY);
    }
    
    this.restaurantInfo = {
      name: process.env.RESTAURANT_NAME || "Sylvie's Kitchen",
      phone: process.env.RESTAURANT_PHONE || "+14256003548",
      email: process.env.FROM_EMAIL || "reservations@sylvieskitchen.com",
      address: process.env.RESTAURANT_ADDRESS || "1247 Pine Street, Seattle, WA 98101"
    };
  }

  async sendConfirmation(reservation, customerPhone) {
    const results = {};
    
    try {
      // Send SMS confirmation
      results.sms = await this.sendSMSConfirmation(reservation, customerPhone);
      
      // Send email confirmation if email provided
      if (reservation.customerEmail) {
        results.email = await this.sendEmailConfirmation(reservation);
      }
      
      console.log('📱 Confirmation sent:', results);
      return results;
      
    } catch (error) {
      console.error('Error sending confirmation:', error);
      throw error;
    }
  }

  async sendSMSConfirmation(reservation, customerPhone) {
    if (!this.twilioClient) {
      console.log('⚠️ Message skipped - Twilio not configured');
      return { success: false, reason: 'Twilio not configured' };
    }

    try {
      const useWhatsApp = process.env.USE_WHATSAPP === 'true';
      const message = useWhatsApp ? this.createWhatsAppMessage(reservation) : this.createSMSMessage(reservation);
      const fromNumber = useWhatsApp ? process.env.TWILIO_WHATSAPP_NUMBER : process.env.TWILIO_PHONE_NUMBER;
      const toNumber = useWhatsApp ? this.formatWhatsAppNumber(customerPhone) : customerPhone;
      const messageType = useWhatsApp ? 'WhatsApp' : 'SMS';
      
      console.log(`📱 ${messageType} Message Content:`, message);
      console.log(`📱 Sending ${messageType} to:`, toNumber);
      
      const result = await this.twilioClient.messages.create({
        body: message,
        from: fromNumber,
        to: toNumber
      });
      
      console.log(`✅ ${messageType} sent:`, result.sid);
      return { success: true, sid: result.sid, type: messageType };
      
    } catch (error) {
      const messageType = process.env.USE_WHATSAPP === 'true' ? 'WhatsApp' : 'SMS';
      console.error(`❌ ${messageType} failed:`, error);
      return { success: false, error: error.message };
    }
  }

  async sendEmailConfirmation(reservation) {
    if (!process.env.SENDGRID_API_KEY) {
      console.log('📧 SendGrid not configured, skipping email');
      return { success: false, reason: 'SendGrid not configured' };
    }

    try {
      const emailContent = this.createEmailContent(reservation);
      
      const msg = {
        to: reservation.customerEmail,
        from: this.restaurantInfo.email,
        subject: `Reservation Confirmation - ${this.restaurantInfo.name}`,
        text: emailContent.text,
        html: emailContent.html
      };
      
      const result = await sgMail.send(msg);
      console.log('✅ Email sent:', result[0].statusCode);
      return { success: true, statusCode: result[0].statusCode };
      
    } catch (error) {
      console.error('❌ Email failed:', error);
      return { success: false, error: error.message };
    }
  }

  createSMSMessage(reservation) {
    // Convert 24-hour time to 12-hour format for display
    const time24 = reservation.time;
    const timeMoment = require('moment')(time24, 'HH:mm');
    const time12 = timeMoment.format('h:mm A');
    
    // Format date to readable format (e.g., "Aug 10, 2025")
    const dateMoment = require('moment')(reservation.date);
    const readableDate = dateMoment.format('MMM D, YYYY');
    
    return `Reservation confirmed: ${reservation.customerName} for ${reservation.partySize} at ${time12} on ${readableDate} at ${this.restaurantInfo.name}.`;
  }

  createWhatsAppMessage(reservation) {
    // Convert 24-hour time to 12-hour format for display
    const time24 = reservation.time;
    const timeMoment = require('moment')(time24, 'HH:mm');
    const time12 = timeMoment.format('h:mm A');
    
    // Format date to readable format (e.g., "Saturday, Aug 10, 2025")
    const dateMoment = require('moment')(reservation.date);
    const readableDate = dateMoment.format('dddd, MMM D, YYYY');
    
    return `🍽️ *Reservation Confirmed!*

👋 Hi ${reservation.customerName}!

Your table is booked at *${this.restaurantInfo.name}*

📅 *Date:* ${readableDate}
🕰️ *Time:* ${time12}
👥 *Party Size:* ${reservation.partySize} ${reservation.partySize === 1 ? 'person' : 'people'}
📍 *Location:* ${this.restaurantInfo.address}

We're excited to welcome you for an amazing dining experience! 

📞 Questions? Call us: ${this.restaurantInfo.phone}

See you soon! 🌟`;
  }

  formatWhatsAppNumber(phoneNumber) {
    // Remove any existing whatsapp: prefix
    let cleanNumber = phoneNumber.replace(/^whatsapp:/, '');
    
    // Remove all non-digit characters except +
    cleanNumber = cleanNumber.replace(/[^\d+]/g, '');
    
    // Add country code if missing (assume US +1 if not provided)
    if (!cleanNumber.startsWith('+')) {
      if (cleanNumber.length === 10) {
        cleanNumber = '+1' + cleanNumber;
      } else if (cleanNumber.length === 11 && cleanNumber.startsWith('1')) {
        cleanNumber = '+' + cleanNumber;
      } else {
        cleanNumber = '+1' + cleanNumber;
      }
    }
    
    return 'whatsapp:' + cleanNumber;
  }

  createEmailContent(reservation) {
    const text = `
Reservation Confirmation - ${this.restaurantInfo.name}

Dear ${reservation.customerName},

Your reservation has been confirmed! Here are the details:

Date: ${reservation.date}
Time: ${reservation.time}
Party Size: ${reservation.partySize} people
Reservation ID: ${reservation.id}

Restaurant Information:
${this.restaurantInfo.name}
${this.restaurantInfo.address}
Phone: ${this.restaurantInfo.phone}

We're excited to welcome you to ${this.restaurantInfo.name}! Our team is preparing to provide you with an exceptional dining experience featuring our authentic Italian cuisine and carefully selected wine collection.

If you need to modify or cancel your reservation, please call us at ${this.restaurantInfo.phone} at least 2 hours before your reservation time.

Thank you for choosing ${this.restaurantInfo.name}!

Buon Appetito!
The ${this.restaurantInfo.name} Team
    `;

    const html = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: #8B4513; color: white; padding: 20px; text-align: center; }
        .content { padding: 20px; background: #f9f9f9; }
        .reservation-details { background: white; padding: 15px; border-left: 4px solid #8B4513; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; font-size: 12px; color: #666; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🍽️ ${this.restaurantInfo.name}</h1>
            <h2>Reservation Confirmation</h2>
        </div>
        
        <div class="content">
            <p>Dear ${reservation.customerName},</p>
            
            <p>Your reservation has been confirmed! Here are the details:</p>
            
            <div class="reservation-details">
                <h3>📅 Reservation Details</h3>
                <p><strong>Date:</strong> ${reservation.date}</p>
                <p><strong>Time:</strong> ${reservation.time}</p>
                <p><strong>Party Size:</strong> ${reservation.partySize} people</p>
                <p><strong>Reservation ID:</strong> ${reservation.id}</p>
            </div>
            
            <h3>📍 Restaurant Information</h3>
            <p>
                <strong>${this.restaurantInfo.name}</strong><br>
                ${this.restaurantInfo.address}<br>
                📞 ${this.restaurantInfo.phone}
            </p>
            
            <p>We're excited to welcome you to ${this.restaurantInfo.name}! Our team is preparing to provide you with an exceptional dining experience featuring our authentic Italian cuisine and carefully selected wine collection.</p>
            
            <p><em>If you need to modify or cancel your reservation, please call us at ${this.restaurantInfo.phone} at least 2 hours before your reservation time.</em></p>
        </div>
        
        <div class="footer">
            <p>Thank you for choosing ${this.restaurantInfo.name}!</p>
            <p>🍷 Buon Appetito! 🍝</p>
        </div>
    </div>
</body>
</html>
    `;

    return { text, html };
  }

  async sendReminder(reservation) {
    if (!this.twilioClient) {
      console.log('⚠️ Reminder message skipped - Twilio not configured');
      return { success: false, reason: 'Twilio not configured' };
    }

    try {
      const useWhatsApp = process.env.USE_WHATSAPP === 'true';
      const reminderMessage = useWhatsApp ? this.createWhatsAppReminder(reservation) : this.createSMSReminder(reservation);
      const fromNumber = useWhatsApp ? process.env.TWILIO_WHATSAPP_NUMBER : process.env.TWILIO_PHONE_NUMBER;
      const toNumber = useWhatsApp ? this.formatWhatsAppNumber(reservation.customerPhone) : reservation.customerPhone;
      const messageType = useWhatsApp ? 'WhatsApp' : 'SMS';

      console.log(`🔔 Sending ${messageType} reminder to:`, toNumber);

      const result = await this.twilioClient.messages.create({
        body: reminderMessage,
        from: fromNumber,
        to: toNumber
      });
      
      console.log(`✅ ${messageType} reminder sent:`, result.sid);
      return { success: true, sid: result.sid, type: messageType };
    } catch (error) {
      const messageType = process.env.USE_WHATSAPP === 'true' ? 'WhatsApp' : 'SMS';
      console.error(`❌ ${messageType} reminder failed:`, error);
      return { success: false, error: error.message };
    }
  }

  createSMSReminder(reservation) {
    return `🔔 Reminder: You have a reservation tomorrow at ${this.restaurantInfo.name}

📅 ${reservation.date} at ${reservation.time}
👥 Party of ${reservation.partySize}

Looking forward to seeing you!
📞 ${this.restaurantInfo.phone}`;
  }

  createWhatsAppReminder(reservation) {
    const time24 = reservation.time;
    const timeMoment = require('moment')(time24, 'HH:mm');
    const time12 = timeMoment.format('h:mm A');
    
    const dateMoment = require('moment')(reservation.date);
    const readableDate = dateMoment.format('dddd, MMM D, YYYY');

    return `🔔 *Reservation Reminder*

Hi ${reservation.customerName}! 👋

Don't forget about your reservation *tomorrow* at *${this.restaurantInfo.name}*

📅 *Date:* ${readableDate}
🕰️ *Time:* ${time12}
👥 *Party Size:* ${reservation.partySize} ${reservation.partySize === 1 ? 'person' : 'people'}

We're looking forward to welcoming you! 🍽️

📞 Need to make changes? Call us: ${this.restaurantInfo.phone}

See you tomorrow! ✨`;
  }
}

module.exports = NotificationService; 