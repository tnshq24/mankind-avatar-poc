import express from 'express';
import { getChatResponse } from '../services/openai.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await getChatResponse(message);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export { router as chatRouter };
