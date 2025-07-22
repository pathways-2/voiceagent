const express = require('express');
const twilio = require('twilio');
const VoiceResponse = twilio.twiml.VoiceResponse;
const ConversationManager = require('../services/conversationManager');
const VoiceProcessor = require('../services/voiceProcessor');

const router = express.Router();

// Initialize services
const conversationManager = new ConversationManager();
const voiceProcessor = new VoiceProcessor();

// Handle incoming calls
router.post('/incoming', async (req, res) => {
  console.log('📞 Incoming call from:', req.body.From);
  
  const twiml = new VoiceResponse();
  
  try {
    // Initial greeting and gather user input in one flow
    const greeting = await conversationManager.getGreeting();
    
    const gather = twiml.gather({
      input: 'speech',
      action: '/voice/process-speech',
      method: 'POST',
      speechTimeout: 10, // 10 seconds timeout
      language: 'en-US',
      hints: 'reservation, table, booking, menu, hours, wine, dinner, lunch'
    });
    
    // Say greeting inside the gather so it waits for response
    gather.say({
      voice: 'alice',
      language: 'en-US'
    }, greeting);
    
    // Fallback if no input after 10 seconds
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I didn\'t hear anything. Please call back when you\'re ready to speak. Thank you!');
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error handling incoming call:', error);
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I\'m sorry, I\'m having technical difficulties. Please try calling back in a few moments.');
    
    res.type('text/xml');
    res.send(twiml.toString());
  }
});

// Process speech input
router.post('/process-speech', async (req, res) => {
  const { SpeechResult, From, CallSid } = req.body;
  
  console.log('🎤 Speech received:', SpeechResult);
  console.log('📱 From:', From);
  console.log('🆔 Call ID:', CallSid);
  
  const twiml = new VoiceResponse();
  
  try {
    if (!SpeechResult || SpeechResult.trim() === '') {
      // No speech detected
      const gather = twiml.gather({
        input: 'speech',
        action: '/voice/process-speech',
        method: 'POST',
        speechTimeout: 'auto',
        language: 'en-US'
      });
      
      gather.say({
        voice: 'alice',
        language: 'en-US'
      }, 'I didn\'t catch that. Could you please repeat what you need help with?');
      
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
      const finalMessage = response.message || "I'm sorry, I didn't quite understand. Could you please repeat that?";
      
      // Handle different conversation states
      if (response.needsMoreInput) {
        // Continue conversation with gather
        const gather = twiml.gather({
          input: 'speech',
          action: '/voice/process-speech',
          method: 'POST',
          speechTimeout: 10, // 10 seconds for longer responses
          language: 'en-US',
          hints: 'yes, no, seven, nine, tonight, tomorrow, reservation, table, time'
        });
        
        gather.say({
          voice: 'alice',
          language: 'en-US'
        }, finalMessage + (response.followUpQuestion ? ' ' + response.followUpQuestion : ''));
        
        // Fallback if no response to follow-up
        twiml.say({
          voice: 'alice',
          language: 'en-US'
        }, 'I didn\'t hear your response. Please call back when you\'re ready. Thank you!');
        
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
        
        // End with goodbye if it's truly complete
        if (response.conversationComplete) {
          twiml.say({
            voice: 'alice',
            language: 'en-US'
          }, 'Thank you for calling Sylvie\'s Kitchen. Have a wonderful day!');
        } else {
          // Continue conversation with basic gather
          const gather = twiml.gather({
            input: 'speech',
            action: '/voice/process-speech',
            method: 'POST',
            speechTimeout: 10,
            language: 'en-US'
          });
          
          gather.say({
            voice: 'alice',
            language: 'en-US'
          }, 'Is there anything else I can help you with?');
          
          twiml.say({
            voice: 'alice',
            language: 'en-US'
          }, 'Thank you for calling Sylvie\'s Kitchen. Have a wonderful day!');
        }
      }
    }
    
    res.type('text/xml');
    res.send(twiml.toString());
    
  } catch (error) {
    console.error('Error processing speech:', error);
    
    twiml.say({
      voice: 'alice',
      language: 'en-US'
    }, 'I\'m sorry, I\'m having trouble understanding. Let me transfer you to someone who can help.');
    
    // Transfer to human on error
    twiml.dial(process.env.RESTAURANT_PHONE || '+1234567890');
    
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

module.exports = router; 