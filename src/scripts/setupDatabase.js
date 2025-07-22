const ReservationManager = require('../services/reservationManager');
const path = require('path');
const fs = require('fs');

async function setupDatabase() {
  console.log('🔧 Setting up database...');
  
  try {
    // Create data directory
    const dataDir = path.join(__dirname, '../../data');
    if (!fs.existsSync(dataDir)) {
      fs.mkdirSync(dataDir, { recursive: true });
      console.log('📁 Created data directory');
    }

    // Initialize reservation manager (this will create tables)
    const reservationManager = new ReservationManager();
    
    // Wait a moment for database initialization
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    console.log('✅ Database tables created');
    console.log('📊 Database setup complete!');
    
    // Add some sample data for testing
    console.log('🌱 Adding sample data...');
    
    const sampleReservation = await reservationManager.createReservation({
      customerName: 'John Doe',
      customerPhone: '+1234567890',
      customerEmail: 'john.doe@example.com',
      partySize: 2,
      date: '2024-12-25',
      time: '19:00',
      specialRequests: 'Anniversary dinner',
      source: 'setup_script'
    });
    
    console.log('✅ Sample reservation created:', sampleReservation.id);
    
    reservationManager.close();
    process.exit(0);
    
  } catch (error) {
    console.error('❌ Database setup failed:', error);
    process.exit(1);
  }
}

// Run setup if called directly
if (require.main === module) {
  setupDatabase();
}

module.exports = setupDatabase; 