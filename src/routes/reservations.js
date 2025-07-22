const express = require('express');
const ReservationManager = require('../services/reservationManager');
const NotificationService = require('../services/notificationService');
const moment = require('moment');

const router = express.Router();
const reservationManager = new ReservationManager();
const notificationService = new NotificationService();

// Get all reservations for today
router.get('/today', async (req, res) => {
  try {
    const reservations = await reservationManager.getTodaysReservations();
    res.json({
      success: true,
      date: new Date().toISOString().split('T')[0],
      count: reservations.length,
      reservations
    });
  } catch (error) {
    console.error('Error fetching today\'s reservations:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch reservations' 
    });
  }
});

// Check availability
router.post('/check-availability', async (req, res) => {
  try {
    const { date, time, partySize } = req.body;
    
    if (!date || !time || !partySize) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields: date, time, partySize'
      });
    }
    
    const availability = await reservationManager.checkAvailability(date, time, partySize);
    res.json({
      success: true,
      availability
    });
  } catch (error) {
    console.error('Error checking availability:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to check availability' 
    });
  }
});

// Create a new reservation
router.post('/create', async (req, res) => {
  try {
    const {
      customerName,
      customerPhone,
      customerEmail,
      partySize,
      date,
      time,
      specialRequests
    } = req.body;
    
    // Validate required fields
    if (!customerName || !customerPhone || !partySize || !date || !time) {
      return res.status(400).json({
        success: false,
        error: 'Missing required fields'
      });
    }
    
    // Create reservation
    const reservation = await reservationManager.createReservation({
      customerName,
      customerPhone,
      customerEmail,
      partySize: parseInt(partySize),
      date,
      time,
      specialRequests,
      source: 'api'
    });
    
    // Send confirmation
    const confirmationResult = await notificationService.sendConfirmation(
      reservation, 
      customerPhone
    );
    
    res.json({
      success: true,
      reservation,
      confirmation: confirmationResult
    });
    
  } catch (error) {
    console.error('Error creating reservation:', error);
    res.status(500).json({ 
      success: false, 
      error: error.message || 'Failed to create reservation' 
    });
  }
});

