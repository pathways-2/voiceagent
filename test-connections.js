require('dotenv').config();

const RAGService = require('./src/services/ragService');
const OpenAI = require('openai');

async function testConnections() {
  console.log('🔌 Testing API Connections\n');

  // Test 1: OpenAI Connection
  console.log('1️⃣ Testing OpenAI Connection...');
  try {
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY
    });

    const testCompletion = await openai.chat.completions.create({
      model: 'gpt-3.5-turbo',
      messages: [{ role: 'user', content: 'Say hello!' }],
      max_tokens: 10
    });

    console.log('✅ OpenAI API: Connected');
    console.log('   Response:', testCompletion.choices[0].message.content);

    // Test embedding generation
    const embedding = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: 'test query'
    });

    console.log('✅ OpenAI Embeddings: Working');
    console.log('   Embedding dimension:', embedding.data[0].embedding.length);

  } catch (error) {
    console.log('❌ OpenAI Error:', error.message);
  }

  // Test 2: Vectorize Pipeline Connection
  console.log('\n2️⃣ Testing Vectorize.io Pipeline...');
  try {
    const ragService = new RAGService();
    
    // Check configuration
    console.log('📋 Pipeline Config:');
    console.log('   Organization ID:', process.env.VECTORIZE_ORGANIZATION_ID || 'Not set');
    console.log('   Pipeline ID:', process.env.VECTORIZE_PIPELINE_ID || 'Not set');
    console.log('   Access Token:', process.env.VECTORIZE_PIPELINE_ACCESS_TOKEN ? 'Set' : 'Not set');

    // Test pipeline search
    console.log('\n🔍 Testing pipeline search...');
    const searchResult = await ragService.searchFAQ('restaurant hours', 3, 0.3);
    
    if (searchResult.success) {
      console.log('✅ Vectorize Pipeline: Connected');
      console.log('   Found', searchResult.results.length, 'results');
      
      if (searchResult.results.length > 0) {
        console.log('   Top result score:', searchResult.results[0].score);
        console.log('   Sample context:', searchResult.context.substring(0, 100) + '...');
      }
    } else {
      console.log('❌ Vectorize Pipeline: Failed');
      console.log('   Error:', searchResult.error);
      console.log('   Fallback response:', searchResult.fallback);
    }

  } catch (error) {
    console.log('❌ Vectorize Error:', error.message);
    if (error.response) {
      console.log('   Status:', error.response.status);
      console.log('   Data:', JSON.stringify(error.response.data, null, 2));
    }
  }

  // Test 3: RAG Health Check
  console.log('\n3️⃣ RAG Service Health Check...');
  try {
    const ragService = new RAGService();
    const health = await ragService.healthCheck();
    
    console.log('📊 Health Status:', health.status);
    console.log('   OpenAI:', health.openai || 'Not tested');
    console.log('   Vector Pipeline:', health.vectorPipeline || 'Not tested');
    if (health.error) {
      console.log('   Error:', health.error);
    }

  } catch (error) {
    console.log('❌ Health Check Error:', error.message);
  }

  console.log('\n🎯 Connection Test Complete!');
}

// Run tests
testConnections().catch(console.error); 