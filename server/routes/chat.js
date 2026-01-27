import express from 'express';
import { askDataAgentViaPython } from '../services/pythonBridge.js';

const router = express.Router();

router.post('/', async (req, res) => {
  try {
    const { message, language } = req.body;
    
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const response = await askDataAgentViaPython(message, language);
    res.json({ response });
  } catch (error) {
    console.error('Error in chat route:', error);
    res.status(500).json({ error: error.message || 'Internal server error' });
  }
});

export { router as chatRouter };
