const axios = require('axios');
const OpenAI = require('openai');
const { faqKnowledge } = require('../data/faq-knowledge');
require('dotenv').config();

class VectorSeeder {
  constructor() {
    this.openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    this.vectorizeConfig = {
      apiKey: process.env.VECTORIZE_API_KEY,
      indexName: process.env.VECTORIZE_INDEX_NAME || 'sylvies-kitchen-faq',
      baseUrl: process.env.VECTORIZE_BASE_URL || 'https://api.vectorize.io/v1'
    };

    this.headers = {
      'Authorization': `Bearer ${this.vectorizeConfig.apiKey}`,
      'Content-Type': 'application/json'
    };
  }

  async seedDatabase() {
    console.log('🌱 Starting vector database seeding...\n');

    try {
      // Check if index exists, create if not
      await this.ensureIndexExists();

      // Prepare documents for vectorization
      const documents = this.prepareDocuments(faqKnowledge);
      console.log(`📝 Prepared ${documents.length} documents for vectorization`);

      // Process documents in batches
      const batchSize = 10;
      let successCount = 0;
      let errorCount = 0;

      for (let i = 0; i < documents.length; i += batchSize) {
        const batch = documents.slice(i, i + batchSize);
        console.log(`\n📦 Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(documents.length/batchSize)}`);
        
        const results = await this.processBatch(batch);
        successCount += results.success;
        errorCount += results.errors;
        
        // Small delay between batches
        await new Promise(resolve => setTimeout(resolve, 1000));
      }

      console.log(`\n✅ Seeding completed!`);
      console.log(`   • Successful: ${successCount}`);
      console.log(`   • Errors: ${errorCount}`);
      console.log(`   • Total: ${documents.length}`);

    } catch (error) {
      console.error('❌ Seeding failed:', error.message);
      process.exit(1);
    }
  }

  prepareDocuments(knowledge) {
    const documents = [];
    let docId = 1;

    Object.entries(knowledge).forEach(([sectionKey, sectionData]) => {
      if (typeof sectionData === 'object' && sectionData !== null) {
        this.processSection(sectionKey, sectionData, documents, docId);
        docId += Object.keys(sectionData).length;
      }
    });

    return documents;
  }

  processSection(sectionKey, sectionData, documents, startId) {
    Object.entries(sectionData).forEach(([key, value], index) => {
      let content, title;

      if (Array.isArray(value)) {
        // Handle arrays (like menu items)
        content = value.join(', ');
        title = `${sectionKey} - ${key}`;
      } else if (typeof value === 'object') {
        // Handle nested objects
        content = Object.entries(value)
          .map(([k, v]) => `${k}: ${v}`)
          .join('; ');
        title = `${sectionKey} - ${key}`;
      } else {
        // Handle simple strings
        content = value;
        title = `${sectionKey} - ${key}`;
      }

      documents.push({
        id: `sylvies-${startId + index}`,
        content: content,
        metadata: {
          section: sectionKey,
          subsection: key,
          title: title,
          type: 'faq',
          restaurant: 'sylvies-kitchen'
        }
      });
    });
  }

  async processBatch(documents) {
    let successCount = 0;
    let errorCount = 0;

    for (const doc of documents) {
      try {
        // Generate embedding
        const embedding = await this.generateEmbedding(doc.content);
        
        // Upsert to vector database
        await this.upsertVector({
          id: doc.id,
          values: embedding,
          metadata: {
            ...doc.metadata,
            content: doc.content,
            length: doc.content.length
          }
        });

        console.log(`  ✅ ${doc.metadata.title}`);
        successCount++;

      } catch (error) {
        console.log(`  ❌ Failed: ${doc.metadata.title} - ${error.message}`);
        errorCount++;
      }
    }

    return { success: successCount, errors: errorCount };
  }

  async generateEmbedding(text) {
    const response = await this.openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: text,
      encoding_format: 'float'
    });

    return response.data[0].embedding;
  }

  async upsertVector(vector) {
    const payload = {
      vectors: [vector],
      namespace: 'default'
    };

    const response = await axios.post(
      `${this.vectorizeConfig.baseUrl}/indexes/${this.vectorizeConfig.indexName}/upsert`,
      payload,
      { headers: this.headers }
    );

    return response.data;
  }

  async ensureIndexExists() {
    try {
      // Check if index exists
      const response = await axios.get(
        `${this.vectorizeConfig.baseUrl}/indexes/${this.vectorizeConfig.indexName}`,
        { headers: this.headers }
      );

      console.log('✅ Vector index exists:', this.vectorizeConfig.indexName);
    } catch (error) {
      if (error.response?.status === 404) {
        console.log('🔧 Creating vector index...');
        await this.createIndex();
      } else {
        throw error;
      }
    }
  }

  async createIndex() {
    const indexConfig = {
      name: this.vectorizeConfig.indexName,
      dimension: 1536, // text-embedding-3-small dimension
      metric: 'cosine',
      spec: {
        serverless: {
          cloud: 'aws',
          region: 'us-east-1'
        }
      }
    };

    const response = await axios.post(
      `${this.vectorizeConfig.baseUrl}/indexes`,
      indexConfig,
      { headers: this.headers }
    );

    console.log('✅ Vector index created:', response.data.name);
    
    // Wait for index to be ready
    console.log('⏳ Waiting for index to be ready...');
    await new Promise(resolve => setTimeout(resolve, 10000));
  }

  async testSearch() {
    console.log('\n🔍 Testing search functionality...');
    
    try {
      // Generate a test query embedding
      const testQuery = "What are your hours?";
      const queryEmbedding = await this.generateEmbedding(testQuery);

      // Search
      const searchPayload = {
        vector: queryEmbedding,
        topK: 3,
        includeMetadata: true
      };

      const response = await axios.post(
        `${this.vectorizeConfig.baseUrl}/indexes/${this.vectorizeConfig.indexName}/query`,
        searchPayload,
        { headers: this.headers }
      );

      const results = response.data.matches || [];
      console.log(`✅ Search test successful: found ${results.length} results`);
      
      if (results.length > 0) {
        console.log('Top result:', results[0].metadata?.title);
      }

    } catch (error) {
      console.log('❌ Search test failed:', error.message);
    }
  }
}

// Run seeding if called directly
async function main() {
  if (!process.env.VECTORIZE_API_KEY || !process.env.OPENAI_API_KEY) {
    console.error('❌ Missing required environment variables:');
    console.error('   • VECTORIZE_API_KEY');
    console.error('   • OPENAI_API_KEY');
    process.exit(1);
  }

  const seeder = new VectorSeeder();
  await seeder.seedDatabase();
  await seeder.testSearch();
  
  console.log('\n🎉 Vector database ready for RAG queries!');
  process.exit(0);
}

if (require.main === module) {
  main().catch(console.error);
}

module.exports = VectorSeeder; 