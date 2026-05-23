import { Request, Response } from 'express';
import { getOrder, markPaid } from '../db/database';
import { appendToSheet } from '../services/sheets';
import { bot } from '../bot';

export async function handleYookassaWebhook(req: Request, res: Response) {
  const event = req.body;

  // In a production environment, validate YooKassa signature/IPs here

  if (event.event === 'payment.succeeded') {
    const { orderId, telegramUserId } = event.object.metadata;
    
    console.log(`Payment succeeded for order ${orderId}`);
    
    const order = getOrder(orderId);

    if (order && order.status !== 'paid') {
      // Mark order as paid in SQLite
      markPaid(orderId);

      // Notify user via Telegram bot
      try {
        await bot.api.sendMessage(
          telegramUserId,
          '✅ Оплата получена! Ваш заказ принят в работу.\n\nМы свяжемся с вами в ближайшее время.'
        );
      } catch (err) {
        console.error(`Failed to send payment confirmation to user ${telegramUserId}:`, err);
      }

      // Save lead to Google Sheets
      await appendToSheet(order);
    }
  }

  res.sendStatus(200);
}
