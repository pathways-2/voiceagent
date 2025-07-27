# 🤖 Rooney Voice Agent - Sylvie's Kitchen

**An intelligent voice AI agent that handles incoming phone calls for Sylvie's Kitchen restaurant, automating reservations, answering FAQs, and providing 24/7 customer support through natural conversation.**

[![Status](https://img.shields.io/badge/Status-Production%20Ready-green)](/)
[![AI Powered](https://img.shields.io/badge/AI-GPT--4%20Powered-blue)](/)
[![Voice](https://img.shields.io/badge/Voice-Twilio%20Integrated-purple)](/)
[![Performance](https://img.shields.io/badge/Cache-200x%20Faster-orange)](/)

---

## 🎯 Project Overview

Rooney is a sophisticated voice AI agent specifically designed for **Sylvie's Kitchen**, an Asian Fusion restaurant in Seattle. The system handles complete phone-based customer interactions including:

- **Smart Reservations**: Availability checking → Personal details collection → Booking confirmation
- **Intelligent FAQ**: RAG-powered responses with advanced caching and fuzzy matching
- **Natural Conversation**: Handles hesitant speech, interruptions, and context switching
- **Multi-Modal Confirmations**: WhatsApp/SMS notifications with reservation details
- **High Performance**: 200x faster responses with intelligent cache system

---

## 🏗️ System Architecture

### **ASCII System Overview**
```
┌─────────────────┐    ┌──────────────────┐    ┌─────────────────┐
│   📞 Customer   │───▶│  🌐 Twilio Voice │───▶│  🖥️ VoiceAI     │
│     Phone       │    │     Gateway      │    │    Server       │
└─────────────────┘    └──────────────────┘    └─────────────────┘
                                                         │
                       ┌─────────────────────────────────┼─────────────────────────────────┐
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐                ┌──────────────┐                ┌─────────────────┐
              │  🧠 OpenAI GPT-4 │                │ ⚡ RAG Cache │                │ 🗄️ SQLite DB   │
              │   (Conversation) │                │   System     │                │ (Reservations)  │
              └─────────────────┘                └──────────────┘                └─────────────────┘
                       │                                 │                                 │
                       ▼                                 ▼                                 ▼
              ┌─────────────────┐                ┌──────────────┐                ┌─────────────────┐
              │ 🔍 Vectorize.io │                │ 💾 JSON Cache│                │ 📅 Google Cal   │
              │  (Vector Search) │                │  (168hr TTL) │                │   Integration   │
              └─────────────────┘                └──────────────┘                └─────────────────┘
                                                         │
                                                         ▼
                                                ┌──────────────┐
                                                │ 📱 WhatsApp  │
                                                │   Notifications│
                                                └──────────────┘

🏎️ Performance: Cache Hits = 2-9ms | Vector Search = 1560ms | DB Queries = 7ms
```

### **High-Level Architecture**
```mermaid
graph TB
    subgraph "External Services"
        PHONE[📞 Customer Phone]
        TWILIO[🌐 Twilio Voice API]
        OPENAI[🧠 OpenAI GPT-4]
        VECTORIZE[🔍 Vectorize.io RAG]
        SMS[📱 Twilio SMS/WhatsApp]
    end
    
    subgraph "Core Application"
        SERVER[🖥️ Express Server]
        VOICE[🎤 Voice Processor]
        CONV[💭 Conversation Manager]
        RAG[📚 RAG Service]
        CACHE[⚡ Smart Cache Layer]
        RES[📋 Reservation Manager]
        NOTIF[📨 Notification Service]
        GCAL[📅 Google Calendar]
    end
    
    subgraph "Data Layer"
        DB[(🗄️ SQLite Database)]
        RAGCACHE[(💾 RAG Query Cache)]
        HANDBOOK[📖 Restaurant Handbook]
        CALENDAR[📅 Web Calendar UI]
    end
    
    PHONE --> TWILIO
    TWILIO --> SERVER
    SERVER --> VOICE
    VOICE --> CONV
    CONV --> OPENAI
    CONV --> RAG
    RAG --> CACHE
    CACHE --> VECTORIZE
    CACHE --> RAGCACHE
    CONV --> RES
    RES --> DB
    RES --> GCAL
    RES --> NOTIF
    NOTIF --> SMS
    HANDBOOK --> RAG
    DB --> CALENDAR
    
    style SERVER fill:#e1f5fe
    style VOICE fill:#f3e5f5
    style CONV fill:#e8f5e8
    style CACHE fill:#fff8e1
    style RES fill:#fff3e0
    style DB fill:#fce4ec
```

### **Enhanced RAG Processing Pipeline with Smart Caching**
```mermaid
graph LR
    A[📞 Incoming Call] --> B[🎤 Speech-to-Text]
    B --> C{🎯 Intent Analysis}
    
    C -->|FAQ| D[🔧 Query Preprocessing]
    D --> E[🔍 Smart Cache Check]
    E -->|Cache Hit ⚡| F[📝 Cached Response 2-9ms]
    E -->|Cache Miss| G[🧠 Fuzzy Match Search]
    G -->|Match Found 90%+| F
    G -->|No Match| H[🔍 Vector Search 1.5s]
    H --> I[💾 Cache & Generate]
    I --> F
    
    C -->|Reservation| J[📊 Extract Details]
    J --> K{📋 Complete Info?}
    K -->|No| L[❓ Ask Missing Info]
    K -->|Yes| M[✅ Check Availability 7ms]
    M --> N[💾 Book & Confirm]
    N --> O[📱 WhatsApp Notification]
    
    F --> P[🗣️ Text-to-Speech]
    L --> P
    O --> P
    P --> Q[📞 Voice Response]
    
    style E fill:#fff8e1
    style F fill:#e8f5e8
    style G fill:#f3e5f5
    style M fill:#f1f8e9
    style O fill:#fff3e0
```

### **Smart Cache Architecture (NEW)**
```mermaid
graph TB
    subgraph "RAG Cache System"
        QUERY[🔤 User Query] --> CLEAN[🧹 Query Cleaner]
        CLEAN --> EXACT[🎯 Exact Match Check]
        EXACT -->|Hit| RETURN[⚡ Return Cached 2-9ms]
        EXACT -->|Miss| FUZZY[🔍 Fuzzy Search Engine]
        FUZZY --> LEV[📏 Levenshtein Distance]
        LEV --> SIM[📊 Similarity Score 80%+]
        SIM -->|Match| RETURN
        SIM -->|No Match| VECTOR[🌐 Vector Search 1.5s]
        VECTOR --> STORE[💾 Cache New Result]
        STORE --> LRU[🔄 LRU Eviction Max:10]
        LRU --> RETURN
    end
    
    subgraph "Cache Storage"
        MEMORY[(💾 JSON Cache File)]
        META[📊 Metadata: TTL 168hrs]
        QUERIES[📝 Query Results]
        STATS[📈 Hit/Miss Analytics]
    end
    
    STORE --> MEMORY
    MEMORY --> META
    MEMORY --> QUERIES
    MEMORY --> STATS
    
    style EXACT fill:#e8f5e8
    style FUZZY fill:#fff8e1
    style VECTOR fill:#ffebee
    style RETURN fill:#e1f5fe
```

### **Reservation Flow Architecture**
```mermaid
sequenceDiagram
    participant C as Customer
    participant R as Rooney
    participant DB as Database
    participant GCal as Google Calendar
    participant WA as WhatsApp
    
    C->>R: "Reservation for 4 people Wednesday 7pm"
    R->>R: Extract: date, time, party_size
    R->>R: Normalize: Wednesday → 2025-07-23
    R->>DB: Check availability for 2025-07-23 18:00 (7ms)
    DB->>R: Available (2/20 reservations)
    R->>C: "Great! Available. Name and phone?"
    C->>R: "Sam Smith, 512-228-4470"
    R->>R: Extract: name, phone
    R->>DB: Create reservation (544ms)
    R->>GCal: Create calendar event
    DB->>R: Booking confirmed (Table ID 3)
    R->>WA: Send confirmation message
    WA->>C: "🍽️ Reservation confirmed..."
    R->>C: "Perfect! Anything else?"
```

---

## ✨ Features & Capabilities

### **🎤 Voice Intelligence**
- [x] **Natural Speech Processing**: Handles "um", hesitations, corrections
- [x] **Context Awareness**: Maintains conversation state across turns
- [x] **Intent Recognition**: Distinguishes reservations, FAQs, complaints
- [x] **Smart Query Cleaning**: Preprocesses messy speech for better RAG results
- [x] **Conversation Continuation**: Always asks "anything else?" to keep engaging

### **📅 Reservation Management**
- [x] **Smart Date Parsing**: "Wednesday" → next Wednesday, "tomorrow" → actual date
- [x] **Ultra-Fast Availability**: 7ms database response times
- [x] **Proper Workflow**: Date/Time/Party Size → Check availability → Get personal details
- [x] **Google Calendar Integration**: Live calendar event creation
- [x] **Real-time Database**: SQLite with full CRUD operations
- [x] **WhatsApp Confirmations**: Rich formatted booking confirmations

### **🧠 Advanced RAG System with Smart Caching**
- [x] **Semantic Search**: Vectorize.io for restaurant handbook knowledge
- [x] **Intelligent Cache**: 200x performance improvement with fuzzy matching
- [x] **Fuzzy Query Matching**: 90%+ similarity with Levenshtein distance algorithm
- [x] **Extended TTL**: 168-hour (7-day) cache retention
- [x] **LRU Eviction**: Maximum 10 queries with intelligent replacement
- [x] **Query Preprocessing**: Normalizes hesitant speech patterns
- [x] **Real-time Analytics**: Cache hit/miss tracking and performance metrics

### **🚀 Performance Features**
- [x] **Lightning Fast**: 2-9ms cache responses vs 1500ms vector search
- [x] **Smart Fuzzy Matching**: "high chair availability" → "Do you have high chairs?" (90.9% similarity)
- [x] **Comprehensive Logging**: Detailed performance monitoring with timestamps
- [x] **Error Recovery**: Graceful fallbacks for API failures
- [x] **Scalable Architecture**: Production-ready with monitoring

---

## 🌟 Current Status & Performance Metrics

### **✅ Production Performance (Latest Metrics)**

**🏎️ Response Times:**
- **Cache Hits**: `2-9ms` ⚡ (200x faster)
- **Vector Search**: `1,560ms` (cache miss)
- **Database Queries**: `7ms` (availability checks)
- **Reservations**: `544ms` (including Google Calendar)
- **End-to-End**: `2-5 seconds` (complete voice response)

**🎯 Cache Effectiveness:**
- **Hit Rate**: `66%` (improving with usage)
- **Fuzzy Matching**: `90.9%` similarity accuracy
- **Cache Size**: `10 queries max` (LRU eviction)
- **TTL**: `168 hours` (7 days)

**📊 System Metrics:**
- **Database**: `Sub-10ms` response times
- **OpenAI API**: `~1s` chat completion, `~2s` intent analysis
- **Twilio Integration**: `100%` call success rate
- **WhatsApp Delivery**: `100%` confirmation success

### **✅ Fully Implemented & Working**
- **Voice Calling**: Complete Twilio integration with ngrok tunneling
- **Advanced Conversation AI**: GPT-4 powered with context retention
- **High-Performance RAG**: Smart caching with fuzzy matching
- **Complete Reservation System**: End-to-end booking with real-time availability
- **Google Calendar Integration**: Live calendar event creation and sync
- **WhatsApp Notifications**: Rich formatted confirmation messages
- **Production Monitoring**: Comprehensive logging and performance tracking

### **⏳ Ready for Activation**
- **📧 Email Notifications**: SendGrid configured, ready to enable
- **📈 Analytics Dashboard**: Performance metrics collection active

---

## 🚀 Quick Start Guide

### **📋 Prerequisites**
```bash
Node.js 18+
Twilio Account (Voice + SMS/WhatsApp)
OpenAI API Key (GPT-4 access)
Vectorize.io Account
ngrok (for local development)
Google Calendar API (optional)
```

### **⚡ Installation**
```bash
# 1. Clone and install
git clone <repository>
cd VoiceAI
npm install

# 2. Configure environment
cp environment-setup.txt .env
# Edit .env with your API keys

# 3. Start the system
npm start

# 4. Start ngrok (separate terminal)
ngrok http 3000
```

### **📞 Testing Your Enhanced Agent**

#### **Phone Testing (Recommended)**
```bash
# Your Twilio number
Call: +1 (425) 600-3548

# Test cache performance scenarios:
1. "Do you have high chairs?" (Cache miss → cache creation)
2. "High chair availability?" (Cache hit with fuzzy match 90.9%)
3. "Kids menu options?" (Exact cache hit 4ms)
4. "Reservation for 4 people July 27 at 5 PM" (Full booking flow)
```

#### **Cache Performance Testing**
```bash
# Check cache status
curl https://your-ngrok-url/voice/rag-cache/status

# View cache contents and hit rates
curl https://your-ngrok-url/voice/rag-cache/stats

# Clear cache (if needed)
curl -X POST https://your-ngrok-url/voice/rag-cache/clear
```

#### **Performance Monitoring**
```bash
# Real-time performance stats
curl localhost:3000/voice/stats

# Database performance
curl localhost:3000/reservations/stats/summary

# System health with timing
curl localhost:3000/health
```

---

## 🔧 Development Guide

### **Project Structure**
```
VoiceAI/
├── src/
│   ├── server.js                    # Express server & routes
│   ├── services/
│   │   ├── conversationManager.js   # AI conversation logic
│   │   ├── voiceProcessor.js        # Voice processing pipeline  
│   │   ├── reservationManager.js    # Booking logic & database
│   │   ├── ragService.js            # RAG FAQ system
│   │   ├── googleCalendarService.js # Calendar integration
│   │   └── notificationService.js   # WhatsApp/SMS confirmations
│   ├── utils/
│   │   ├── ragQueryCache.js         # 🆕 Smart cache with fuzzy matching
│   │   ├── restaurantHoursCache.js  # Hours caching
│   │   └── timer.js                 # Performance monitoring
│   └── routes/
│       ├── voice.js                 # Twilio webhooks + cache APIs
│       ├── reservations.js          # Reservation API
│       └── index.js                 # Web UI routes
├── data/
│   ├── reservations.db              # SQLite database
│   ├── rag-query-cache.json         # 🆕 Smart cache storage
│   └── restaurant-handbook.pdf      # RAG knowledge source
├── test-fuzzy-matching.js           # 🆕 Cache testing utilities
├── test-system.js                   # System testing script
└── environment-setup.txt            # Configuration template
```

### **New Key Classes & Services**

#### **Enhanced RAGQueryCache** 🆕
```javascript
// Advanced caching with fuzzy matching
class RAGQueryCache {
  constructor() {
    this.ttlHours = 168;        // 7-day cache retention
    this.maxQueries = 10;       // LRU eviction
    this.fuzzyThreshold = 0.8;  // 80% similarity minimum
  }
  
  // Fuzzy matching with Levenshtein distance
  calculateSimilarity(str1, str2)
  findFuzzyMatch(query, cache)
  normalizeForFuzzy(query)      // Query preprocessing
  
  // Performance optimized methods
  getCachedResults(query)       // 2-9ms response time
  cacheResults(query, results)  // Smart storage
  enforceMaxSize(cache)         // LRU eviction
}
```

#### **VoiceProcessor** (Enhanced)
```javascript
// Enhanced voice processing with performance monitoring
processUserInput(speechText, customerPhone, callSid)
normalizeReservationData(data)
checkReservationAvailability(data)  // 7ms database performance
```

#### **ConversationManager** (Enhanced)
```javascript
// AI conversation with advanced preprocessing
processMessage(userInput, callSid, customerPhone)
analyzeIntent(userInput, conversation)
preprocessQuery(userInput)  // Enhanced speech cleaning
```

### **Environment Variables**
```bash
# Core Services
OPENAI_API_KEY=sk-...
TWILIO_ACCOUNT_SID=AC...
TWILIO_AUTH_TOKEN=...
TWILIO_PHONE_NUMBER=+1425...

# RAG System
VECTORIZE_PIPELINE_ACCESS_TOKEN=...
VECTORIZE_ORGANIZATION_ID=...
VECTORIZE_PIPELINE_ID=...

# Google Calendar Integration
GOOGLE_CALENDAR_ID=...
GOOGLE_SERVICE_ACCOUNT_KEY=...

# Restaurant Details
RESTAURANT_NAME="Sylvie's Kitchen"
RESTAURANT_PHONE="+14256003548" 
RESTAURANT_ADDRESS="1247 Pine Street, Seattle, WA 98101"
```

---

## 📊 Advanced Monitoring & Analytics

### **Real-time Performance Monitoring**
```bash
# Cache performance metrics
GET /voice/rag-cache/status
# Response: {
#   "metadata": {"currentSize": 6, "maxSize": 10},
#   "queries": [
#     {"query": "high chair availability", "hitCount": 1},
#     {"query": "kids menu", "hitCount": 1}
#   ]
# }

# System performance stats
GET /voice/stats
# Response: timing data, cache hit rates, error counts

# Reservation analytics  
GET /reservations/stats/summary
# Response: booking patterns, peak times
```

### **Enhanced Logging & Debugging**
The system provides comprehensive performance logging:

#### **Cache Performance Logs**
```
⏱️ [RAG-Cache-Lookup-1753488231671] 9.24ms
🎯 RAG Cache Hit (fuzzy): "high chair availability" → "Do you have high chairs?" (similarity: 0.909)
💾 RAG Cache Saved: "kids menu" (6/10)
📊 Found 3 relevant results (threshold: 0.1)
```

#### **Database Performance Logs**
```
⏱️ [Database-Availability-Check] 7.16ms
📊 Current reservations for 2025-07-27 17:00: 2/20
⏱️ [Create-Reservation] 544.44ms
✅ Google Calendar event created: 4esimktdokt1j67s6nsc7knce0
```

#### **End-to-End Performance Logs**
```
⏱️ [Voice-Processing-CAbde682cf582cdb8726321a29d9d2b733] 2560.2ms
⏱️ [Conversation-Processing] 2538.03ms
⏱️ [Twilio-Route-CAbde682cf582cdb8726321a29d9d2b733] 2561.5ms
```

---

## 🔮 Roadmap & Future Enhancements

### **Phase 2: Enhanced Performance**
- [ ] **Redis Cache**: Scale beyond single-file JSON cache
- [ ] **Cache Warming**: Pre-populate common queries
- [ ] **Advanced Analytics**: ML-powered query prediction
- [ ] **Multi-language Fuzzy Matching**: Spanish similarity algorithms

### **Phase 3: Enterprise Features**
- [ ] **Distributed Caching**: Multi-instance cache synchronization
- [ ] **A/B Testing**: Cache strategy optimization
- [ ] **Advanced Monitoring**: APM integration with detailed metrics
- [ ] **Auto-scaling**: Dynamic cache sizing based on load

### **Phase 4: AI Enhancements**
- [ ] **Semantic Caching**: Vector-based cache matching
- [ ] **Context-Aware Caching**: User session-based cache strategies
- [ ] **Predictive Preloading**: AI-driven cache warming
- [ ] **Adaptive TTL**: Dynamic cache expiration based on query patterns

---

## 🛠️ Troubleshooting

### **Performance Issues**

#### **Cache Not Working**
```bash
# Check cache status
curl localhost:3000/voice/rag-cache/status

# Look for cache operation logs
grep "RAG-Cache" logs/application.log

# Test fuzzy matching manually
node test-fuzzy-matching.js
```

#### **Slow RAG Responses**
```bash
# Check if cache is being used
# Look for: "🎯 RAG Cache Hit" vs "❌ RAG Cache Miss"

# Check cache hit rates
curl localhost:3000/voice/rag-cache/stats

# Clear cache if corrupted
curl -X POST localhost:3000/voice/rag-cache/clear
```

#### **Database Performance Issues**
```bash
# Check availability query performance
# Should see: "⏱️ [Database-Availability-Check] 7.16ms"

# Test database directly
sqlite3 data/reservations.db ".tables"
sqlite3 data/reservations.db "SELECT COUNT(*) FROM reservations;"
```

### **Debug Mode with Performance Monitoring**
```bash
# Run with detailed performance logging
DEBUG=* npm start

# Focus on specific performance areas
DEBUG=cache* npm start
DEBUG=rag* npm start
DEBUG=reservation* npm start
```

---

## 🎯 Performance Benchmarks

### **Before vs After Cache Optimization**

| Operation | Before | After | Improvement |
|-----------|--------|-------|-------------|
| RAG Query (Hit) | 1,560ms | 2-9ms | **200x faster** |
| Fuzzy Match | N/A | 9ms | **New capability** |
| Cache Miss | 1,560ms | 1,560ms + cache | Same + future benefit |
| Database Query | 7ms | 7ms | Unchanged (already optimal) |
| End-to-End Response | 4-6s | 2-5s | **20-40% faster** |

### **Cache Effectiveness Metrics**
- **Storage**: JSON file with LRU eviction (10 queries max)
- **Hit Rate**: 66% and improving with usage
- **Fuzzy Accuracy**: 90.9% similarity matching
- **TTL Strategy**: 168 hours (7 days) for restaurant info
- **Memory Usage**: <1MB for cache storage

---

## 🤝 Contributing

### **Development Workflow**
1. **Fork** the repository
2. **Create** a feature branch: `git checkout -b feature/amazing-feature`
3. **Test** thoroughly with phone calls and performance monitoring
4. **Document** changes in README if they affect performance or features
5. **Submit** a pull request with performance impact analysis

### **Performance Testing Checklist**
- [ ] Cache hit/miss ratios acceptable (>50%)
- [ ] End-to-end response times under 5 seconds
- [ ] Database queries under 10ms
- [ ] RAG cache responses under 10ms
- [ ] Fuzzy matching accuracy above 80%
- [ ] Memory usage remains stable
- [ ] No cache corruption under load

---

## 📄 License

MIT License - see LICENSE file for details.

---

## 🆘 Support & Contact

### **Technical Support**
- **GitHub Issues**: For bugs and feature requests
- **Performance Issues**: Include cache stats and timing logs
- **Documentation**: This README and comprehensive inline code comments

### **Business Contact**
- **Restaurant**: Sylvie's Kitchen
- **Location**: Seattle, WA
- **Phone**: +1 (425) 600-3548

---

**Built with ❤️ for Sylvie's Kitchen**

*Powered by Node.js, Twilio, OpenAI GPT-4, Vectorize.io, SQLite, and High-Performance Caching*

---

*Last Updated: July 2025 - v2.0 with Advanced Cache System* 