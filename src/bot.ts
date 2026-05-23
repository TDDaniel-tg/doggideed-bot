import { Bot, Context, session, SessionFlavor } from 'grammy';
import { conversations, createConversation, ConversationFlavor } from '@grammyjs/conversations';
import { handleStart } from './handlers/start';
import { setupAdminHandlers } from './admin/adminHandlers';
import { orderScene } from './scenes/orderScene';
import { adminAddColorScene, adminChangePriceScene, adminAddUserScene } from './admin/adminScenes';
import { checkPayment } from './services/yookassa';
import { getOrder, markPaid, getAllStaffIds } from './db/database';
import { appendToSheet } from './services/sheets';

export type MyContext = Context & SessionFlavor<any> & ConversationFlavor<Context>;

const token = process.env.BOT_TOKEN;

if (!token) {
  console.error('BOT_TOKEN is not set. Exiting.');
  process.exit(1);
}

export const bot = new Bot<MyContext>(token);

// Middleware
bot.use(session({ initial: () => ({}) }));
bot.use(conversations());
// @ts-ignore
bot.use(createConversation(orderScene));
// @ts-ignore
bot.use(createConversation(adminAddColorScene));
// @ts-ignore
bot.use(createConversation(adminChangePriceScene));
// @ts-ignore
bot.use(createConversation(adminAddUserScene));

// Handlers
bot.command('start', handleStart);

bot.callbackQuery('start_order', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.conversation.enter('orderScene');
});

bot.callbackQuery('restart_order', async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.conversation.enter('orderScene');
});

bot.callbackQuery(/^check_payment_(.+)_(.+)$/, async (ctx) => {
  const paymentId = ctx.match[1];
  const orderId = ctx.match[2];

  await ctx.answerCallbackQuery('Проверяем статус оплаты...');

  const isPaid = await checkPayment(paymentId);
  if (isPaid) {
    const order = getOrder(orderId);
    if (order && order.status !== 'paid') {
      markPaid(orderId);
      
      await ctx.editMessageText('✅ Оплата получена! Ваш заказ принят в работу.\n\nМы свяжемся с вами в ближайшее время.', { reply_markup: undefined }).catch(() => {});

      await appendToSheet(order);

      const staffIds = getAllStaffIds();
      let notificationText = `🔔 Новый оплаченный заказ #${order.id}\nПокупатель: @${order.username || order.userId}\n\nСумма: ${order.totalPrice} ₽\n\n`;
      if (order.itemsJson) {
        try {
          const items = JSON.parse(order.itemsJson);
          items.forEach((item: any, index: number) => {
            notificationText += `Комплект ${index + 1}:\n`;
            if (item.model === 'Бублик') {
              notificationText += `Модель: Бублик\nВысота: ${item.height}\nОбъём: ${item.volume}\nЦвет: ${item.color}\n\n`;
            } else {
              notificationText += `Модель: Как у Лимона\nРазмер: ${item.size}\nВерх: ${item.topColor}\nНиз: ${item.bottomColor}\n\n`;
            }
          });
        } catch(e) {}
      } else {
        notificationText += `Модель: ${order.model}\nВысота: ${order.height}\nОбъём: ${order.volume}\nЦвет: ${order.color}\n`;
      }
      for (const staffId of staffIds) {
        try {
          await ctx.api.sendMessage(staffId, notificationText);
        } catch (e) {
          console.error(`Failed to send notification to staff ${staffId}`, e);
        }
      }
    } else if (order?.status === 'paid') {
      await ctx.editMessageText('✅ Заказ уже оплачен.', { reply_markup: undefined }).catch(() => {});
    }
  } else {
    await ctx.reply('Оплата еще не поступила или обрабатывается. Пожалуйста, попробуйте нажать кнопку чуть позже.');
  }
});

setupAdminHandlers(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
});
