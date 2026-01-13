# Hướng dẫn Setup Azure Avatar Realtime

## Azure Speech Service Avatar

Để sử dụng avatar realtime đầy đủ với video, bạn cần:

### 1. Tạo Azure Avatar Resource

1. Đăng nhập vào Azure Portal
2. Tạo một Speech Service resource mới
3. Chọn region hỗ trợ Avatar (ví dụ: East US, West Europe)
4. Lưu lại Key và Region

### 2. Tạo Avatar Instance

Azure Avatar yêu cầu bạn tạo một avatar instance trước khi sử dụng. Bạn có thể:
- Sử dụng avatar có sẵn (prebuilt avatars)
- Tạo custom avatar từ video

### 3. Cấu hình trong Code

Để sử dụng avatar realtime với WebRTC, bạn cần:

1. **Cập nhật `.env` file:**
```env
AZURE_SPEECH_KEY=your_speech_key
AZURE_SPEECH_REGION=your_region
AZURE_AVATAR_CHARACTER=your_avatar_character_id  # Optional
```

2. **Cập nhật `public/app.js` để sử dụng Avatar API:**

Code hiện tại đã có cấu trúc cơ bản cho avatar. Để kích hoạt đầy đủ:

- Sử dụng `AvatarSynthesizer` từ Speech SDK
- Thiết lập WebRTC connection với Azure Avatar endpoint
- Stream video từ avatar response

### 4. Tài liệu tham khảo

- [Azure Avatar Documentation](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/what-is-text-to-speech-avatar)
- [Real-time Avatar Synthesis](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/text-to-speech-avatar/real-time-synthesis-avatar)
- [Avatar API Reference](https://learn.microsoft.com/en-us/azure/ai-services/speech-service/rest-api/avatar)

### 5. Lưu ý

- Avatar realtime yêu cầu WebRTC connection
- Cần có HTTPS để chạy WebRTC (hoặc localhost)
- Avatar API có thể có chi phí bổ sung
- Hiện tại code đã có text-to-speech fallback nếu avatar không khả dụng