// Simple calendar view (HTML page) - MUST come before /:id route
router.get('/calendar', (req, res) => {
  const today = moment().format('YYYY-MM-DD');
  const nextWeek = moment().add(7, 'days').format('YYYY-MM-DD');
  
  const html = `
<!DOCTYPE html>
<html>
<head>
    <title>Sylvie's Kitchen - Reservations Calendar</title>
    <style>
        body { font-family: Arial, sans-serif; margin: 20px; background: #f5f5f5; }
        .header { background: #2c3e50; color: white; padding: 20px; border-radius: 8px; margin-bottom: 20px; }
        .calendar { background: white; padding: 20px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1); }
        .date-section { margin-bottom: 30px; border-bottom: 1px solid #eee; padding-bottom: 20px; }
        .date-header { font-size: 18px; font-weight: bold; color: #2c3e50; margin-bottom: 10px; }
        .reservation { background: #e8f4fd; border-left: 4px solid #3498db; padding: 10px; margin: 5px 0; border-radius: 4px; }
        .no-reservations { color: #7f8c8d; font-style: italic; }
        .stats { background: #ecf0f1; padding: 15px; border-radius: 8px; margin-bottom: 20px; }
        .refresh-btn { background: #3498db; color: white; padding: 10px 20px; border: none; border-radius: 4px; cursor: pointer; }
        .refresh-btn:hover { background: #2980b9; }
    </style>
</head>
<body>
    <div class="header">
        <h1>🍽️ Sylvie's Kitchen - Reservations Calendar</h1>
        <p>Real-time reservation dashboard</p>
    </div>
    
    <div class="stats">
        <p><strong>Today:</strong> ${today} | <strong>View Range:</strong> Next 7 days</p>
        <button class="refresh-btn" onclick="window.location.reload()">🔄 Refresh</button>
        <a href="/reservations/api/all" style="margin-left: 10px; padding: 10px 20px; background: #27ae60; color: white; text-decoration: none; border-radius: 4px;">📊 View JSON Data</a>
    </div>
    
    <div class="calendar" id="calendar">
        <p>Loading reservations...</p>
    </div>

    <script>
        async function loadReservations() {
            try {
                const response = await fetch('/reservations/api/all');
                const data = await response.json();
                
                if (data.success) {
                    displayCalendar(data.reservations);
                } else {
                    document.getElementById('calendar').innerHTML = '<p style="color: red;">Error loading reservations: ' + data.error + '</p>';
                }
            } catch (error) {
                document.getElementById('calendar').innerHTML = '<p style="color: red;">Error: ' + error.message + '</p>';
            }
        }
        
        function displayCalendar(reservations) {
            const calendar = document.getElementById('calendar');
            
            // Group reservations by date
            const groupedReservations = {};
            reservations.forEach(reservation => {
                const date = reservation.reservation_date;
                if (!groupedReservations[date]) {
                    groupedReservations[date] = [];
                }
                groupedReservations[date].push(reservation);
            });
            
            // Generate calendar HTML
            let html = '<h2>📅 Upcoming Reservations (' + reservations.length + ' total)</h2>';
            
            // Show next 7 days
            for (let i = 0; i < 7; i++) {
                const date = new Date();
                date.setDate(date.getDate() + i);
                const dateStr = date.toISOString().split('T')[0];
                const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
                const displayDate = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric', year: 'numeric' });
                
                html += '<div class="date-section">';
                html += '<div class="date-header">' + dayName + ', ' + displayDate + '</div>';
                
                if (groupedReservations[dateStr]) {
                    groupedReservations[dateStr].forEach(reservation => {
                        const time = reservation.reservation_time;
                        const displayTime = new Date('2000-01-01T' + time).toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit', hour12: true });
                        
                        html += '<div class="reservation">';
                        html += '<strong>' + displayTime + '</strong> - ';
                        html += reservation.customer_name + ' (Party of ' + reservation.party_size + ')';
                        if (reservation.customer_phone) {
                            html += ' - ' + reservation.customer_phone;
                        }
                        if (reservation.special_requests) {
                            html += '<br><em>' + reservation.special_requests + '</em>';
                        }
                        html += '</div>';
                    });
                } else {
                    html += '<div class="no-reservations">No reservations for this day</div>';
                }
                
                html += '</div>';
            }
            
            calendar.innerHTML = html;
        }
        
        // Load reservations when page loads
        loadReservations();
        
        // Auto-refresh every 30 seconds
        setInterval(loadReservations, 30000);
    </script>
</body>
</html>`;
  
  res.send(html);
});

// Get a specific reservation
router.get('/:id', async (req, res) => {
  try {
    const reservation = await reservationManager.getReservation(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    res.json({
      success: true,
      reservation
    });
  } catch (error) {
    console.error('Error fetching reservation:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch reservation' 
    });
  }
});

// Send reminder for a reservation
router.post('/:id/remind', async (req, res) => {
  try {
    const reservation = await reservationManager.getReservation(req.params.id);
    
    if (!reservation) {
      return res.status(404).json({
        success: false,
        error: 'Reservation not found'
      });
    }
    
    const result = await notificationService.sendReminder(reservation);
    
    res.json({
      success: true,
      result
    });
  } catch (error) {
    console.error('Error sending reminder:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to send reminder' 
    });
  }
});

// Get reservation statistics
router.get('/stats/summary', async (req, res) => {
  try {
    const totalReservations = await reservationManager.getTotalReservations();
    const todaysReservations = await reservationManager.getTodaysReservations();
    
    res.json({
      success: true,
      stats: {
        totalReservations,
        todaysReservations: todaysReservations.length,
        todaysReservationsList: todaysReservations
      }
    });
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ 
      success: false, 
      error: 'Failed to fetch statistics' 
    });
  }
});

// Get all reservations (API endpoint)
router.get('/api/all', async (req, res) => {
  try {
    const reservations = await reservationManager.getAllReservations();
    res.json({
      success: true,
      count: reservations.length,
      reservations: reservations
    });
  } catch (error) {
    console.error('Error fetching reservations:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get reservations for a specific date
router.get('/api/date/:date', async (req, res) => {
  try {
    const { date } = req.params;
    const reservations = await reservationManager.getReservationsByDate(date);
    res.json({
      success: true,
      date: date,
      count: reservations.length,
      reservations: reservations
    });
  } catch (error) {
    console.error('Error fetching reservations for date:', error);
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});



module.exports = router; 