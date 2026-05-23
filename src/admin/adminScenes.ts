import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard } from 'grammy';
import { MyContext } from '../bot';
import { addCustomColor, setCustomPrice, addBotUser } from '../db/database';
import crypto from 'crypto';

type MyConversation = Conversation<MyContext>;

export const adminEditState = new Map<number, { type: string, id: string }>();

export async function adminAddColorScene(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply('Введите название нового цвета:', {
    reply_markup: new InlineKeyboard().text('Отмена', 'admin_cancel_scene')
  });

  const response = await conversation.waitFor(['message:text', 'callback_query:data'], {
    otherwise: async (ctx) => {
      await ctx.reply('Пожалуйста, отправьте текст с названием цвета или нажмите "Отмена".');
    }
  });

  if (response.callbackQuery?.data === 'admin_cancel_scene') {
    await response.answerCallbackQuery();
    await ctx.reply('Добавление отменено.', { reply_markup: new InlineKeyboard().text('В админку', 'admin_main') });
    return;
  }

  const colorName = response.message?.text?.trim() || '';
  if (!colorName) {
    if (response.callbackQuery) {
      await response.answerCallbackQuery('Сначала завершите текущее действие!');
    } else {
      await ctx.reply('Имя не может быть пустым. Попробуйте еще раз: /admin');
    }
    return;
  }
  const colorId = crypto.randomBytes(4).toString('hex'); // short unique id

  addCustomColor(colorId, colorName);

  await ctx.reply(`Цвет "${colorName}" успешно добавлен!`, {
    reply_markup: new InlineKeyboard().text('🔙 Вернуться в админку', 'admin_main')
  });
}

export async function adminChangePriceScene(conversation: MyConversation, ctx: MyContext) {
  const state = adminEditState.get(ctx.from!.id);
  const type = state?.type;
  const id = state?.id;

  if (!type || !id) {
    await ctx.reply('Ошибка: не переданы данные для изменения цены.');
    return;
  }

  await ctx.reply('Введите новую цену (только число):', {
    reply_markup: new InlineKeyboard().text('Отмена', 'admin_cancel_scene')
  });

  let newPrice: number = 0;

  while (true) {
    const response = await conversation.waitFor(['message:text', 'callback_query:data'], {
      otherwise: async (ctx) => {
        await ctx.reply('Пожалуйста, отправьте число или нажмите "Отмена".');
      }
    });

    if (response.callbackQuery?.data === 'admin_cancel_scene') {
      await response.answerCallbackQuery();
      await ctx.reply('Изменение цены отменено.', { reply_markup: new InlineKeyboard().text('В админку', 'admin_main') });
      return;
    }

    const priceText = response.message?.text?.trim() || '';
    newPrice = parseInt(priceText, 10);

    if (isNaN(newPrice) || newPrice < 0) {
      if (response.callbackQuery) {
        await response.answerCallbackQuery('Сначала завершите или отмените текущее действие!');
      } else {
        await ctx.reply('Пожалуйста, введите корректное положительное число.');
      }
      continue;
    }
    break;
  }

  const dbItemType = type === 'height' ? 'height' : (type === 'global' ? 'global' : 'volume_model');
  setCustomPrice(dbItemType, id, newPrice);

  await ctx.reply(`Цена успешно обновлена на ${newPrice}₽!`, {
    reply_markup: new InlineKeyboard().text('🔙 Вернуться в админку', 'admin_main')
  });
}

export async function adminAddUserScene(conversation: MyConversation, ctx: MyContext) {
  await ctx.reply('Введите Telegram ID нового сотрудника (только цифры):', {
    reply_markup: new InlineKeyboard().text('Отмена', 'admin_cancel_scene')
  });

  let newUserId = '';
  while (true) {
    const response = await conversation.waitFor(['message:text', 'callback_query:data'], {
      otherwise: async (ctx) => {
        await ctx.reply('Пожалуйста, отправьте число (ID пользователя) или нажмите "Отмена".');
      }
    });

    if (response.callbackQuery?.data === 'admin_cancel_scene') {
      await response.answerCallbackQuery();
      await ctx.reply('Добавление отменено.', { reply_markup: new InlineKeyboard().text('В админку', 'admin_main') });
      return;
    }

    newUserId = response.message?.text?.trim() || '';
    if (!/^\\d+$/.test(newUserId)) {
      if (response.callbackQuery) {
        await response.answerCallbackQuery('Сначала завершите текущее действие!');
      } else {
        await ctx.reply('Пожалуйста, введите корректный числовой ID.');
      }
      continue;
    }
    break;
  }

  await ctx.reply('Выберите роль для этого пользователя:', {
    reply_markup: new InlineKeyboard()
      .text('Администратор', 'role_admin')
      .text('Менеджер', 'role_manager').row()
      .text('Отмена', 'admin_cancel_scene')
  });

  const roleResponse = await conversation.waitForCallbackQuery(/^(role_admin|role_manager|admin_cancel_scene)$/);
  
  if (roleResponse.callbackQuery.data === 'admin_cancel_scene') {
    await roleResponse.answerCallbackQuery();
    await ctx.reply('Добавление отменено.', { reply_markup: new InlineKeyboard().text('В админку', 'admin_main') });
    return;
  }

  const role = roleResponse.callbackQuery.data === 'role_admin' ? 'admin' : 'manager';
  await roleResponse.answerCallbackQuery();
  addBotUser(newUserId, role);

  await ctx.reply(`Пользователь ${newUserId} добавлен с ролью ${role}!`, {
    reply_markup: new InlineKeyboard().text('🔙 Вернуться в админку', 'admin_main')
  });
}
