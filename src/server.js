const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const rateLimit = require('express-rate-limit');
const bodyParser = require('body-parser');
require('dotenv').config();

const voiceRoutes = require('./routes/voice');
const reservationRoutes = require('./routes/reservations');
const webhookRoutes = require('./routes/webhooks');

const app = express();
const PORT = process.env.PORT || 3000;

// Trust proxy for ngrok and other proxies (but be specific)
app.set('trust proxy', ['127.0.0.1', '::1']);

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting (more permissive for development with ngrok)
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 1000, // Higher limit for development
  trustProxy: false, // Don't rely on proxy headers for rate limiting
  skip: (req) => req.ip === '127.0.0.1' || req.ip === '::1' // Skip rate limiting for localhost
});
app.use(limiter);

// Body parsing middleware
app.use(bodyParser.urlencoded({ extended: false }));
app.use(bodyParser.json());

// Routes
app.use('/voice', voiceRoutes);
app.use('/reservations', reservationRoutes);
app.use('/webhooks', webhookRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.json({ 
    status: 'healthy', 
    service: 'Rooney Voice Agent',
    restaurant: process.env.RESTAURANT_NAME,
    timestamp: new Date().toISOString()
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(500).json({ 
    error: 'Internal server error',
    message: process.env.NODE_ENV === 'development' ? err.message : 'Something went wrong'
  });
});

// 404 handler
app.use('*', (req, res) => {
  res.status(404).json({ error: 'Endpoint not found' });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
  // Don't exit the process, just log the error
});

process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  // Don't exit the process in development
});

// Start server
app.listen(PORT, () => {
  console.log(`🤖 Rooney Voice Agent server running on port ${PORT}`);
  console.log(`🍽️  Serving ${process.env.RESTAURANT_NAME || "Sylvie's Kitchen"}`);
  console.log(`📞 Voice webhook: http://localhost:${PORT}/voice/incoming`);
});

module.exports = app; 