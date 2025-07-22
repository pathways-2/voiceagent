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
      phone: process.env.RESTAURANT_PHONE || "+1234567890",
      email: process.env.FROM_EMAIL || "reservations@sylvieskitchen.com",
      address: process.env.RESTAURANT_ADDRESS || "123 Main St, Your City, State 12345"
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
      console.log('⚠️ SMS skipped - Twilio not configured');
      return { success: false, reason: 'Twilio not configured' };
    }

    try {
      const message = this.createSMSMessage(reservation);
      
      const result = await this.twilioClient.messages.create({
        body: message,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: customerPhone
      });
      
      console.log('✅ SMS sent:', result.sid);
      return { success: true, sid: result.sid };
      
    } catch (error) {
      console.error('❌ SMS failed:', error);
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
    return `🍽️ Reservation Confirmed at ${this.restaurantInfo.name}

📅 Date: ${reservation.date}
🕒 Time: ${reservation.time}
👥 Party Size: ${reservation.partySize}
👤 Name: ${reservation.customerName}

📍 ${this.restaurantInfo.address}
📞 Call us: ${this.restaurantInfo.phone}

Thank you for choosing ${this.restaurantInfo.name}! We look forward to serving you.`;
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
      console.log('⚠️ Reminder SMS skipped - Twilio not configured');
      return { success: false, reason: 'Twilio not configured' };
    }

    // Send 24-hour reminder
    const reminderMessage = `🔔 Reminder: You have a reservation tomorrow at ${this.restaurantInfo.name}

📅 ${reservation.date} at ${reservation.time}
👥 Party of ${reservation.partySize}

Looking forward to seeing you!
📞 ${this.restaurantInfo.phone}`;

    try {
      const result = await this.twilioClient.messages.create({
        body: reminderMessage,
        from: process.env.TWILIO_PHONE_NUMBER,
        to: reservation.customerPhone
      });
      
      return { success: true, sid: result.sid };
    } catch (error) {
      console.error('Error sending reminder:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = NotificationService; 