# How to Run the Application Locally

## Prerequisites

Before running the application, make sure you have:

1. **Node.js 18 or higher** installed on your machine
   - Check your version: `node --version`
   - Download from: https://nodejs.org/

2. **Azure OpenAI Account** with:
   - Endpoint URL
   - API Key
   - Deployment name

3. **Azure Speech Service Account** with:
   - API Key
   - Region

## Step-by-Step Setup

### Step 1: Install Dependencies

Open your terminal/command prompt in the project directory and run:

```bash
npm install
```

This will install all required packages including:
- `@azure/openai` - Azure OpenAI SDK
- `microsoft-cognitiveservices-speech-sdk` - Azure Speech SDK
- `express` - Web server
- Other dependencies

### Step 2: Configure Environment Variables

1. Open the `.env` file in the root directory
2. Replace the placeholder values with your actual Azure credentials:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com/
AZURE_OPENAI_API_KEY=your_actual_azure_openai_api_key
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Azure Speech Service Configuration
AZURE_SPEECH_KEY=your_actual_azure_speech_key
AZURE_SPEECH_REGION=your_azure_speech_region
# Optional: override default endpoint if you use a custom domain
# AZURE_SPEECH_ENDPOINT=https://centralindia.tts.speech.microsoft.com

# Server Configuration
PORT=3000
```

**Important:** 
- Remove any trailing slashes from the endpoint URL
- Make sure there are no spaces around the `=` sign
- Keep the values in quotes if they contain special characters

### Step 3: Start the Server

You have two options:

**Option A: Development mode (with auto-reload):**
```bash
npm run dev
```

**Option B: Production mode:**
```bash
npm start
```

You should see:
```
Server đang chạy tại http://localhost:3000
```
or
```
Server running at http://localhost:3000
```

### Step 4: Open in Browser

1. Open your web browser
2. Navigate to: `http://localhost:3000`
3. You should see the chatbot interface with an avatar section

### Step 5: Test the Application

1. Click the "Start speaking" button and ask a question aloud (e.g., "Hello, how are you?")
2. Wait for the response from Azure OpenAI (text shows in chat pane)
3. The avatar video + audio stream should play almost instantly via WebRTC

### Step 6: (Optional) Inspect realtime avatar connection

The browser automatically:
1. Fetches `/api/speech/token` and `/api/speech/ice-token`
2. Creates a `RTCPeerConnection` with Azure’s relay info
3. Starts `SpeechSDK.AvatarSynthesizer` and calls `speakTextAsync()` whenever the bot replies

For more details see the official [real-time avatar guide](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar).
## Troubleshooting

### Issue: "Cannot find module" errors

**Solution:** Make sure you ran `npm install` and all dependencies are installed.

### Issue: "Azure OpenAI credentials not configured"

**Solution:** 
- Check that your `.env` file exists in the root directory
- Verify all environment variables are set correctly
- Make sure there are no typos in variable names

### Issue: Port 3000 already in use

**Solution:** 
- Change the `PORT` value in `.env` to a different port (e.g., `3001`)
- Or stop the application using port 3000

### Issue: CORS errors in browser

**Solution:** 
- Make sure you're accessing via `http://localhost:3000` (not `127.0.0.1`)
- Check that the server is running

### Issue: Speech service not working

**Solution:**
- Verify your Azure Speech Service key and region are correct
- Check that your Speech Service resource supports the region you specified
- Check browser console for detailed error messages

### Issue: Avatar video not showing

**Solution:**
- Confirm your Speech resource is Standard S0 (avatars only exist on supported regions)
- Ensure `/api/speech/ice-token` succeeds (no 4xx/5xx); if it fails, verify `AZURE_SPEECH_KEY`, `AZURE_SPEECH_REGION`, and optional `AZURE_SPEECH_ENDPOINT`
- Reload the page after restarting the backend so the Speech SDK reconnects

## Project Structure

```
Mankind_avatar_demo/
├── server/
│   ├── index.js              # Main Express server
│   ├── routes/
│   │   ├── chat.js          # Chat API endpoint
│   │   └── speech.js        # Speech token + ICE relay endpoints
│   └── services/
│       ├── openai.js        # Azure OpenAI service
│       └── speech.js        # Azure Speech service
├── public/
│   ├── index.html           # Frontend HTML
│   ├── styles.css           # CSS styles
│   └── app.js              # Frontend JavaScript
├── .env                     # Environment variables (create this)
├── package.json            # Dependencies
└── README.md               # Documentation
```

## Available Scripts

- `npm start` - Start the server in production mode
- `npm run dev` - Start the server in development mode with auto-reload
- `npm install` - Install all dependencies

## Next Steps

Once the application is running:
1. Test with different questions
2. Check the browser console (F12) for any errors
3. Check the server terminal for backend logs
4. Customize the UI in `public/styles.css` if needed
5. Modify the system prompt in `server/services/openai.js` to change chatbot behavior

## Need Help?

- Check the browser console (F12 → Console tab) for frontend errors
- Check the terminal where the server is running for backend errors
- Verify your Azure credentials are correct
- Make sure your Azure resources are active and have sufficient quota
