const { Configuration, PipelinesApi } = require('@vectorize-io/vectorize-client');
const OpenAI = require('openai');

class RAGService {
  constructor() {
    // Initialize OpenAI for embeddings
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    // Initialize Vectorize client
    const config = new Configuration({
      accessToken: process.env.VECTORIZE_PIPELINE_ACCESS_TOKEN,
      basePath: 'https://api.vectorize.io/v1'
    });

    this.pipelinesApi = new PipelinesApi(config);
    this.organizationId = process.env.VECTORIZE_ORGANIZATION_ID;
    this.pipelineId = process.env.VECTORIZE_PIPELINE_ID;
  }

  /**
   * Search the vector database for relevant FAQ information
   */
  async searchFAQ(query, topK = 5, threshold = 0.5) { // Lowered threshold from 0.7 to 0.5
    try {
      console.log('🔍 RAG search for:', query);

      // Search using pipeline (handles embedding internally)
      const searchResults = await this.vectorSearch(query, topK);

      // Debug: Log all results with scores
      console.log('🔍 All search results:');
      searchResults.forEach((result, i) => {
        const score = result.relevancy || result.similarity || 0;
        console.log(`  Result ${i+1}: relevancy=${score}, content preview: ${JSON.stringify(result).substring(0, 100)}...`);
      });

      // Filter by relevance threshold
      const relevantResults = searchResults.filter(result => 
        (result.relevancy || result.similarity || 0) >= threshold
      );

      console.log(`📊 Found ${relevantResults.length} relevant results (threshold: ${threshold})`);

      // If no relevant results found, provide fallback
      if (relevantResults.length === 0) {
        console.log('⚠️ No results above threshold, using fallback');
        const fallback = await this.getFallbackResponse(query);
        return {
          success: false,
          query,
          results: [],
          context: 'No relevant results found',
          fallback: fallback
        };
      }

      return {
        success: true,
        query,
        results: relevantResults,
        context: this.formatContext(relevantResults)
      };

    } catch (error) {
      console.error('❌ RAG search failed:', error);
      return {
        success: false,
        error: error.message,
        fallback: await this.getFallbackResponse(query)
      };
    }
  }

  /**
   * Generate embedding using OpenAI
   */
  async generateEmbedding(text) {
    try {
      const response = await this.openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: text,
        encoding_format: 'float'
      });

      return response.data[0].embedding;
    } catch (error) {
      console.error('Error generating embedding:', error);
      throw new Error('Failed to generate query embedding');
    }
  }

  /**
   * Retrieve documents using Vectorize pipeline
   */
  async vectorSearch(query, topK) {
    try {
      const response = await this.pipelinesApi.retrieveDocuments({
        organization: this.organizationId,
        pipeline: this.pipelineId,
        retrieveDocumentsRequest: {
          question: query,
          numResults: topK
        }
      });

      return response.documents || [];
    } catch (error) {
      console.error('Vectorize API Error:', error?.response);
      if (error?.response?.text) {
        const errorText = await error.response.text();
        console.error('Error details:', errorText);
      }
      throw new Error('Failed to retrieve documents from Vectorize');
    }
  }

  /**
   * Format search results into context for AI
   */
  formatContext(results) {
    if (!results || results.length === 0) {
      return 'No specific information found.';
    }

    // Sort by relevancy score if available
    const sortedResults = [...results].sort((a, b) => 
      (b.relevancy || b.similarity || 0) - (a.relevancy || a.similarity || 0)
    );

    let context = 'Relevant restaurant information:\n\n';
    
    sortedResults.forEach((doc, index) => {
      const content = doc.text || 'No content available';
      const source = doc.source_display_name || doc.source || 'General';
      const relevancy = doc.relevancy || doc.similarity || 0;
      
      context += `${index + 1}. ${source} (${Math.round(relevancy * 100)}% relevant):\n${content}\n\n`;
    });

    return context;
  }

  /**
   * Get AI-enhanced response using RAG context
   */
  async getEnhancedResponse(query, searchResults) {
    try {
      const context = this.formatContext(searchResults.results);
      
      const prompt = `You are Rooney, the friendly voice assistant for Sylvie's Kitchen restaurant. 
      
Use the following restaurant information to answer the customer's question naturally and helpfully:

RESTAURANT CONTEXT:
${context}

CUSTOMER QUESTION: ${query}

Instructions:
- Provide a warm, conversational response
- Use the context information to give accurate details
- If the context doesn't fully answer the question, be honest and offer to transfer to staff
- Keep responses concise but complete
- Always maintain the friendly, professional tone of Sylvie's Kitchen

RESPONSE:`;

      const completion = await this.openai.chat.completions.create({
        model: 'gpt-4',
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.7,
        max_tokens: 200
      });

      return {
        success: true,
        response: completion.choices[0].message.content,
        context: context,
        confidence: this.calculateConfidence(searchResults.results)
      };

    } catch (error) {
      console.error('Error generating enhanced response:', error);
      throw new Error('Failed to generate AI response');
    }
  }

  /**
   * Calculate confidence based on search results
   */
  calculateConfidence(results) {
    if (!results || results.length === 0) return 0;
    
    const avgScore = results.reduce((sum, r) => sum + (r.relevancy || r.similarity || 0), 0) / results.length;
    return Math.min(avgScore, 1.0);
  }

  /**
   * Fallback response when RAG fails - Accurate restaurant info as backup
   */
  async getFallbackResponse(query) {
    const queryLower = query.toLowerCase();
    
    // Provide basic accurate information as backup, but encourage RAG/human transfer
    if (queryLower.includes('menu') || queryLower.includes('food') || queryLower.includes('dish')) {
      return "We specialize in Asian Fusion cuisine with dishes like Korean Fried Chicken Wings, Crispy Pork Belly Bao, and Tom Kha Coconut Soup. For our complete menu with current pricing, let me connect you with our team who can share all the delicious details. Would you like me to transfer your call?";
    } else if (queryLower.includes('hour') || queryLower.includes('open') || queryLower.includes('close')) {
      return "I don't have our current hours readily available. Let me connect you with our team who can confirm our operating hours and help with any other questions. Would you like me to transfer your call?";
    } else if (queryLower.includes('location') || queryLower.includes('address') || queryLower.includes('where')) {
      return "We're located in Seattle. For exact address and directions, let me connect you with our team who can help you find us easily. Would you like me to transfer your call?";
    } else if (queryLower.includes('reservation') || queryLower.includes('book') || queryLower.includes('table')) {
      return "I'd be happy to help you with a reservation! What date, time, and party size were you thinking?";
    }
    
    return "I don't have specific information about that in my database right now. Let me connect you with one of our team members who can help you with detailed information. Would you like me to transfer your call?";
  }

  /**
   * Health check for RAG service
   */
  async healthCheck() {
    try {
      // Test OpenAI connection
      const embedTest = await this.generateEmbedding('test query');
      
      // Test vector pipeline connection
      const testResults = await this.searchFAQ('test', 1, 0.1);
      
              return {
          status: 'healthy',
          openai: 'ok',
          vectorPipeline: testResults.success ? 'ok' : 'error',
          organizationId: this.organizationId,
          pipelineId: this.pipelineId,
          timestamp: new Date().toISOString()
        };
    } catch (error) {
      return {
        status: 'unhealthy',
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }
}

module.exports = RAGService; 