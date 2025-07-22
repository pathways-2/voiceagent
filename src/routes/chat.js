const express = require('express');
const router = express.Router();
const VoiceProcessor = require('../services/voiceProcessor');
const ConversationManager = require('../services/conversationManager');

const voiceProcessor = new VoiceProcessor();
const conversationManager = new ConversationManager();

// Test chat endpoint
router.post('/message', async (req, res) => {
  try {
    const { message, sessionId } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    // Use sessionId or create a test session ID
    const testSessionId = sessionId || `chat-test-${Date.now()}`;
    const testPhone = '+1234567890'; // Test phone number

    console.log(`💬 Chat message received: "${message}" (Session: ${testSessionId})`);

    // Process the message through the same voice processing logic
    const result = await voiceProcessor.processUserInput(
      message,              // speechText as string
      testPhone,            // customerPhone  
      testSessionId         // callSid
    );

    console.log(`💬 Chat response generated: "${result.message}"`);

    res.json({
      success: true,
      response: result.message,
      intent: result.intent,
      sessionId: testSessionId,
      timestamp: new Date().toISOString()
    });

  } catch (error) {
    console.error('❌ Chat error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to process chat message',
      details: error.message
    });
  }
});

// Reset chat session
router.post('/reset', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    if (sessionId) {
      conversationManager.resetConversationContext(sessionId);
      console.log(`🔄 Chat session reset: ${sessionId}`);
    }

    res.json({
      success: true,
      message: 'Chat session reset successfully'
    });

  } catch (error) {
    console.error('❌ Chat reset error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to reset chat session'
    });
  }
});

// Get conversation history
router.get('/history/:sessionId', async (req, res) => {
  try {
    const { sessionId } = req.params;
    const conversation = conversationManager.conversations.get(sessionId);
    
    res.json({
      success: true,
      sessionId,
      history: conversation?.history || [],
      context: conversation?.context || {}
    });

  } catch (error) {
    console.error('❌ Chat history error:', error);
    res.status(500).json({
      success: false,
      error: 'Failed to get chat history'
    });
  }
});

module.exports = router; 