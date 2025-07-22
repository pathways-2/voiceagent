// FAQ Knowledge Base for Sylvie's Kitchen
// This data will be used by the AI to answer customer questions

const faqKnowledge = {
  restaurant: {
    name: "Sylvie's Kitchen",
    type: "Fine Dining Restaurant",
    atmosphere: "Upscale yet welcoming atmosphere with intimate dining, perfect for special occasions and memorable dinners",
    specialty: "Contemporary American cuisine featuring seasonal ingredients and locally sourced produce"
  },
  
  hours: {
    monday: "Closed",
    tuesday: "5:00 PM - 10:00 PM",
    wednesday: "5:00 PM - 10:00 PM", 
    thursday: "5:00 PM - 10:00 PM",
    friday: "5:00 PM - 10:00 PM",
    saturday: "5:00 PM - 10:00 PM",
    sunday: "5:00 PM - 10:00 PM",
    note: "We are closed on Mondays. Open Tuesday through Sunday from 5 PM to 10 PM."
  },
  
  location: {
    address: "123 Main Street, Your City, State 12345",
    parking: "Street parking available. We also have a small lot behind the restaurant.",
    accessibility: "Wheelchair accessible entrance and restroom available.",
    nearbyLandmarks: "Located near the historic downtown district, two blocks from the main library."
  },
  
  menu: {
    concept: "Our menu changes seasonally to showcase the finest local ingredients and contemporary culinary techniques",
    appetizers: [
      "Pan-seared scallops with cauliflower purée and pancetta",
      "Burrata with heirloom tomatoes and basil oil", 
      "Duck liver mousse with fig compote and brioche",
      "Oysters with champagne mignonette",
      "Roasted bone marrow with herb salad"
    ],
    mains: [
      "Dry-aged ribeye with truffle butter and roasted vegetables",
      "Wild-caught salmon with quinoa pilaf and seasonal vegetables",
      "Braised short ribs with polenta and root vegetables",
      "Pan-roasted chicken breast with seasonal risotto",
      "Rack of lamb with herbs de Provence and ratatouille",
      "Seasonal vegetarian tasting menu available"
    ],
    sides: [
      "Roasted seasonal vegetables",
      "Truffle mac and cheese",
      "Garlic and rosemary roasted potatoes",
      "Sautéed seasonal greens"
    ],
    desserts: [
      "Chocolate lava cake with vanilla bean ice cream",
      "Seasonal fruit tart with pastry cream",
      "Crème brûlée with seasonal berries", 
      "House-made sorbet and ice cream selection"
    ],
    dietary: {
      vegetarian: "Multiple vegetarian options available, including our seasonal vegetarian tasting menu",
      vegan: "We can accommodate vegan dietary needs with advance notice",
      glutenFree: "Gluten-free options available - please inform your server",
      allergies: "Please inform your server of any food allergies - our kitchen can accommodate most dietary restrictions"
    },
    pricing: "Our seasonal menu features entrees ranging from $28-$45, with tasting menu options available"
  },
  
  wine: {
    selection: "Carefully curated wine list featuring both domestic and international selections",
    features: [
      "California wines from Napa and Sonoma valleys",
      "French selections including Burgundy and Bordeaux", 
      "Italian wines from various regions",
      "Local wines from nearby vineyards"
    ],
    sommelier: "Our sommelier is available to recommend perfect wine pairings with your meal",
    byTheGlass: "Rotating selection of wines by the glass, with premium options available",
    tastings: "Wine flights available featuring themed selections"
  },
  
  reservations: {
    policy: "Reservations recommended, especially for weekends",
    partySize: "Maximum party size is 8 people",
    largeGroups: "For parties larger than 8, please call us directly to discuss arrangements",
    cancellation: "Please call at least 2 hours in advance to cancel or modify reservations",
    walkIns: "Walk-ins welcome when tables are available",
    busyTimes: "7 PM - 9 PM are our busiest hours on weekends"
  },
  
  services: {
    delivery: "Currently not available",
    takeout: "Takeout available for most menu items",
    catering: "Small catering orders available - please call to discuss",
    privateEvents: "We can accommodate small private events - please call for details",
    giftCards: "Gift cards available for purchase"
  },
  
  contact: {
    phone: "+1 (555) 123-4567",
    email: "info@sylvieskitchen.com",
    website: "www.sylvieskitchen.com",
    socialMedia: {
      instagram: "@sylvieskitchen",
      facebook: "Sylvie's Kitchen Restaurant"
    }
  },
  
  pricing: {
    range: "Fine dining pricing, entrees typically $28-$45",
    appetizers: "$12-$22",
    mains: "$28-$45", 
    desserts: "$10-$16",
    wine: "Glasses $10-$18, Bottles $40-$200",
    tastingMenu: "Chef's tasting menu available for $85 per person (wine pairing +$45)",
    paymentMethods: "We accept cash, all major credit cards, and contactless payments"
  },
  
  policies: {
    dress: "Smart casual dress code",
    children: "Children welcome, high chairs available",
    pets: "Service animals only",
    smoking: "Non-smoking establishment",
    corkage: "Corkage fee $20 per bottle if you bring your own wine"
  }
};

// Helper function to search FAQ knowledge
function searchFAQ(query) {
  const results = [];
  const queryLower = query.toLowerCase();
  
  // Search through all sections
  Object.keys(faqKnowledge).forEach(section => {
    const sectionData = faqKnowledge[section];
    
    if (typeof sectionData === 'object') {
      Object.keys(sectionData).forEach(key => {
        const value = sectionData[key];
        const searchText = typeof value === 'string' ? value : JSON.stringify(value);
        
        if (searchText.toLowerCase().includes(queryLower)) {
          results.push({
            section,
            key,
            value,
            relevance: calculateRelevance(queryLower, searchText.toLowerCase())
          });
        }
      });
    }
  });
  
  return results.sort((a, b) => b.relevance - a.relevance);
}

function calculateRelevance(query, text) {
  const queryWords = query.split(' ');
  let relevance = 0;
  
  queryWords.forEach(word => {
    if (word.length > 2 && text.includes(word)) {
      relevance++;
    }
  });
  
  return relevance;
}

module.exports = {
  faqKnowledge,
  searchFAQ
}; 