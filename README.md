# Chatbot Avatar Demo với Azure Services

Demo chatbot với avatar realtime sử dụng Azure OpenAI và Azure Speech Service.

## Tính năng

- 💬 Chatbot với Azure OpenAI
- 🎭 Avatar realtime với Azure Speech Service
- 🎨 UI tối giản và hiện đại
- ⚡ Phản hồi realtime
- 🔁 WebRTC streaming với Azure Avatar Synthesizer ([docs](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar))

## Yêu cầu

- Node.js 18+ 
- Azure OpenAI account
- Azure Speech Service account

## Cài đặt

1. **Clone repository và cài đặt dependencies:**

```bash
npm install
```

2. **Cấu hình Azure credentials:**

Mở file `.env` và thêm các thông tin sau:

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

## Chạy ứng dụng

```bash
npm run dev
```

Hoặc:

```bash
npm start
```

Mở trình duyệt và truy cập: `http://localhost:3000`

## Cấu trúc dự án

```
.
├── server/
│   ├── index.js              # Express server
│   ├── routes/
│   │   ├── chat.js          # Chat API route
│   │   └── speech.js        # Speech token route
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

## SDK được sử dụng

1. **Azure OpenAI SDK** (`@azure/openai`)
   - Để kết nối với Azure OpenAI cho chatbot responses
   - Documentation: https://learn.microsoft.com/en-us/azure/ai-services/openai/reference
   - NPM: https://www.npmjs.com/package/@azure/openai

2. **Azure Speech SDK** (`microsoft-cognitiveservices-speech-sdk`)
   - Để tạo avatar realtime và text-to-speech
   - Documentation: https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar
   - NPM: https://www.npmjs.com/package/microsoft-cognitiveservices-speech-sdk

## Realtime avatar luồng hoạt động

1. Frontend gọi `/api/speech/token` để lấy Speech key/region và `/api/speech/ice-token` để lấy ICE relay từ Azure.
2. Browser tạo `RTCPeerConnection` với ICE servers từ Azure và khởi tạo `SpeechSDK.AvatarSynthesizer`.
3. Bất cứ khi nào chatbot trả lời, client gọi `avatarSynthesizer.speakTextAsync()` để stream video + audio avatar realtime (tham khảo [How to use text to speech avatar with real-time synthesis](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar)).

## Lưu ý

- Avatar realtime đầy đủ yêu cầu Azure Avatar API endpoint và WebRTC setup
- Code hiện tại bao gồm text-to-speech như một fallback
- Để sử dụng avatar video đầy đủ, bạn cần cấu hình Azure Avatar API endpoint trong `public/app.js`
- Endpoint `/api/speech/ice-token` sẽ proxy request lấy ICE server thông qua Azure Speech Service; đảm bảo region bạn chọn hỗ trợ Text to Speech Avatar realtime

## Troubleshooting

- Đảm bảo các keys trong `.env` đã được cấu hình đúng
- Kiểm tra Azure Speech Service region có khả dụng không
- Xem console log để debug các lỗi kết nối

## License

MIT
