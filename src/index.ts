import 'dotenv/config';
import express from 'express';
import { webhookCallback } from 'grammy';
import { bot } from './bot';
import { handleYookassaWebhook } from './handlers/payment';

const app = express();
app.use(express.json());

const PORT = process.env.PORT || 3000;
const WEBHOOK_URL = process.env.WEBHOOK_URL;

// Keep-alive endpoint for Render
app.get('/ping', (req, res) => {
  res.status(200).send('OK');
});

// YooKassa webhook endpoint
app.post('/yookassa-webhook', handleYookassaWebhook);

// Start Server & Bot
async function start() {
  if (WEBHOOK_URL) {
    // Webhook mode
    app.use('/webhook', webhookCallback(bot, 'express'));
    
    app.listen(PORT, async () => {
      console.log(`Server is running on port ${PORT}`);
      await bot.api.setWebhook(`${WEBHOOK_URL}/webhook`);
      console.log(`Bot webhook set to ${WEBHOOK_URL}/webhook`);
      
      // Ping itself every 14 minutes to prevent Render free tier from sleeping
      setInterval(() => {
        fetch(`${WEBHOOK_URL}/ping`)
          .then(() => console.log('Pinged self to stay awake'))
          .catch(e => console.error('Ping failed:', e));
      }, 14 * 60 * 1000);
    });
  } else {
    // Long polling mode (easier for local testing)
    app.listen(PORT, () => {
      console.log(`Server is running on port ${PORT} for YooKassa webhooks`);
    });
    
    console.log('Starting bot in long-polling mode...');
    await bot.api.deleteWebhook();
    bot.start();
  }
}

start().catch(console.error);
