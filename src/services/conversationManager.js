const OpenAI = require('openai');
const RAGService = require('./ragService');

class ConversationManager {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });
    
    // Initialize RAG service for FAQ handling
    this.ragService = new RAGService();
    
    // Store active conversations in memory (in production, use Redis)
    this.activeConversations = new Map();
    
    this.systemPrompt = `You are Rooney, a friendly and professional voice assistant for Sylvie's Kitchen, an Asian Fusion restaurant. You help customers with reservations and answer questions about the restaurant.

RESTAURANT DETAILS:
- Name: Sylvie's Kitchen
- Type: Asian Fusion Restaurant  
- Location: Seattle
- Cuisine: Asian Fusion featuring dishes like Korean Fried Chicken Wings, Crispy Pork Belly Bao, Tom Kha Coconut Soup
- Specialties: Taiwanese-style bao, Korean fried chicken, Thai soups, Vietnamese spring rolls, Japanese-inspired dishes
- Phone reservations and inquiries

CORRECT RESERVATION PROCESS (IMPORTANT - Follow this exact order):
1. Get basic reservation details: DATE, TIME, and PARTY SIZE first
2. Once you have these 3 details, the system will automatically check availability
3. If available: Ask for customer name and phone number to complete booking
4. If not available: Offer alternative times within 2 hours for the SAME party size
5. If customer rejects alternatives: Ask if they'd like to try a different date
6. NEVER ask for name/phone until availability is confirmed

SAMPLE CORRECT FLOW:
Customer: "I want a reservation for 4pm tomorrow for 5 people"
You: "Let me check our availability..." 
System: Checks availability for 4pm (restaurant closed)
You: "I'm sorry, we're closed at 4pm. However, I have availability for 5 people at 5:00 PM, 5:30 PM, or 6:00 PM. Would any of these work?"
Customer: "5:30 PM works"
You: "Perfect! Now may I get your name and phone number to complete the reservation?"

CRITICAL RULES:
- NEVER ask for name/phone before confirming an available time slot
- Always suggest alternatives for the SAME party size first
- If no alternatives within 2 hours, ask for different date or party size
- Once time is confirmed available, THEN collect personal details
- Be warm and professional, but follow the process exactly

SAMPLE RESPONSES:
- "I'd be happy to help you with a reservation! What date, time, and party size were you thinking?"
- "Let me check our availability for [party size] people on [date] at [time]..."
- "Great! I have that time available. May I get your name and phone number to complete the reservation?"

CRITICAL: NEVER say specific times are "busy" or "available" without the system checking first. Always let the system verify availability.`;
  }

  async getGreeting() {
    const greetings = [
      "Thank you for calling Sylvie's Kitchen! This is Rooney, your friendly assistant. How may I help you today?",
      "Hello and welcome to Sylvie's Kitchen! I'm Rooney, how may I help you today?",
      "Good day! You've reached Sylvie's Kitchen. I'm Rooney, your virtual assistant. How can I assist you today?"
    ];
    
    return greetings[Math.floor(Math.random() * greetings.length)];
  }

  getConversation(callSid) {
    if (!this.activeConversations.has(callSid)) {
      this.activeConversations.set(callSid, {
        messages: [],
        context: {},
        startTime: new Date(),
        intent: null
      });
    }
    return this.activeConversations.get(callSid);
  }

  async processMessage(userInput, callSid, customerPhone) {
    const conversation = this.getConversation(callSid);
    
    // Add user message to conversation history
    conversation.messages.push({
      role: 'user',
      content: userInput
    });

    try {
      // Call OpenAI for response
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [
          { role: 'system', content: this.systemPrompt },
          ...conversation.messages
        ],
        temperature: 0.7,
        max_tokens: 200
      });

      const assistantResponse = completion.choices[0].message.content;
      
      // Add assistant response to conversation
      conversation.messages.push({
        role: 'assistant', 
        content: assistantResponse
      });

      // Analyze intent and extract information
      const analysis = await this.analyzeIntent(userInput, conversation);
      
      // If this is an FAQ query, enhance with RAG
      let finalResponse = assistantResponse;
      if (analysis.intent === 'faq') {
        console.log('🔍 FAQ intent detected, calling RAG...');
        const ragResponse = await this.handleFAQWithRAG(userInput);
        console.log('📝 RAG response result:', {
          success: ragResponse.success, 
          hasResponse: !!ragResponse.response,
          responseLength: ragResponse.response ? ragResponse.response.length : 0
        });
        if (ragResponse.success && ragResponse.response && ragResponse.response.trim()) {
          finalResponse = ragResponse.response;
          console.log('✅ Using RAG response as final response');
        } else {
          console.log('❌ RAG failed or empty response, using original AI response');
        }
      }
      
      console.log('🎬 Conversation processing complete, returning response');
      
      return {
        message: finalResponse,
        intent: analysis.intent,
        extractedData: analysis.extractedData,
        needsMoreInput: analysis.needsMoreInput,
        followUpQuestion: analysis.followUpQuestion,
        transferToHuman: analysis.transferToHuman,
        conversationComplete: analysis.conversationComplete
      };

    } catch (error) {
      console.error('Error with OpenAI:', error);
      
      return {
        message: "I'm sorry, I'm having some technical difficulties. Let me transfer you to one of our team members who can help you right away.",
        transferToHuman: true
      };
    }
  }

  async analyzeIntent(userInput, conversation) {
    const analysisPrompt = `Analyze this customer message and previous conversation for intent and data extraction.

Customer message: "${userInput}"

Previous context: ${JSON.stringify(conversation.context)}

Determine:
1. Intent: reservation, faq, complaint, transfer, or unclear
2. Extracted data: Any reservation details (date, time, party size, name, phone)
3. Whether more input is needed
4. If human transfer is needed
5. If conversation is complete

IMPORTANT RULES:
- For FAQ questions: ALWAYS set "needsMoreInput": true and provide a helpful followUpQuestion
- For reservation intent: Follow the reservation flow rules
- Never end conversation abruptly - always ask how else you can help

FAQ EXAMPLES:
- Customer asks about hours → Answer + "Is there anything else about our restaurant you'd like to know?"
- Customer asks about menu → Answer + "Would you like to make a reservation to try our cuisine?"
- Customer asks about location → Answer + "Can I help you with directions or a reservation?"

Respond in JSON format:
{
  "intent": "reservation|faq|complaint|transfer|unclear",
  "extractedData": {},
  "needsMoreInput": boolean,
  "followUpQuestion": "string or null",
  "transferToHuman": boolean,
  "conversationComplete": boolean
}`;

    try {
      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: analysisPrompt }],
        temperature: 0.3,
        max_tokens: 300
      });

      const analysis = JSON.parse(completion.choices[0].message.content);
      
      // Update conversation context with extracted data
      if (analysis.extractedData) {
        conversation.context = { ...conversation.context, ...analysis.extractedData };
        conversation.intent = analysis.intent;
      }

      return analysis;

    } catch (error) {
      console.error('Error analyzing intent:', error);
      
      return {
        intent: 'unclear',
        extractedData: {},
        needsMoreInput: true,
        followUpQuestion: "I want to make sure I understand what you need. Could you tell me again how I can help you?",
        transferToHuman: false,
        conversationComplete: false
      };
    }
  }

  async handleFAQWithRAG(userInput) {
    try {
      console.log('🧠 Processing FAQ with RAG:', userInput);
      
      // Preprocess the query to extract core intent and clean up speech patterns
      const cleanedQuery = await this.preprocessQuery(userInput);
      console.log('🔧 Cleaned query:', cleanedQuery);
      
      // Search vector database for relevant information using cleaned query
      const searchResults = await this.ragService.searchFAQ(cleanedQuery);
      
      if (searchResults.success && searchResults.results.length > 0) {
        // Generate AI-enhanced response using RAG context
        const enhancedResponse = await this.ragService.getEnhancedResponse(cleanedQuery, searchResults);
        
        console.log(`✅ RAG response generated (confidence: ${enhancedResponse.confidence})`);
        
        return {
          success: true,
          response: enhancedResponse.response,
          confidence: enhancedResponse.confidence,
          context: enhancedResponse.context
        };
      } else {
        // Fallback to simple response
        const fallback = await this.ragService.getFallbackResponse(cleanedQuery);
        
        return {
          success: true,
          response: fallback,
          confidence: 0.5,
          context: 'fallback'
        };
      }
      
    } catch (error) {
      console.error('Error in RAG FAQ handling:', error);
      return {
        success: false,
        error: error.message
      };
    }
  }

  async preprocessQuery(userInput) {
    try {
      // Use OpenAI to extract the core intent from hesitant/messy speech
      const cleaningPrompt = `Extract the core question from this customer's hesitant speech. Remove filler words, incomplete sentences, and repetitions. Focus on the main intent.

Customer said: "${userInput}"

Convert this to a clear, focused query that would match restaurant information well. 

Examples:
- "Yes, can you tell me what? um, are some of the things you have um, on the dinner menu," → "dinner menu items"
- "What um, what are your hours? like when are you open?" → "restaurant hours"
- "Do you have, um, like, reservations available?" → "reservation availability"
- "Where are you located? like your address?" → "restaurant location"

Return only the cleaned query, nothing else:`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: cleaningPrompt }],
        temperature: 0.3,
        max_tokens: 50
      });

      const cleanedQuery = completion.choices[0].message.content.trim();
      
      // Fallback to original if cleaning failed
      if (!cleanedQuery || cleanedQuery.length < 3) {
        console.log('⚠️ Query cleaning failed, using original input');
        return userInput;
      }
      
      return cleanedQuery;
      
    } catch (error) {
      console.error('Error preprocessing query:', error);
      // Fallback to original input if preprocessing fails
      return userInput;
    }
  }

  endConversation(callSid) {
    if (this.activeConversations.has(callSid)) {
      const conversation = this.activeConversations.get(callSid);
      console.log(`📞 Ending conversation ${callSid}, duration: ${new Date() - conversation.startTime}ms`);
      this.activeConversations.delete(callSid);
    }
  }

  resetConversationContext(callSid) {
    if (this.activeConversations.has(callSid)) {
      const conversation = this.activeConversations.get(callSid);
      console.log(`🔄 Resetting conversation context for ${callSid}`);
      
      // Keep the conversation alive but clear the context for fresh start
      conversation.context = {};
      conversation.intent = null;
      
      // Keep some messages for context but clear reservation-specific data
      const lastFewMessages = conversation.messages.slice(-2); // Keep last 2 messages
      conversation.messages = lastFewMessages;
      
      console.log(`✅ Conversation context reset for ${callSid}`);
    }
  }

  // Get conversation for debugging/monitoring
  getActiveConversations() {
    return Array.from(this.activeConversations.entries()).map(([callSid, conv]) => ({
      callSid,
      intent: conv.intent,
      messageCount: conv.messages.length,
      context: conv.context,
      startTime: conv.startTime
    }));
  }
}

module.exports = ConversationManager; 