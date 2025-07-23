const { google } = require('googleapis');
const readline = require('readline');

// Replace these with your actual credentials from Step 1
const CLIENT_ID = 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID';
const CLIENT_SECRET = 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_SECRET';
const REDIRECT_URI = 'http://localhost:3000/auth/google/callback';

const oauth2Client = new google.auth.OAuth2(
  CLIENT_ID,
  CLIENT_SECRET,
  REDIRECT_URI
);

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

console.log('🔑 Google Calendar Token Generator\n');

if (CLIENT_ID === 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_ID' || CLIENT_SECRET === 'REPLACE_WITH_YOUR_GOOGLE_CLIENT_SECRET') {
  console.log('❌ Please update CLIENT_ID and CLIENT_SECRET in this file first!');
  console.log('   Get them from: https://console.cloud.google.com/apis/credentials');
  process.exit(1);
}

// Generate the URL for authorization
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar'],
  prompt: 'consent' // Forces refresh token generation
});

console.log('📋 Steps to get your refresh token:\n');
console.log('1️⃣ Open this URL in your browser:');
console.log('   ', authUrl);
console.log('\n2️⃣ Sign in with your Google account');
console.log('3️⃣ Grant permissions to access your calendar');
console.log('4️⃣ Copy the authorization code from the URL');
console.log('   (It will look like: http://localhost:3000/auth/google/callback?code=XXXXXXX)');
console.log('   Copy everything after "code=" and before "&scope"');

rl.question('\n5️⃣ Paste the authorization code here: ', async (code) => {
  try {
    const { tokens } = await oauth2Client.getToken(code);
    
    console.log('\n🎉 Success! Here are your tokens:\n');
    console.log('📋 Add these to your .env file:');
    console.log('GOOGLE_CALENDAR_CLIENT_ID=' + CLIENT_ID);
    console.log('GOOGLE_CALENDAR_CLIENT_SECRET=' + CLIENT_SECRET);
    console.log('GOOGLE_CALENDAR_REFRESH_TOKEN=' + tokens.refresh_token);
    console.log('GOOGLE_CALENDAR_ID=primary');
    console.log('RESTAURANT_TIMEZONE=America/Los_Angeles');
    
    console.log('\n✅ Your Google Calendar integration is ready to use!');
    
  } catch (error) {
    console.error('\n❌ Error getting tokens:', error.message);
    console.log('\n💡 Make sure:');
    console.log('   - The authorization code is correct');
    console.log('   - You copied the entire code (no spaces)');
    console.log('   - The redirect URI matches exactly');
  }
  
  rl.close();
}); 