import { bot } from './src/bot';
import { Bot, Context } from 'grammy';
// we can simulate an update by calling bot.handleUpdate
const update = {
  update_id: 1,
  callback_query: {
    id: '1',
    from: { id: 123, is_bot: false, first_name: 'Test' },
    message: {
      message_id: 1,
      date: 1,
      chat: { id: 123, type: 'private' }
    },
    chat_instance: '1',
    data: 'admin_set_price_global_set_1'
  }
};

// mock getBotUsers so adminMiddleware passes
import * as db from './src/db/database';
(db as any).getUserRole = () => 'admin';
(db as any).getCustomPrices = () => [];
(db as any).getOverrides = () => [];

bot.handleUpdate(update as any).then(() => {
  console.log('Update handled');
  process.exit(0);
}).catch(console.error);
