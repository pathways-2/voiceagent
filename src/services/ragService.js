const { Configuration, PipelinesApi } = require('@vectorize-io/vectorize-client');
const OpenAI = require('openai');
const path = require('path');
const fs = require('fs').promises;
const { globalTimer } = require('../utils/timer');
const { ragQueryCache } = require('../utils/ragQueryCache');

// Model configuration for RAG tasks
const MODEL_CONFIG = {
  ragResponse: 'gpt-4.1-nano'  // Fast and cost-effective for RAG responses
};

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
   * Search FAQ using RAG (with caching for vector search results)
   */
  async searchFAQ(query, topK = 5, threshold = 0.1) { // Lowered threshold to allow more relevant results
    try {
      console.log('🔍 RAG search for:', query);

      // Check cache first
      const cachedResults = await ragQueryCache.getCachedResults(query);
      let searchResults;

      if (cachedResults) {
        // Cache hit - use cached vector search results
        searchResults = cachedResults;
        console.log('🎯 Using cached vector search results');
      } else {
        // Cache miss - perform vector search and cache results
        console.log('🔍 Cache miss - performing vector search');
        searchResults = await globalTimer.timeAsync('Vector-Search', async () => {
          return await this.vectorSearch(query, topK);
        });

        // Cache the results for future use
        await ragQueryCache.cacheResults(query, searchResults);
      }

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
      
Use the following restaurant information to answer the customer's question:

RESTAURANT CONTEXT:
${context}

CUSTOMER QUESTION: ${query}

CRITICAL INSTRUCTIONS:
- Answer in 30-40 words (be concise but complete for voice interface)
- Be direct and helpful
- ALWAYS end with a natural follow-up question to keep the conversation going
- Pick one of the following follow-up questions: "Is there anything else you would like to know?", "Can I help you with anything else?", "What other questions can I answer for you?"
- Do not list multiple items or long descriptions

RESPONSE:`;

      const completion = await globalTimer.timeAsync('OpenAI-RAG-Response-Generation', async () => {
        return await this.openai.chat.completions.create({
          model: MODEL_CONFIG.ragResponse,
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 80
        });
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
    
    // Provide basic information when available, otherwise acknowledge limitation and reset conversation
    if (queryLower.includes('menu') || queryLower.includes('food') || queryLower.includes('dish')) {
      return "We specialize in Asian Fusion cuisine with dishes like Korean Fried Chicken Wings, Crispy Pork Belly Bao, and Tom Kha Coconut Soup. I don't have our complete current menu details available. Is there anything else I can help you with, or would you like to make a reservation?";
    } else if (queryLower.includes('hour') || queryLower.includes('open') || queryLower.includes('close')) {
      return "I don't have our current operating hours readily available. Is there anything else I can help you with, or would you like to make a reservation?";
    } else if (queryLower.includes('location') || queryLower.includes('address') || queryLower.includes('where')) {
      return "We're located in Seattle. I don't have the exact address details available right now. Is there anything else I can help you with, or would you like to make a reservation?";
    } else if (queryLower.includes('reservation') || queryLower.includes('book') || queryLower.includes('table')) {
      return "I would be happy to help you with a reservation! What date, time, and party size were you thinking?";
    }
    
    return "I don't have that information currently. Is there anything else I can help you with, or would you like to make a reservation?";
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