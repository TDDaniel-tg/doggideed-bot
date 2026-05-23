import { InlineKeyboard } from 'grammy';

export async function handleStart(ctx: any) {
  const welcomeText = `Добро пожаловать в Doggideed! 🐾

Мы создаём дизайнерские миски для собак ручной работы.
Соберите идеальную миску для вашего питомца прямо здесь.`;

  const keyboard = new InlineKeyboard().text('Собрать заказ', 'start_order');

  await ctx.reply(welcomeText, { reply_markup: keyboard });
}
