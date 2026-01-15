# Chatbot Avatar Demo with Azure Services

A real-time chatbot demo using Azure OpenAI and Azure Speech Service.

## Features

- 💬 Chatbot with Azure OpenAI
- 🎙️ Speech-to-speech interaction (microphone input + avatar output)
- 🎭 Real-time avatar with Azure Speech Service
- 🎨 Minimalistic and modern UI
- ⚡ Real-time responses
- 🔁 WebRTC streaming với Azure Avatar Synthesizer ([docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar))

## Requirements

- Node.js 18+ 
- Azure OpenAI account
- Azure Speech Service account

## Installation

1. **Clone the repository and install dependencies:**

```bash
npm install
```

2. **Configure Azure credentials:**

Open the `.env` file and add the following information:

```env
# Azure OpenAI Configuration
AZURE_OPENAI_ENDPOINT=https://your-resource-name.openai.azure.com/
AZURE_OPENAI_API_KEY=your_azure_openai_api_key_here
AZURE_OPENAI_DEPLOYMENT_NAME=your_deployment_name
AZURE_OPENAI_API_VERSION=2024-02-15-preview

# Azure Speech Service Configuration
AZURE_SPEECH_KEY=your_azure_speech_key_here
AZURE_SPEECH_REGION=your_azure_speech_region_here
# Optional: override if you use a custom speech endpoint domain
# AZURE_SPEECH_ENDPOINT=https://your-region.tts.speech.microsoft.com
# Optional custom Speech endpoint (defaults to https://{region}.tts.speech.microsoft.com)
AZURE_SPEECH_ENDPOINT=

# Server Configuration
PORT=3000
```

## Running the Application

```bash
npm run dev
```

Or:

```bash
npm start
```

Open your browser and navigate to: `http://localhost:3000`

## Project Structure

```
.
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   ├── chat.js          # Chat API route
│   │   └── speech.js        # Speech token + ICE relay endpoints
│   └── services/
│       ├── openai.js        # Azure OpenAI service
│       └── speech.js        # Azure Speech service
├── public/
│   ├── index.html           # Frontend HTML
│   ├── styles.css           # CSS styles
│   └── app.js              # Frontend JavaScript
├── .env                     # Environment variables
├── package.json            # Dependencies
└── README.md               # Documentation
```

## SDKs Used

1. **Azure OpenAI SDK** (`@azure/openai`)
   - For connecting to Azure OpenAI for chatbot responses
   - Documentation: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
   - NPM: https://www.npmjs.com/package/@azure/openai

2. **Azure Speech SDK** (`microsoft-cognitiveservices-speech-sdk`)
   - For real-time avatar synthesis and speech recognition
   - Documentation: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar
   - NPM: https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk

## Real-time Avatar Workflow

1. The frontend calls `/api/speech/token` to get the Speech key/region and `/api/speech/ice-token` to retrieve ICE relay information from Azure.
2. The browser creates an `RTCPeerConnection` with the ICE servers from Azure and initializes the `SpeechSDK.AvatarSynthesizer`.
3. Users speak into the microphone; the Speech SDK recognizes the utterance and sends it to `/api/chat`.
4. Whenever the chatbot responds, the client calls `avatarSynthesizer.speakTextAsync()` to stream real-time avatar video + audio (refer to [How to use text to speech avatar with real-time synthesis](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar)).

## Notes

- Full real-time avatar requires Azure Avatar API endpoint and WebRTC setup.
- The current code expects microphone access for speech input.
- To use full avatar video, you need to configure the Azure Avatar API endpoint in `public/app.js`.
- The `/api/speech/ice-token` endpoint proxies the request to get ICE servers via Azure Speech Service; ensure your selected region supports Text to Speech Avatar real-time synthesis.

## Troubleshooting

- Ensure that the keys in `.env` are correctly configured.
- Check if your Azure Speech Service region is available.
- Check the console log to debug connection errors.

## License

MIT
