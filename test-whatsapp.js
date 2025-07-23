require('dotenv').config();
const NotificationService = require('./src/services/notificationService');

async function testWhatsApp() {
  console.log('🧪 Testing WhatsApp Integration\n');

  // Check environment variables
  console.log('🔧 Environment Check:');
  console.log('- USE_WHATSAPP:', process.env.USE_WHATSAPP);
  console.log('- TWILIO_WHATSAPP_NUMBER:', process.env.TWILIO_WHATSAPP_NUMBER);
  console.log('- TWILIO_ACCOUNT_SID:', process.env.TWILIO_ACCOUNT_SID ? '✅ Set' : '❌ Missing');
  console.log('- TWILIO_AUTH_TOKEN:', process.env.TWILIO_AUTH_TOKEN ? '✅ Set' : '❌ Missing');

  if (!process.env.TWILIO_WHATSAPP_NUMBER) {
    console.log('\n❌ TWILIO_WHATSAPP_NUMBER not configured!');
    console.log('Please set it in your .env file like: TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886');
    return;
  }

  const notificationService = new NotificationService();

  // Test reservation data
  const testReservation = {
    id: 'test-wa-' + Date.now(),
    customerName: 'Test Customer',
    customerPhone: '+15122284470', // Replace with your WhatsApp number
    date: '2025-07-26',
    time: '18:00',
    partySize: 2,
    specialRequests: 'Test WhatsApp integration'
  };

  console.log('\n📱 Testing WhatsApp confirmation message...');
  console.log('Target phone:', testReservation.customerPhone);

  try {
    const result = await notificationService.sendSMSConfirmation(
      testReservation, 
      testReservation.customerPhone
    );

    if (result.success) {
      console.log('✅ WhatsApp message sent successfully!');
      console.log('- Message ID:', result.sid);
      console.log('- Type:', result.type);
      console.log('\n📱 Check your WhatsApp for the confirmation message!');
    } else {
      console.log('❌ WhatsApp message failed:', result.error || result.reason);
    }

    // Test reminder message
    console.log('\n🔔 Testing WhatsApp reminder message...');
    const reminderResult = await notificationService.sendReminder(testReservation);
    
    if (reminderResult.success) {
      console.log('✅ WhatsApp reminder sent successfully!');
      console.log('- Message ID:', reminderResult.sid);
      console.log('- Type:', reminderResult.type);
    } else {
      console.log('❌ WhatsApp reminder failed:', reminderResult.error || reminderResult.reason);
    }

  } catch (error) {
    console.error('❌ Test failed:', error.message);
  }

  console.log('\n🎯 WhatsApp test complete!');
}

// Run test if called directly
if (require.main === module) {
  testWhatsApp().catch(console.error);
}

module.exports = testWhatsApp; 