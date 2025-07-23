# 📅 Google Calendar Integration Setup

This guide walks you through setting up Google Calendar integration for the Rooney Voice Agent.

## 🎯 Overview

The Google Calendar integration provides:
- **Dual Storage**: Reservations saved to both SQLite database and Google Calendar
- **Rich Calendar Events**: Detailed reservation info with customer details
- **Bi-directional Sync**: Update/cancel reservations syncs with calendar
- **Visual Management**: View reservations in Google Calendar alongside other events

---

## 🔧 Setup Process

### **Step 1: Google Cloud Console Setup**

1. **Go to Google Cloud Console**
   - Visit: https://console.cloud.google.com/
   - Create a new project or select existing one

2. **Enable Google Calendar API**
   - Navigate to "APIs & Services" → "Library"
   - Search for "Google Calendar API"
   - Click "Enable"

3. **Create OAuth 2.0 Credentials**
   - Go to "APIs & Services" → "Credentials"
   - Click "Create Credentials" → "OAuth 2.0 Client IDs"
   - Application type: "Web application"
   - Name: "Rooney Voice Agent"
   - Authorized redirect URIs: `http://localhost:3000/auth/google/callback`

4. **Download Credentials**
   - Note the `Client ID` and `Client Secret`

### **Step 2: Get Refresh Token**

Use this Node.js script to get your refresh token:

```javascript
const { google } = require('googleapis');

const oauth2Client = new google.auth.OAuth2(
  'YOUR_CLIENT_ID',
  'YOUR_CLIENT_SECRET',
  'http://localhost:3000/auth/google/callback'
);

// Generate auth URL
const authUrl = oauth2Client.generateAuthUrl({
  access_type: 'offline',
  scope: ['https://www.googleapis.com/auth/calendar']
});

console.log('Visit this URL:', authUrl);
// After visiting URL and getting code, exchange it:
// const { tokens } = await oauth2Client.getToken('AUTHORIZATION_CODE');
// console.log('Refresh token:', tokens.refresh_token);
```

### **Step 3: Environment Configuration**

Add these variables to your `.env` file:

```bash
# Google Calendar Configuration
GOOGLE_CALENDAR_CLIENT_ID=your_client_id_here
GOOGLE_CALENDAR_CLIENT_SECRET=your_client_secret_here
GOOGLE_CALENDAR_REDIRECT_URI=http://localhost:3000/auth/google/callback
GOOGLE_CALENDAR_REFRESH_TOKEN=your_refresh_token_here
GOOGLE_CALENDAR_ID=primary  # or specific calendar ID
RESTAURANT_TIMEZONE=America/Los_Angeles
```

### **Step 4: Test Connection**

Run the connection test:

```bash
node test-connections.js
```

You should see:
```
4️⃣ Testing Google Calendar...
✅ Google Calendar: Connected
   Calendar: Your Calendar Name
```

---

## 🧪 Testing the Integration

### **API Endpoints**

1. **Test Connection**
   ```bash
   curl http://localhost:3000/reservations/test-calendar
   ```

2. **Sync Calendar Events**
   ```bash
   curl -X POST http://localhost:3000/reservations/sync-calendar \
        -H "Content-Type: application/json" \
        -d '{"startDate": "2025-01-01", "endDate": "2025-01-31"}'
   ```

3. **Update Reservation** (syncs to calendar)
   ```bash
   curl -X PUT http://localhost:3000/reservations/RESERVATION_ID \
        -H "Content-Type: application/json" \
        -d '{"customer_name": "Updated Name"}'
   ```

### **Voice Agent Testing**

Make a reservation via the voice agent or chat interface:
1. The reservation will be saved to SQLite database
2. A calendar event will be created automatically
3. Check your Google Calendar for the new event

---

## 📋 Calendar Event Details

Each reservation creates a calendar event with:

**Event Title**: `Reservation: John Doe (Party of 4)`

**Event Description**:
```
🍽️ RESERVATION DETAILS

👤 Customer: John Doe
📞 Phone: (555) 123-4567
📧 Email: john@example.com
👥 Party Size: 4 people
📅 Date: Friday, January 15th, 2025
🕒 Time: 7:00 PM
📝 Special Requests: Window seat preferred

🆔 Reservation ID: abc123-def456
🤖 Created by: Rooney Voice Agent
⏰ Created: 2025-01-15 14:30:22
```

**Event Features**:
- ⏰ **2-hour duration** (configurable)
- 🔔 **Automatic reminders** (24 hours + 1 hour before)
- 🟢 **Green color coding** for reservations
- 📧 **Email invites** to customers (if email provided)
- 🔗 **Linked to database** via reservation ID

---

## 🛠️ Configuration Options

### **Environment Variables**

| Variable | Description | Default |
|----------|-------------|---------|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth 2.0 Client ID | Required |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth 2.0 Client Secret | Required |
| `GOOGLE_CALENDAR_REFRESH_TOKEN` | OAuth 2.0 Refresh Token | Required |
| `GOOGLE_CALENDAR_ID` | Target Calendar ID | `primary` |
| `RESTAURANT_TIMEZONE` | Restaurant Timezone | `America/Los_Angeles` |

### **Customization**

You can customize the integration by modifying `src/services/googleCalendarService.js`:

- **Event duration**: Change `add(2, 'hours')` to desired length
- **Event colors**: Modify `colorId` property
- **Reminder times**: Update `reminders.overrides` array
- **Event template**: Customize `formatEventDescription()` method

---

## 🔍 Troubleshooting

### **Common Issues**

1. **"Calendar not configured" message**
   - Check all environment variables are set
   - Verify refresh token is valid

2. **"Invalid credentials" error**
   - Regenerate OAuth 2.0 credentials
   - Ensure redirect URI matches exactly

3. **"Calendar not found" error**
   - Check `GOOGLE_CALENDAR_ID` is correct
   - Use `primary` for default calendar

4. **"Insufficient permissions" error**
   - Ensure Google Calendar API is enabled
   - Check OAuth scopes include calendar access

### **Debug Logging**

The integration provides detailed logging:
- ✅ Successful operations
- ⚠️ Warnings for missing configuration
- ❌ Errors with details

Check server logs for troubleshooting information.

---

## 🔐 Security Notes

- **Never commit** `.env` file to version control
- **Rotate credentials** regularly
- **Use specific calendar ID** instead of `primary` for production
- **Limit OAuth scopes** to minimum required permissions
- **Monitor API usage** in Google Cloud Console

---

## 🎉 Success!

Once configured, your voice agent will automatically:
1. ✅ Create calendar events for new reservations
2. ✅ Update events when reservations change
3. ✅ Delete events when reservations are cancelled
4. ✅ Provide rich event details for staff visibility
5. ✅ Maintain dual storage (database + calendar)

Your restaurant staff can now view and manage reservations directly in Google Calendar while maintaining the robust database-driven voice agent system! 