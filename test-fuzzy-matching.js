const { RAGQueryCache } = require('./src/utils/ragQueryCache');

// Create a test instance
const testCache = new RAGQueryCache();

console.log('🧪 Testing Fuzzy String Matching Logic\n');

// Test similarity calculations
const testPairs = [
  ['kids menu', 'kid menu options'],
  ['kids menu', 'children menu'],
  ['parking availability', 'Is parking available?'],
  ['dress code', 'what is the dress code'],
  ['gluten free options', 'gluten-free menu'],
  ['seating options', 'seating availability'],
  ['high chair', 'highchair availability'],
  ['completely different', 'kids menu']
];

console.log('📊 Similarity Score Tests:');
console.log('=' .repeat(60));

testPairs.forEach(([str1, str2]) => {
  const similarity = testCache.calculateSimilarity(str1, str2);
  const willMatch = similarity >= testCache.fuzzyThreshold;
  
  console.log(`"${str1}" ↔ "${str2}"`);
  console.log(`  Similarity: ${similarity.toFixed(3)} ${willMatch ? '✅ MATCH' : '❌ NO MATCH'}`);
  console.log(`  Distance: ${testCache.levenshteinDistance(str1.toLowerCase(), str2.toLowerCase())}`);
  console.log('');
});

// Test fuzzy matching with mock cache data
console.log('\n🎯 Fuzzy Match Testing with Mock Cache:');
console.log('=' .repeat(60));

const mockCache = {
  queries: {
    'kids menu': { 
      results: [{ content: 'We have chicken nuggets, mac and cheese...' }],
      timestamp: Date.now() 
    },
    'parking availability': { 
      results: [{ content: 'Free parking is available in our lot...' }],
      timestamp: Date.now() 
    },
    'dress code': { 
      results: [{ content: 'We have a smart casual dress code...' }],
      timestamp: Date.now() 
    },
    'gluten free options': { 
      results: [{ content: 'We offer several gluten-free dishes...' }],
      timestamp: Date.now() 
    }
  }
};

const testQueries = [
  'kid menu options',           // Should match 'kids menu'
  'children menu',              // Should match 'kids menu'  
  'is parking available',       // Should match 'parking availability'
  'what is the dress code',     // Should match 'dress code'
  'gluten-free menu',          // Should match 'gluten free options'
  'vegetarian options',        // Should NOT match anything
  'completely random query'     // Should NOT match anything
];

testQueries.forEach(query => {
  const match = testCache.findFuzzyMatch(query, mockCache);
  
  console.log(`Query: "${query}"`);
  if (match) {
    console.log(`  ✅ Fuzzy Match: "${match.key}" (similarity: ${match.similarity.toFixed(3)})`);
  } else {
    console.log(`  ❌ No fuzzy match found`);
  }
  console.log('');
});

console.log(`\n⚙️  Configuration:`);
console.log(`   Fuzzy Threshold: ${testCache.fuzzyThreshold} (${testCache.fuzzyThreshold * 100}% similarity required)`);
console.log(`   Max Cache Size: ${testCache.maxQueries} queries`);
console.log(`   TTL: ${testCache.ttlHours} hours`); 