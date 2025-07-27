const express = require('express');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const ConversationManager = require('../services/conversationManager');
const VoiceProcessor = require('../services/voiceProcessor');
const { globalTimer } = require('../utils/timer');
const { restaurantHoursCache } = require('../utils/restaurantHoursCache');
const { ragQueryCache } = require('../utils/ragQueryCache');

const router = express.Router();

// Initialize services
const conversationManager = new ConversationManager();
const voiceProcessor = new VoiceProcessor();

// Handle incoming calls
router.post('/incoming', async (req, res) => {
  console.log('📞 Incoming call from:', req.body.From);
  console.log('🕒 Call started at:', new Date().toISOString());
  
  const twiml = new VoiceResponse();
  
  try {
    // Initial greeting and gather user input in one flow
    const greeting = await conversationManager.getGreeting();
    
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/process-speech',
      method: 'POST',
      speechTimeout: 'auto', // Auto-detect end of speech
      speechModel: 'phone_call', // Optimized for phone calls
      language: 'en-US',
      hints: 'reservation, table, booking, menu, hours, wine, dinner, lunch'
    });
    
    // Say greeting inside the gather so it waits for response
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, greeting);
    
    // Redirect to retry handler if no input
    twiml.redirect('/voice/retry?attempt=1&context=greeting');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am sorry, I am having technical difficulties. Please try calling back in a few moments.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Process speech input
