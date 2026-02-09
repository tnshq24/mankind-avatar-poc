import express from 'express';
import { askDataAgentViaPython } from '../services/pythonBridge.js';

const router = express.Router();

// router.post('/', async (req, res) => {
//   try {
//     const { message, language } = req.body;

//     if (!message) {
//       return res.status(400).json({ error: 'Message is required' });
//     }

//     const response = await askDataAgentViaPython(message, language);
//     res.json({ response });
//   } catch (error) {
//     console.error('Error in chat route:', error);
//     res.status(500).json({ error: error.message || 'Internal server error' });
//   }
// });

router.post('/', async (req, res) => {
  try {
    const { question, session_id } = req.body;

    const authHeader = req.headers.authorization;
    const token = authHeader?.startsWith('Bearer ')
      ? authHeader.slice(7)
      : null;

      console.log('=== DEBUG Chat Route ===' , { question, session_id, token: token ? '***REDACTED***' : null });
    

    console.log('Received chat request:', { question, session_id, token });
    if (!question || !session_id || !token) {
      return res.status(400).json({
        error: 'question, session_id and token are required'
      });
    }
    //Pyhton backend url
    const response = await fetch(
      'https://gstreportchatbotbackend-awctfkedhuhchkgw.centralindia-01.azurewebsites.net/api/v1/chat',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          message: question,
          session_id,
          token
        })
      }
    );

    console.log('Chat route response status:', response.status);
    if (!response.ok) {
      const text = await response.text();
      throw new Error(text);
    }

    const data = await response.json();
    console.log('Chat route response data:', data);

    // 🔑 IMPORTANT: forward full backend response
    res.json(data);

  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({
      error: error.message || 'Internal server error'
    });
  }
});


export { router as chatRouter };
