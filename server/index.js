import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { chatRouter } from './routes/chat.js';
import { speechRouter } from './routes/speech.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
app.use(express.json());
app.use(express.static('public'));

// Routes
app.use('/api/chat', chatRouter);
app.use('/api/speech', speechRouter);

app.listen(PORT, () => {
  console.log(`Server running at http://localhost:${PORT}`);
});