router.post('/process-speech', async (req, res) => {
  // 🆕 WEBHOOK ARRIVAL TIMING - This captures Twilio STT + delivery delay
  const webhookArrivalTime = Date.now();
  console.log('🕒 Webhook arrived at server:', new Date(webhookArrivalTime).toISOString());
  
  const { SpeechResult, From, CallSid } = req.body;
  
  console.log('🎤 Speech received:', SpeechResult);
  console.log('📱 From:', From);
  console.log('🆔 Call ID:', CallSid);
  
  const routeTimer = `Twilio-Route-${CallSid}`;
  globalTimer.start(routeTimer);
  
  const twiml = new VoiceResponse();
  
  try {
    if (!SpeechResult || SpeechResult.trim() === '') {
      // No speech detected
      const gather = twiml.gather({
        input: 'speech',
        action: '/voice/process-speech',
        method: 'POST',
        speechTimeout: 'auto',
        speechModel: 'phone_call',
        language: 'en-US'
      });
      
      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I did not catch that. Could you please repeat what you need help with?');
      
      twiml.say('Thank you for calling. Goodbye!');
      
    } else {
      // Process the speech with AI
      console.log('🔄 Starting voice processing...');
      const response = await voiceProcessor.processUserInput(
        SpeechResult, 
        From, 
        CallSid
      );
      
      console.log('📤 Sending response to Twilio:', {
        messageLength: response.message ? response.message.length : 0,
        messagePreview: response.message ? response.message.substring(0, 50) + '...' : 'NO MESSAGE',
        intent: response.intent
      });
      
      // Ensure we have a valid response message
      let finalMessage = response.message || "I am sorry, I did not quite understand. Could you please repeat that?";
      
      // Sanitize message for TwiML - remove problematic characters
      finalMessage = finalMessage
        .replace(/[<>&"'`]/g, '') // Remove XML-problematic characters including apostrophes
        .replace(/'/g, '')        // Remove smart quotes
        .replace(/"/g, '')        // Remove smart quotes  
        .replace(/–/g, "-")       // Replace en-dash with regular dash
        .replace(/—/g, "-")       // Replace em-dash with regular dash
        .replace(/\\/g, '')       // Remove backslashes
        .replace(/[\u2019\u2018]/g, '') // Remove smart apostrophes (Unicode)
        .replace(/[\u201C\u201D]/g, '') // Remove smart quotes (Unicode)
        .replace(/[\u2013\u2014]/g, '-') // Replace em/en dashes (Unicode)
        .replace(/&/g, 'and')     // Replace ampersand with 'and'
        .trim();                  // Remove leading/trailing whitespace
      
      console.log('🧹 Sanitized message for TwiML:', {
        original: response.message ? response.message.substring(0, 100) + '...' : 'NO MESSAGE',
        sanitized: finalMessage.substring(0, 100) + '...',
        originalLength: response.message ? response.message.length : 0,
        sanitizedLength: finalMessage.length
      });
      
      console.log('📢 FULL MESSAGE BEING SENT TO TWILIO:', finalMessage);
      
      // Handle different conversation states
      if (response.needsMoreInput) {
        // Continue conversation with gather
        const gather = twiml.gather({
          input: 'speech',
          action: '/voice/process-speech',
          method: 'POST',
          speechTimeout: 'auto', // Auto-detect end of speech
          speechModel: 'phone_call',
          language: 'en-US',
          hints: 'yes, no, seven, nine, tonight, tomorrow, reservation, table, time'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, finalMessage);
        
        // Fallback if no response to follow-up
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'I did not hear your response. Please call back when you are ready. Thank you!');
        
      } else if (response.transferToHuman) {
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, finalMessage + ' Let me transfer you to one of our team members. Please hold on.');
        
        // You would implement actual transfer logic here
        twiml.dial(process.env.RESTAURANT_PHONE || '+1234567890');
        
      } else {
        // Conversation complete - speak final message
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, finalMessage);
        
        // Continue conversation if not complete
        if (!response.conversationComplete) {
          // Continue conversation with basic gather
          const gather = twiml.gather({
            input: 'speech',
            action: '/voice/process-speech',
            method: 'POST',
            speechTimeout: 'auto',
            speechModel: 'phone_call',
            language: 'en-US'
          });
          
          gather.say({
            voice: 'alice',
            language: 'en-US'
          }, 'Is there anything else I can help you with?');
          
          twiml.say({
            voice: 'alice',
            language: 'en-US'
          }, 'Thank you for calling Sylvies Kitchen. Have a wonderful day!');
        }
      }
    }
    
    globalTimer.end(routeTimer);
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing speech:', error);
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am sorry, I am having trouble understanding. Let me transfer you to someone who can help.');
    
    // Transfer to human on error
    twiml.dial(process.env.RESTAURANT_PHONE || '+1234567890');
    
    globalTimer.end(routeTimer);
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Handle call completion
router.post('/call-complete', (req, res) => {
  const { CallSid, CallStatus, CallDuration } = req.body;
  
  console.log('📞 Call completed:', {
    callSid: CallSid,
    status: CallStatus,
    duration: CallDuration
  });
  
  // Clean up conversation state
  conversationManager.endConversation(CallSid);
  
  res.status(200).send('OK');
});

// Test RAG system
router.get('/test-rag/:query?', async (req, res) => {
  const testQuery = req.params.query || 'What are your hours?';
  
  try {
    const ragResponse = await conversationManager.handleFAQWithRAG(testQuery);
    
    res.json({
      success: true,
      testQuery,
      response: ragResponse
    });
  } catch (error) {
    res.status(500).json({
      success: false,
      error: error.message
    });
  }
});

// Get conversation stats
router.get('/stats', (req, res) => {
  const stats = voiceProcessor.getStats();
  res.json(stats);
});

// Handle retry when user doesn't respond
router.post('/retry', async (req, res) => {
  try {
    const twiml = new twilio.twiml.VoiceResponse();
    const attempt = parseInt(req.query.attempt) || 1;
    const context = req.query.context || 'greeting';
    const maxAttempts = 2; // Give user 2 chances total
    
    console.log(`🔄 Retry attempt ${attempt} for context: ${context}`);
    
    if (attempt >= maxAttempts) {
      // Final attempt - polite goodbye
      twiml.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I am having trouble hearing you today. Please feel free to call back anytime. Thank you for calling Sylvies Kitchen!');
      twiml.hangup();
    } else {
      // Give user another chance with encouraging message
      const gather = twiml.gather({
        input: 'speech',
        action: '/voice/process-speech',
        method: 'POST',
        speechTimeout: 'auto', // Auto-detect end of speech
        speechModel: 'phone_call',
        language: 'en-US',
        hints: 'reservation, table, booking, menu, hours, wine, dinner, lunch, help'
      });
      
      // Context-specific retry messages
      let retryMessage;
      if (context === 'greeting') {
        retryMessage = 'I am sorry, I did not catch that. How may I help you today? You can ask about reservations, our menu, or hours.';
      } else {
        retryMessage = 'I am sorry, I did not hear your response. Could you please repeat that for me?';
      }
      
      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, retryMessage);
      
      // Add pause to prevent feedback
      gather.pause({ length: 1 });
      
      // If still no response, try one more time or give up
      twiml.redirect(`/voice/retry?attempt=${attempt + 1}&context=${context}`);
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('❌ Error in retry handler:', error);
    const twiml = new twilio.twiml.VoiceResponse();
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I am experiencing technical difficulties. Please call back later. Thank you!');
    twiml.hangup();
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Cache management endpoints for debugging/admin
router.post('/cache/invalidate', async (req, res) => {
  try {
    const result = await restaurantHoursCache.invalidateCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/cache/status', async (req, res) => {
  try {
    const status = await restaurantHoursCache.getCacheStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

// RAG Query Cache management endpoints
router.post('/rag-cache/invalidate', async (req, res) => {
  try {
    const result = await ragQueryCache.invalidateCache();
    res.json(result);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

router.get('/rag-cache/status', async (req, res) => {
  try {
    const status = await ragQueryCache.getCacheStatus();
    res.json(status);
  } catch (error) {
    res.status(500).json({ success: false, error: error.message });
  }
});

module.exports = router; 