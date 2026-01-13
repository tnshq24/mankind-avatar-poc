import express from 'express';
import { getSpeechToken, getAvatarIceServers } from '../services/speech.js';

const router = express.Router();

router.get('/token', async (req, res) => {
  try {
    const credentials = await getSpeechToken();
    res.json(credentials);
  } catch (error) {
    console.error('Error getting speech token:', error);
    res.status(500).json({ error: error.message || 'Failed to get speech token' });
  }
});

router.get('/ice-token', async (req, res) => {
  try {
    const ice = await getAvatarIceServers();
    res.json(ice);
  } catch (error) {
    console.error('Error getting avatar ICE token:', error);
    res
      .status(500)
      .json({ error: error.message || 'Failed to fetch avatar ICE token' });
  }
});

export { router as speechRouter };
