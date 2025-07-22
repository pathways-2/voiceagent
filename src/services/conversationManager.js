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

  async getConversation(callSid) {
    if (!this.activeConversations.has(callSid)) {
      console.log(`🆕 Creating new conversation session for ${callSid}`);
      
      // Load restaurant hours from RAG for this session
      const restaurantHours = await this.loadRestaurantHoursFromRAG();
      
      this.activeConversations.set(callSid, {
        messages: [],
        context: {
          restaurantHours: restaurantHours
        },
        startTime: new Date(),
        intent: null
      });
      
      console.log(`📅 Loaded restaurant hours for session ${callSid} from RAG`);
    }
    return this.activeConversations.get(callSid);
  }

  async loadRestaurantHoursFromRAG() {
    try {
      console.log('📖 Loading restaurant hours from RAG database...');
      
      // Query RAG for restaurant hours information
      const hoursQuery = 'restaurant hours operating schedule days open closed';
      const searchResults = await this.ragService.searchFAQ(hoursQuery);
      
      if (searchResults.success && searchResults.results.length > 0) {
        // Parse the hours from RAG results
        const parsedHours = this.parseHoursFromRAGResults(searchResults.results);
        
        console.log('✅ Restaurant hours loaded from RAG:', {
          source: 'RAG Database',
          mondayClosed: parsedHours.monday.status === 'closed',
          daysFound: Object.keys(parsedHours).length
        });
        
        return parsedHours;
      } else {
        console.log('⚠️ No hours found in RAG, using fallback');
        return this.getFallbackHours();
      }
      
    } catch (error) {
      console.error('❌ Failed to load hours from RAG:', error.message);
      return this.getFallbackHours();
    }
  }

  parseHoursFromRAGResults(ragResults) {
    try {
      // Extract text content from RAG results
      let combinedText = '';
      ragResults.forEach(result => {
        if (result.content) {
          combinedText += ' ' + result.content;
        }
      });
      
      console.log('🔍 Parsing hours from RAG content...');
      
      // Parse the hours from the text using patterns (using correct default hours)
      const hoursData = {
        monday: { status: 'closed' },
        tuesday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
        wednesday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
        thursday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
        friday: { open: '17:00', close: '23:00', display: '5:00 PM - 11:00 PM' },
        saturday: { open: '17:00', close: '23:00', display: '5:00 PM - 11:00 PM' },
        sunday: { open: '16:30', close: '21:30', display: '4:30 PM - 9:30 PM' },
        source: 'RAG Database',
        lastUpdated: new Date().toISOString()
      };

      // Try to parse specific hours from RAG content if available
      const text = combinedText.toLowerCase();
      
      // Look for patterns like "tuesday: 5:00 pm - 10:00 pm" or "closed monday"
      const dayPatterns = [
        { day: 'monday', regex: /monday[:\s]*closed|closed[:\s]*monday/i },
        { day: 'tuesday', regex: /tuesday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i },
        { day: 'wednesday', regex: /wednesday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i },
        { day: 'thursday', regex: /thursday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i },
        { day: 'friday', regex: /friday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i },
        { day: 'saturday', regex: /saturday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i },
        { day: 'sunday', regex: /sunday[:\s]*(\d{1,2}:?\d{0,2}\s*(?:am|pm))\s*[-–to]+\s*(\d{1,2}:?\d{0,2}\s*(?:am|pm))/i }
      ];

      // Try to extract specific hours if found in RAG content
      dayPatterns.forEach(pattern => {
        const match = text.match(pattern.regex);
        if (match) {
          if (pattern.day === 'monday' && match[0].includes('closed')) {
            hoursData.monday = { status: 'closed' };
            console.log('📅 Found Monday closed in RAG');
          } else if (match[1] && match[2]) {
            // Convert times to 24-hour format and display format
            const openTime = this.convertTo24Hour(match[1]);
            const closeTime = this.convertTo24Hour(match[2]);
            if (openTime && closeTime) {
              hoursData[pattern.day] = {
                open: openTime,
                close: closeTime,
                display: `${match[1].trim()} - ${match[2].trim()}`
              };
              console.log(`📅 Found ${pattern.day} hours in RAG: ${match[1]} - ${match[2]}`);
            }
          }
        }
      });

      return hoursData;
      
    } catch (error) {
      console.error('❌ Error parsing hours from RAG:', error.message);
      return this.getFallbackHours();
    }
  }

  convertTo24Hour(timeStr) {
    try {
      const time = timeStr.toLowerCase().trim();
      let [hours, minutes] = time.replace(/[^0-9:]/g, '').split(':');
      hours = parseInt(hours);
      minutes = parseInt(minutes || '0');
      
      if (time.includes('pm') && hours !== 12) {
        hours += 12;
      } else if (time.includes('am') && hours === 12) {
        hours = 0;
      }
      
      return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}`;
    } catch (error) {
      return null;
    }
  }

  getFallbackHours() {
    console.log('⚠️ Using fallback hours - RAG query failed');
    
    return {
      monday: { status: 'closed' },
      tuesday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      wednesday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      thursday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      friday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      saturday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      sunday: { open: '17:00', close: '22:00', display: '5:00 PM - 10:00 PM' },
      note: 'Fallback hours - RAG query failed',
      source: 'Fallback',
      lastUpdated: new Date().toISOString()
    };
  }

  // Get restaurant hours for this conversation session
  getSessionHours(callSid) {
    const conversation = this.activeConversations.get(callSid);
    return conversation ? conversation.context.restaurantHours : null;
  }

  async processMessage(userInput, callSid, customerPhone) {
    const conversation = await this.getConversation(callSid);
    
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
      
      // Handle goodbye intent with appropriate farewell message
      let finalResponse = assistantResponse;
      if (analysis.intent === 'goodbye') {
        console.log('👋 Goodbye intent detected, ending conversation');
        finalResponse = "Thank you for calling Sylvie's Kitchen! We look forward to seeing you soon. Have a wonderful day!";
      }
      // If this is an FAQ query, enhance with RAG
      else if (analysis.intent === 'faq') {
        console.log('🔍 FAQ intent detected, calling RAG...');
        const ragResponse = await this.handleFAQWithRAG(userInput, conversation);
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
        conversationComplete: analysis.conversationComplete,
        sessionHours: conversation.context.restaurantHours
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
1. Intent: reservation, faq, complaint, transfer, goodbye, or unclear
2. Extracted data: Any reservation details (date, time, party size, name, phone)
3. Whether more input is needed
4. If human transfer is needed
5. If conversation is complete

IMPORTANT RULES:
- For FAQ questions: ALWAYS set "needsMoreInput": true and provide a helpful followUpQuestion
- For reservation intent: Follow the reservation flow rules
- For GOODBYE intent: Set "conversationComplete": true when customer clearly wants to end the call

GOODBYE/TERMINATION DETECTION:
Set "conversationComplete": true for phrases like:
- "no thanks", "no thank you", "nope", "I'm good", "I'm all set"
- "bye", "goodbye", "see you later", "have a good day"  
- "that's all", "that's it", "nothing else", "I'm done"
- "thanks, that's everything", "perfect, thanks"
- Any clear indication they want to end the call

FAQ EXAMPLES:
- Customer asks about hours → Answer + "Is there anything else about our restaurant you'd like to know?"
- Customer asks about menu → Answer + "Would you like to make a reservation to try our cuisine?"
- Customer asks about location → Answer + "Can I help you with directions or a reservation?"

CONVERSATION FLOW:
- After helping with reservation/FAQ, if customer says they don't need anything else, END the call
- Only continue conversation if customer has additional questions or needs

Respond in JSON format:
{
  "intent": "reservation|faq|complaint|transfer|goodbye|unclear",
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

  async handleFAQWithRAG(userInput, conversation = null) {
    try {
      console.log('🧠 Processing FAQ with RAG:', userInput);
      
      // Check if this is a hours-related query
      const hoursKeywords = ['hours', 'open', 'close', 'time', 'when', 'schedule'];
      const isHoursQuery = hoursKeywords.some(keyword => userInput.toLowerCase().includes(keyword));
      
      if (isHoursQuery && conversation && conversation.context) {
        console.log('🕐 Detected hours query - using session hours data');
        const sessionHours = conversation.context.restaurantHours;
        
        if (sessionHours) {
          const hoursResponse = this.formatHoursResponse(sessionHours);
          return {
            success: true,
            response: hoursResponse,
            confidence: 1.0,
            context: 'session_hours'
          };
        }
      }
      
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

  formatHoursResponse(hoursData) {
    const days = ['monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday', 'sunday'];
    const formattedDays = [];
    
    for (const day of days) {
      const dayHours = hoursData[day];
      if (dayHours.status === 'closed') {
        formattedDays.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: Closed`);
      } else {
        formattedDays.push(`${day.charAt(0).toUpperCase() + day.slice(1)}: ${dayHours.display}`);
      }
    }
    
    return `Here are our current hours:\n\n${formattedDays.join('\n')}\n\n${hoursData.note || ''}\n\nWould you like to make a reservation during our operating hours?`;
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
      
      // Keep the restaurant hours but clear other context
      const restaurantHours = conversation.context.restaurantHours;
      conversation.context = { restaurantHours };
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