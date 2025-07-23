const { google } = require('googleapis');
const fs = require('fs');

console.log('🔑 Google Calendar Service Account Setup\n');

console.log('This is an alternative approach that bypasses OAuth consent issues.\n');

console.log('📋 Steps to set up Service Account:\n');

console.log('1️⃣ Go to Google Cloud Console:');
console.log('   https://console.cloud.google.com/iam-admin/serviceaccounts\n');

console.log('2️⃣ Create Service Account:');
console.log('   - Click "Create Service Account"');
console.log('   - Name: "Rooney Calendar Service"');
console.log('   - Description: "Calendar access for voice agent"');
console.log('   - Click "Create and Continue"\n');

console.log('3️⃣ Grant Permissions (skip this step):');
console.log('   - Click "Continue" without adding roles\n');

console.log('4️⃣ Create Key:');
console.log('   - Click on the service account you just created');
console.log('   - Go to "Keys" tab');
console.log('   - Click "Add Key" → "Create new key"');
console.log('   - Choose "JSON"');
console.log('   - Download the JSON file\n');

console.log('5️⃣ Share Calendar with Service Account:');
console.log('   - Open Google Calendar (calendar.google.com)');
console.log('   - Go to your calendar settings');
console.log('   - Share calendar with the service account email');
console.log('   - Give it "Make changes to events" permission\n');

console.log('6️⃣ Update Environment:');
console.log('   - Save the JSON file as "google-credentials.json" in your project');
console.log('   - Add to .env: GOOGLE_SERVICE_ACCOUNT_KEY=./google-credentials.json\n');

console.log('📝 This approach is:');
console.log('   ✅ Simpler - no OAuth consent screen needed');
console.log('   ✅ More reliable - no user verification required');
console.log('   ✅ Perfect for server-to-server access');
console.log('   ✅ No refresh token needed\n');

console.log('Would you like to try this approach instead? (y/n)');

const readline = require('readline');
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

rl.question('', (answer) => {
  if (answer.toLowerCase() === 'y' || answer.toLowerCase() === 'yes') {
    console.log('\n🚀 Great! Follow the steps above, then we can update the integration.');
    console.log('💡 The service account approach is actually better for this use case!');
  } else {
    console.log('\n👍 No problem! Let\'s try adding you as a test user first.');
    console.log('   Go back to the OAuth consent screen and add your email as a test user.');
  }
  
  rl.close();
}); 