import { Bot, Context, session, SessionFlavor } from 'grammy';
import { conversations, createConversation, ConversationFlavor } from '@grammyjs/conversations';
import { handleStart } from './handlers/start';
import { setupAdminHandlers } from './admin/adminHandlers';
import { orderScene } from './scenes/orderScene';
import { adminAddColorScene, adminChangePriceScene, adminAddUserScene, adminEditContentScene, adminPaymentSettingsScene } from './admin/adminScenes';
import { checkPayment } from './services/yookassa';
import { getOrder, markPaid, getAllStaffIds, getUserRole } from './db/database';
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
// @ts-ignore
bot.use(createConversation(adminEditContentScene));
// @ts-ignore
bot.use(createConversation(adminPaymentSettingsScene));

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

bot.callbackQuery(/^manual_paid_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  const order = getOrder(orderId);
  
  if (!order) {
    await ctx.answerCallbackQuery('Заказ не найден.');
    return;
  }
  if (order.status === 'paid') {
    await ctx.editMessageText('✅ Заказ уже оплачен.', { reply_markup: undefined }).catch(() => {});
    return;
  }

  await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
  await ctx.reply('⏳ Спасибо! Мы проверяем поступление средств. Как только оплата подтвердится, менеджер свяжется с вами.');

  const staffIds = getAllStaffIds();
  let notificationText = `⚠️ **Ручное подтверждение оплаты**\nПользователь @${order.username || order.userId} нажал «Я оплатил» для заказа #${order.id} на сумму ${order.totalPrice}₽.\n\nПожалуйста, проверьте поступление средств по реквизитам.`;
  
  const keyboard = new InlineKeyboard().text('✅ Подтвердить оплату', `admin_confirm_payment_${orderId}`);

  for (const staffId of staffIds) {
    try {
      await ctx.api.sendMessage(staffId, notificationText, { reply_markup: keyboard });
    } catch (e) {
      console.error(`Failed to send notification to staff ${staffId}`, e);
    }
  }
});

bot.callbackQuery(/^admin_confirm_payment_(.+)$/, async (ctx) => {
  const orderId = ctx.match[1];
  
  // Check if admin
  const role = getUserRole(ctx.from?.id.toString());
  if (role !== 'admin' && role !== 'manager') {
    await ctx.answerCallbackQuery('У вас нет прав на это действие.');
    return;
  }

  const order = getOrder(orderId);
  if (!order) {
    await ctx.answerCallbackQuery('Заказ не найден.');
    return;
  }
  
  if (order.status === 'paid') {
    await ctx.answerCallbackQuery('Заказ уже был подтвержден.');
    await ctx.editMessageReplyMarkup({ reply_markup: undefined }).catch(() => {});
    return;
  }

  markPaid(orderId);
  await appendToSheet(order);
  
  await ctx.answerCallbackQuery('Оплата подтверждена!');
  await ctx.editMessageText(`✅ Оплата по заказу #${order.id} подтверждена администратором @${ctx.from?.username || ctx.from?.id}.`, { reply_markup: undefined }).catch(() => {});
  
  try {
    let text = `✅ Оплата по заказу #${order.id} подтверждена!\n\nВаш заказ принят в работу. Мы свяжемся с вами в ближайшее время.`;
    await ctx.api.sendMessage(order.userId, text);
  } catch (e) {
    console.error(`Failed to notify user ${order.userId} about payment confirmation`, e);
  }
});

setupAdminHandlers(bot);

bot.catch((err) => {
  const ctx = err.ctx;
  console.error(`Error while handling update ${ctx.update.update_id}:`);
  console.error(err.error);
});
