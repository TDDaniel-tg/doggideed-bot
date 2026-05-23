import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, InputFile } from 'grammy';
import { MODELS, BUBLIK_HEIGHTS, BUBLIK_VOLUMES, LEMON_SIZES, getMergedColors, getSetPrices } from '../config/catalog';
import { createOrder } from '../db/database';
import { generateOrderDescription } from '../services/gemini';
import { createPayment } from '../services/yookassa';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MyContext } from '../bot';

type MyConversation = Conversation<MyContext>;

async function safeReplyWithPhoto(ctx: MyContext, photoName: string, text: string, keyboard?: InlineKeyboard) {
  const photoPath = path.resolve(process.cwd(), 'src/assets/images', photoName);
  try {
    if (fs.existsSync(photoPath)) {
      await ctx.replyWithPhoto(new InputFile(photoPath), { caption: text, reply_markup: keyboard });
    } else {
      await ctx.reply(text, { reply_markup: keyboard });
    }
  } catch (e) {
    await ctx.reply(text, { reply_markup: keyboard });
  }
}

export async function orderScene(conversation: MyConversation, ctx: MyContext) {
  const { price1, price2 } = getSetPrices();

  // --- Step 0: Quantity ---
  const qtyKeyboard = new InlineKeyboard()
    .text(`1 комплект (${price1} ₽)`, 'qty_1').row()
    .text(`2 комплекта (${price2} ₽)`, 'qty_2').row()
    .text('Отмена', 'cancel_order');

  await safeReplyWithPhoto(ctx, 'quantity.jpg', 'Сколько комплектов вы хотите заказать?', qtyKeyboard);

  const qtyCtx = await conversation.waitForCallbackQuery(/^(qty_1|qty_2|cancel_order)$/, {
    otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите количество комплектов.'); },
  });
  
  if (qtyCtx.callbackQuery.data === 'cancel_order') {
    await qtyCtx.answerCallbackQuery();
    await qtyCtx.editMessageCaption({ caption: 'Заказ отменен.' }).catch(()=>qtyCtx.editMessageText('Заказ отменен.'));
    return;
  }

  const quantity = qtyCtx.callbackQuery.data === 'qty_1' ? 1 : 2;
  const totalPrice = quantity === 1 ? price1 : price2;
  await qtyCtx.answerCallbackQuery();
  await qtyCtx.editMessageCaption({ caption: `✅ Выбрано комплектов: ${quantity}` }).catch(()=>qtyCtx.editMessageText(`✅ Выбрано комплектов: ${quantity}`));

  const items: any[] = [];
  const colors = getMergedColors();

  for (let i = 1; i <= quantity; i++) {
    await ctx.reply(`🛠 Сборка комплекта №${i}`);
    
    // --- Model ---
    const modelKeyboard = new InlineKeyboard();
    MODELS.forEach(m => modelKeyboard.text(m.name, `model_${m.id}`).row());
    
    await safeReplyWithPhoto(ctx, 'models.jpg', 'Выберите модель миски:', modelKeyboard);
    const modelCtx = await conversation.waitForCallbackQuery(/^model_/, {
      otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите модель.'); },
    });
    const modelId = modelCtx.callbackQuery.data.replace('model_', '');
    const model = MODELS.find(m => m.id === modelId)!;
    await modelCtx.answerCallbackQuery();
    await modelCtx.editMessageCaption({ caption: `✅ Модель: ${model.name}` }).catch(()=>modelCtx.editMessageText(`✅ Модель: ${model.name}`));

    if (modelId === 'bublik') {
      // --- Bublik Height ---
      const heightKeyboard = new InlineKeyboard();
      BUBLIK_HEIGHTS.forEach(h => heightKeyboard.text(h.name, `height_${h.id}`).row());
      await safeReplyWithPhoto(ctx, 'bublik_height.jpg', 'Выберите высоту подставки:', heightKeyboard);
      const heightCtx = await conversation.waitForCallbackQuery(/^height_/, {
        otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите высоту.'); },
      });
      const heightId = heightCtx.callbackQuery.data.replace('height_', '');
      const height = BUBLIK_HEIGHTS.find(h => h.id === heightId)!;
      await heightCtx.answerCallbackQuery();
      await heightCtx.editMessageCaption({ caption: `✅ Высота: ${height.name}` }).catch(()=>heightCtx.editMessageText(`✅ Высота: ${height.name}`));

      // --- Bublik Volume ---
      const volumeKeyboard = new InlineKeyboard();
      BUBLIK_VOLUMES.forEach(v => {
        if (v.id === '1700' && heightId === '5rings') return; // exclude 1700 for 5 rings
        volumeKeyboard.text(v.name, `volume_${v.id}`).row();
      });
      await safeReplyWithPhoto(ctx, 'bublik_volume.jpg', 'Выберите объём чаши:', volumeKeyboard);
      const volumeCtx = await conversation.waitForCallbackQuery(/^volume_/, {
        otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите объём.'); },
      });
      const volumeId = volumeCtx.callbackQuery.data.replace('volume_', '');
      const volume = BUBLIK_VOLUMES.find(v => v.id === volumeId)!;
      await volumeCtx.answerCallbackQuery();
      await volumeCtx.editMessageCaption({ caption: `✅ Объём: ${volume.name}` }).catch(()=>volumeCtx.editMessageText(`✅ Объём: ${volume.name}`));

      // --- Bublik Color ---
      const colorKeyboard = new InlineKeyboard();
      let rowCount = 0;
      colors.forEach(c => {
        if (c.available) {
          colorKeyboard.text(c.name, `color_${c.id}`);
        } else {
          colorKeyboard.text(`⛔ ${c.name}`, 'color_unav');
        }
        rowCount++;
        if (rowCount % 2 === 0) colorKeyboard.row();
      });

      await safeReplyWithPhoto(ctx, 'palette.jpg', 'Выберите цвет комплекта:', colorKeyboard);
      let colorId = '';
      while (true) {
        const colorCtx = await conversation.waitForCallbackQuery(/^(color_|color_unav)/, {
          otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите цвет.'); },
        });
        if (colorCtx.callbackQuery.data === 'color_unav') {
          await colorCtx.answerCallbackQuery('Этот цвет временно недоступен 😔');
          continue;
        }
        colorId = colorCtx.callbackQuery.data.replace('color_', '');
        await colorCtx.answerCallbackQuery();
        const colorName = colors.find(c => c.id === colorId)!.name;
        await colorCtx.editMessageCaption({ caption: `✅ Цвет: ${colorName}` }).catch(()=>colorCtx.editMessageText(`✅ Цвет: ${colorName}`));
        break;
      }
      const color = colors.find(c => c.id === colorId)!;

      items.push({
        model: model.name,
        height: height.name,
        volume: volume.name,
        color: color.name
      });
    } else {
      // --- Lemon Size ---
      const sizeKeyboard = new InlineKeyboard();
      LEMON_SIZES.forEach(s => sizeKeyboard.text(s.name, `size_${s.id}`).row());
      await safeReplyWithPhoto(ctx, 'lemon_size.jpg', 'Выберите размер (высота + объём):', sizeKeyboard);
      const sizeCtx = await conversation.waitForCallbackQuery(/^size_/, {
        otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите размер.'); },
      });
      const sizeId = sizeCtx.callbackQuery.data.replace('size_', '');
      const size = LEMON_SIZES.find(s => s.id === sizeId)!;
      await sizeCtx.answerCallbackQuery();
      await sizeCtx.editMessageCaption({ caption: `✅ Размер: ${size.name}` }).catch(()=>sizeCtx.editMessageText(`✅ Размер: ${size.name}`));

      const createColorKeyboard = (prefix: string) => {
        const kb = new InlineKeyboard();
        let rc = 0;
        colors.forEach(c => {
          if (c.available) {
            kb.text(c.name, `${prefix}_${c.id}`);
          } else {
            kb.text(`⛔ ${c.name}`, `${prefix}_unav`);
          }
          rc++;
          if (rc % 2 === 0) kb.row();
        });
        return kb;
      };

      // --- Lemon Top Color ---
      await safeReplyWithPhoto(ctx, 'palette.jpg', 'Выберите цвет ВЕРХА:', createColorKeyboard('top'));
      let topColorId = '';
      while (true) {
        const topColorCtx = await conversation.waitForCallbackQuery(/^(top_.+|top_unav)$/, {
          otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите цвет верха.'); },
        });
        if (topColorCtx.callbackQuery.data === 'top_unav') {
          await topColorCtx.answerCallbackQuery('Этот цвет временно недоступен 😔');
          continue;
        }
        topColorId = topColorCtx.callbackQuery.data.replace('top_', '');
        await topColorCtx.answerCallbackQuery();
        const colorName = colors.find(c => c.id === topColorId)!.name;
        await topColorCtx.editMessageCaption({ caption: `✅ Цвет верха: ${colorName}` }).catch(()=>topColorCtx.editMessageText(`✅ Цвет верха: ${colorName}`));
        break;
      }
      const topColor = colors.find(c => c.id === topColorId)!;

      // --- Lemon Bottom Color ---
      await safeReplyWithPhoto(ctx, 'palette.jpg', 'Выберите цвет НИЗА:', createColorKeyboard('bot'));
      let botColorId = '';
      while (true) {
        const botColorCtx = await conversation.waitForCallbackQuery(/^(bot_.+|bot_unav)$/, {
          otherwise: async (ctx) => { await ctx.reply('Пожалуйста, выберите цвет низа.'); },
        });
        if (botColorCtx.callbackQuery.data === 'bot_unav') {
          await botColorCtx.answerCallbackQuery('Этот цвет временно недоступен 😔');
          continue;
        }
        botColorId = botColorCtx.callbackQuery.data.replace('bot_', '');
        await botColorCtx.answerCallbackQuery();
        const colorName = colors.find(c => c.id === botColorId)!.name;
        await botColorCtx.editMessageCaption({ caption: `✅ Цвет низа: ${colorName}` }).catch(()=>botColorCtx.editMessageText(`✅ Цвет низа: ${colorName}`));
        break;
      }
      const botColor = colors.find(c => c.id === botColorId)!;

      items.push({
        model: model.name,
        size: size.name,
        topColor: topColor.name,
        bottomColor: botColor.name
      });
    }
  }

  // --- Summary ---
  await ctx.reply('⏳ Формируем заказ и подготавливаем описание...');
  
  let summaryText = `🐾 Ваш заказ:\n\n`;
  items.forEach((item, index) => {
    summaryText += `🔹 Комплект ${index + 1}:\n`;
    if (item.model === 'Бублик') {
      summaryText += `Модель: Бублик\nВысота: ${item.height}\nОбъём: ${item.volume}\nЦвет: ${item.color}\n\n`;
    } else {
      summaryText += `Модель: Как у Лимона\nРазмер: ${item.size}\nВерх: ${item.topColor}\nНиз: ${item.bottomColor}\n\n`;
    }
  });

  // Call Gemini for descriptions
  const orderDescription = await generateOrderDescription(items);
  summaryText += `✨ ${orderDescription}\n\n`;
  summaryText += `💰 Итого к оплате: ${totalPrice} ₽`;

  const orderId = crypto.randomBytes(4).toString('hex');
  const userId = ctx.from?.id!;
  const username = ctx.from?.username;

  createOrder({
    id: orderId,
    userId,
    username,
    totalPrice,
    itemsJson: JSON.stringify(items),
  });

  const me = await ctx.api.getMe();
  const { url: paymentUrl, paymentId } = await createPayment({
    id: orderId,
    userId,
    username,
    model: quantity > 1 ? 'Сборный заказ (2 шт)' : items[0].model,
    height: items[0].height || items[0].size || '',
    volume: items[0].volume || '',
    color: items[0].color || `${items[0].topColor}/${items[0].bottomColor}`,
    totalPrice,
    status: 'pending'
  }, me.username);

  const paymentKeyboard = new InlineKeyboard()
    .url(`Оплатить ${totalPrice} ₽`, paymentUrl).row()
    .text('Я оплатил ✅', `check_payment_${paymentId}_${orderId}`).row()
    .text('Изменить заказ', 'restart_order');

  await safeReplyWithPhoto(ctx, 'summary.jpg', summaryText, paymentKeyboard);
}
