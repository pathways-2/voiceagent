const sqlite3 = require('sqlite3').verbose();
const path = require('path');

const dbPath = process.env.DATABASE_PATH || path.join(__dirname, 'data/reservations.db');

console.log('🔧 Starting database migration...');
console.log('📍 Database path:', dbPath);

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('❌ Error opening database:', err);
    process.exit(1);
  } else {
    console.log('📊 Connected to SQLite database');
    runMigration();
  }
});

function runMigration() {
  // Check if the column already exists
  db.all("PRAGMA table_info(reservations)", (err, rows) => {
    if (err) {
      console.error('❌ Error checking table structure:', err);
      process.exit(1);
    }

    const hasGoogleCalendarColumn = rows.some(row => row.name === 'google_calendar_event_id');
    
    if (hasGoogleCalendarColumn) {
      console.log('✅ google_calendar_event_id column already exists');
      console.log('📊 Migration complete - no changes needed');
      db.close();
      process.exit(0);
    }

    console.log('🔧 Adding google_calendar_event_id column...');
    
    const alterQuery = `
      ALTER TABLE reservations 
      ADD COLUMN google_calendar_event_id TEXT
    `;

    db.run(alterQuery, (err) => {
      if (err) {
        console.error('❌ Error adding column:', err);
        process.exit(1);
      } else {
        console.log('✅ Successfully added google_calendar_event_id column');
        
        // Verify the column was added
        db.all("PRAGMA table_info(reservations)", (err, rows) => {
          if (err) {
            console.error('❌ Error verifying migration:', err);
          } else {
            console.log('📋 Updated table structure:');
            rows.forEach(row => {
              console.log(`   - ${row.name}: ${row.type}`);
            });
          }
          
          console.log('🎉 Database migration completed successfully!');
          db.close();
          process.exit(0);
        });
      }
    });
  });
}

// Handle cleanup on exit
process.on('SIGINT', () => {
  console.log('\n🛑 Migration interrupted');
  db.close();
  process.exit(0);
}); 