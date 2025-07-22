require('dotenv').config();

const ConversationManager = require('./src/services/conversationManager');
const ReservationManager = require('./src/services/reservationManager');
const NotificationService = require('./src/services/notificationService');
const RAGService = require('./src/services/ragService');
const { searchFAQ } = require('./src/data/faq-knowledge');

async function testSystem() {
  console.log('🧪 Testing Rooney Voice Agent System\n');

  // Test 1: FAQ Knowledge Search
  console.log('1️⃣ Testing FAQ Knowledge Base...');
  try {
    const wineResults = searchFAQ('wine selection');
    console.log('✅ Wine query results:', wineResults.length > 0 ? 'Found relevant info' : 'No results');
    
    const hoursResults = searchFAQ('what time open');
    console.log('✅ Hours query results:', hoursResults.length > 0 ? 'Found relevant info' : 'No results');
  } catch (error) {
    console.log('❌ FAQ search failed:', error.message);
  }

  // Test 2: Database Connection
  console.log('\n2️⃣ Testing Database Connection...');
  try {
    const reservationManager = new ReservationManager();
    await new Promise(resolve => setTimeout(resolve, 1000)); // Wait for DB init
    
    const total = await reservationManager.getTotalReservations();
    console.log('✅ Database connected, total reservations:', total);
    
    reservationManager.close();
  } catch (error) {
    console.log('❌ Database test failed:', error.message);
  }

  // Test 3: Availability Check
  console.log('\n3️⃣ Testing Availability Check...');
  try {
    const reservationManager = new ReservationManager();
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    const availability = await reservationManager.checkAvailability('2024-12-25', '19:00', 4);
    console.log('✅ Availability check result:', availability.available ? 'Available' : 'Not available');
    
    reservationManager.close();
  } catch (error) {
    console.log('❌ Availability check failed:', error.message);
  }

  // Test 4: Conversation Manager (requires OpenAI key)
  console.log('\n4️⃣ Testing Conversation AI...');
  if (process.env.OPENAI_API_KEY) {
    try {
      const conversationManager = new ConversationManager();
      const greeting = await conversationManager.getGreeting();
      console.log('✅ AI greeting generated:', greeting.substring(0, 50) + '...');
    } catch (error) {
      console.log('❌ Conversation AI failed:', error.message);
    }
  } else {
    console.log('⚠️ Skipping AI test - OPENAI_API_KEY not configured');
  }

  // Test 5: RAG Service (requires Vectorize.io and OpenAI keys)
  console.log('\n5️⃣ Testing RAG Service...');
  if (process.env.VECTORIZE_PIPELINE_ACCESS_TOKEN && process.env.OPENAI_API_KEY) {
    try {
      const ragService = new RAGService();
      const healthCheck = await ragService.healthCheck();
      console.log('✅ RAG service status:', healthCheck.status);
      
      // Test a simple FAQ search
      const searchResult = await ragService.searchFAQ('wine selection', 3, 0.1);
      console.log('✅ FAQ search:', searchResult.success ? 'Success' : 'Failed');
    } catch (error) {
      console.log('❌ RAG service failed:', error.message);
    }
  } else {
    console.log('⚠️ Skipping RAG test - Vectorize.io or OpenAI credentials not configured');
  }

  // Test 6: Notification Service (requires Twilio keys)
  console.log('\n6️⃣ Testing Notification Service...');
  if (process.env.TWILIO_ACCOUNT_SID && process.env.TWILIO_AUTH_TOKEN) {
    try {
      const notificationService = new NotificationService();
      const testReservation = {
        id: 'test-123',
        customerName: 'Test Customer',
        date: '2024-12-25',
        time: '19:00',
        partySize: 2
      };
      
      const smsMessage = notificationService.createSMSMessage(testReservation);
      console.log('✅ SMS message generated:', smsMessage.length > 0 ? 'Success' : 'Failed');
    } catch (error) {
      console.log('❌ Notification service failed:', error.message);
    }
  } else {
    console.log('⚠️ Skipping notification test - Twilio credentials not configured');
  }

  console.log('\n🎉 System test completed!');
  console.log('\n📝 Next Steps:');
  console.log('   1. Configure your API keys in .env file');
  console.log('   2. Run: npm start');
  console.log('   3. Configure Twilio webhook: https://your-domain.com/voice/incoming');
  console.log('   4. Test with a phone call!');
}

// Run tests
testSystem().catch(console.error); 