import { Conversation } from '@grammyjs/conversations';
import { InlineKeyboard, InputFile } from 'grammy';
import { MODELS, BUBLIK_HEIGHTS, BUBLIK_VOLUMES, LEMON_SIZES, getMergedColors, getSetPrices } from '../config/catalog';
import { createOrder, getContentBlock, getSetting } from '../db/database';
import { generateOrderDescription } from '../services/gemini';
import { createPayment } from '../services/yookassa';
import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { MyContext } from '../bot';

type MyConversation = Conversation<MyContext>;

async function safeReplyWithPhoto(ctx: MyContext, stepId: string, defaultPhotoName: string, defaultText: string, keyboard?: InlineKeyboard) {
  const block = getContentBlock(stepId);
  const text = block?.text || defaultText;
  
  let finalKeyboard = keyboard ? keyboard.clone() : new InlineKeyboard();
  if (block?.button_text && block?.button_url) {
    finalKeyboard.row().url(block.button_text, block.button_url);
  }
  const finalReplyMarkup = finalKeyboard.inline_keyboard.length > 0 ? finalKeyboard : undefined;

  if (block?.photo_id) {
    const photoIds = block.photo_id.split(',');
    try {
      if (photoIds.length > 1) {
        await ctx.replyWithMediaGroup(
          photoIds.map(id => ({
            type: 'photo',
            media: id
          }))
        );
        await ctx.reply(text, { reply_markup: finalReplyMarkup });
        return;
      } else {
        await ctx.replyWithPhoto(photoIds[0], { caption: text, reply_markup: finalReplyMarkup });
        return;
      }
    } catch (e) {
      console.error(`Failed to send custom photo ${block.photo_id} for step ${stepId}`);
    }
  }

  const photoPath = path.resolve(process.cwd(), 'src/assets/images', defaultPhotoName);
  try {
    if (fs.existsSync(photoPath)) {
      await ctx.replyWithPhoto(new InputFile(photoPath), { caption: text, reply_markup: finalReplyMarkup });
    } else {
      await ctx.reply(text, { reply_markup: finalReplyMarkup });
    }
  } catch (e) {
    await ctx.reply(text, { reply_markup: finalReplyMarkup });
  }
}

export async function orderScene(conversation: MyConversation, ctx: MyContext) {
  const { price1, price2 } = getSetPrices();
  const colors = getMergedColors();

  type Step = 'qty' | 'model' | 'bublik_height' | 'bublik_volume' | 'bublik_color' | 'lemon_size' | 'lemon_top' | 'lemon_bot' | 'summary';
  
  let step: Step = 'qty';
  let currentItem = 0;
  let quantity = 1;
  let totalPrice = price1;
  const items: any[] = [{}, {}];

  while (true) {
    if (step === 'qty') {
      const kb = new InlineKeyboard()
        .text(`1 комплект (${price1} ₽)`, 'qty_1').row()
        .text(`2 комплекта (${price2} ₽)`, 'qty_2').row()
        .text('Отмена', 'cancel_order');
      await safeReplyWithPhoto(ctx, 'step_quantity', 'quantity.jpg', 'Сколько комплектов вы хотите заказать?', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(qty_1|qty_2|cancel_order)$/);
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'cancel_order') {
        await ctx.reply('Заказ отменен.');
        return;
      }
      quantity = cbCtx.callbackQuery.data === 'qty_1' ? 1 : 2;
      totalPrice = quantity === 1 ? price1 : price2;
      step = 'model';
      currentItem = 0;
    }
    
    else if (step === 'model') {
      await ctx.reply(`🛠 Сборка комплекта №${currentItem + 1}`);
      const kb = new InlineKeyboard();
      MODELS.forEach(m => kb.text(m.name, `model_${m.id}`).row());
      if (currentItem === 0) kb.text('🔙 Назад', 'back_qty');
      else kb.text('🔙 Назад к пред. комплекту', 'back_prev_item');

      await safeReplyWithPhoto(ctx, 'step_model', 'models.jpg', 'Выберите модель миски:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(model_|back_)/);
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_qty') { step = 'qty'; continue; }
      if (cbCtx.callbackQuery.data === 'back_prev_item') {
        currentItem = 0;
        step = items[0].modelId === 'bublik' ? 'bublik_color' : 'lemon_bot';
        continue;
      }

      items[currentItem].modelId = cbCtx.callbackQuery.data.replace('model_', '');
      items[currentItem].model = MODELS.find(m => m.id === items[currentItem].modelId)!.name;
      step = items[currentItem].modelId === 'bublik' ? 'bublik_height' : 'lemon_size';
    }

    else if (step === 'bublik_height') {
      const kb = new InlineKeyboard();
      BUBLIK_HEIGHTS.forEach(h => kb.text(h.name, `height_${h.id}`).row());
      kb.text('🔙 Назад', 'back_model');

      await safeReplyWithPhoto(ctx, 'step_bublik_height', 'bublik_height.jpg', 'Выберите высоту подставки:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(height_|back_)/);
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_model') { step = 'model'; continue; }

      items[currentItem].heightId = cbCtx.callbackQuery.data.replace('height_', '');
      items[currentItem].height = BUBLIK_HEIGHTS.find(h => h.id === items[currentItem].heightId)!.name;
      step = 'bublik_volume';
    }

    else if (step === 'bublik_volume') {
      const kb = new InlineKeyboard();
      BUBLIK_VOLUMES.forEach(v => {
        if (v.id === '1700' && items[currentItem].heightId === '5rings') return;
        kb.text(v.name, `volume_${v.id}`).row();
      });
      kb.text('🔙 Назад', 'back_height');

      await safeReplyWithPhoto(ctx, 'step_bublik_volume', 'bublik_volume.jpg', 'Выберите объём чаши:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(volume_|back_)/);
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_height') { step = 'bublik_height'; continue; }

      items[currentItem].volumeId = cbCtx.callbackQuery.data.replace('volume_', '');
      items[currentItem].volume = BUBLIK_VOLUMES.find(v => v.id === items[currentItem].volumeId)!.name;
      step = 'bublik_color';
    }

    else if (step === 'bublik_color') {
      const kb = new InlineKeyboard();
      let rc = 0;
      colors.forEach(c => {
        if (c.available) kb.text(c.name, `color_${c.id}`);
        else kb.text(`⛔ ${c.name}`, 'color_unav');
        rc++;
        if (rc % 2 === 0) kb.row();
      });
      kb.row().text('🔙 Назад', 'back_volume');

      await safeReplyWithPhoto(ctx, 'step_palette', 'palette.jpg', 'Выберите цвет комплекта:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(color_|color_unav|back_)/);
      if (cbCtx.callbackQuery.data === 'color_unav') {
        await cbCtx.answerCallbackQuery('Этот цвет недоступен 😔');
        continue;
      }
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_volume') { step = 'bublik_volume'; continue; }

      items[currentItem].colorId = cbCtx.callbackQuery.data.replace('color_', '');
      items[currentItem].color = colors.find(c => c.id === items[currentItem].colorId)!.name;
      
      if (currentItem === 0 && quantity === 2) {
        currentItem = 1; step = 'model';
      } else {
        step = 'summary';
      }
    }

    else if (step === 'lemon_size') {
      const kb = new InlineKeyboard();
      LEMON_SIZES.forEach(s => kb.text(s.name, `size_${s.id}`).row());
      kb.text('🔙 Назад', 'back_model');

      await safeReplyWithPhoto(ctx, 'step_lemon_size', 'lemon_size.jpg', 'Выберите размер (высота + объём):', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(size_|back_)/);
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_model') { step = 'model'; continue; }

      items[currentItem].sizeId = cbCtx.callbackQuery.data.replace('size_', '');
      items[currentItem].size = LEMON_SIZES.find(s => s.id === items[currentItem].sizeId)!.name;
      step = 'lemon_top';
    }

    else if (step === 'lemon_top') {
      const kb = new InlineKeyboard();
      let rc = 0;
      colors.forEach(c => {
        if (c.available) kb.text(c.name, `top_${c.id}`);
        else kb.text(`⛔ ${c.name}`, 'top_unav');
        rc++;
        if (rc % 2 === 0) kb.row();
      });
      kb.row().text('🔙 Назад', 'back_size');

      await safeReplyWithPhoto(ctx, 'step_lemon_top_color', 'palette.jpg', 'Выберите цвет ВЕРХА:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(top_|top_unav|back_)/);
      if (cbCtx.callbackQuery.data === 'top_unav') {
        await cbCtx.answerCallbackQuery('Этот цвет недоступен 😔');
        continue;
      }
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_size') { step = 'lemon_size'; continue; }

      items[currentItem].topColorId = cbCtx.callbackQuery.data.replace('top_', '');
      items[currentItem].topColor = colors.find(c => c.id === items[currentItem].topColorId)!.name;
      step = 'lemon_bot';
    }

    else if (step === 'lemon_bot') {
      const kb = new InlineKeyboard();
      let rc = 0;
      colors.forEach(c => {
        if (c.available) kb.text(c.name, `bot_${c.id}`);
        else kb.text(`⛔ ${c.name}`, 'bot_unav');
        rc++;
        if (rc % 2 === 0) kb.row();
      });
      kb.row().text('🔙 Назад', 'back_top');

      await safeReplyWithPhoto(ctx, 'step_lemon_bot_color', 'palette.jpg', 'Выберите цвет НИЗА:', kb);
      const cbCtx = await conversation.waitForCallbackQuery(/^(bot_|bot_unav|back_)/);
      if (cbCtx.callbackQuery.data === 'bot_unav') {
        await cbCtx.answerCallbackQuery('Этот цвет недоступен 😔');
        continue;
      }
      await cbCtx.deleteMessage().catch(()=>null);
      if (cbCtx.callbackQuery.data === 'back_top') { step = 'lemon_top'; continue; }

      items[currentItem].botColorId = cbCtx.callbackQuery.data.replace('bot_', '');
      items[currentItem].bottomColor = colors.find(c => c.id === items[currentItem].botColorId)!.name;
      
      if (currentItem === 0 && quantity === 2) {
        currentItem = 1; step = 'model';
      } else {
        step = 'summary';
      }
    }

    else if (step === 'summary') {
      await ctx.reply('⏳ Формируем заказ и подготавливаем описание...');
      
      let summaryText = `🐾 Ваш заказ:\n\n`;
      const finalItems = items.slice(0, quantity);
      finalItems.forEach((item, index) => {
        summaryText += `🔹 Комплект ${index + 1}:\n`;
        if (item.modelId === 'bublik') {
          summaryText += `Модель: Бублик\nВысота: ${item.height}\nОбъём: ${item.volume}\nЦвет: ${item.color}\n\n`;
        } else {
          summaryText += `Модель: Как у Лимона\nРазмер: ${item.size}\nВерх: ${item.topColor}\nНиз: ${item.bottomColor}\n\n`;
        }
      });

      const orderDescription = await generateOrderDescription(finalItems);
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
        itemsJson: JSON.stringify(finalItems),
      });

      const paymentMode = getSetting('payment_mode', 'yookassa');
      
      if (paymentMode === 'manual') {
        const manualDetails = getSetting('manual_payment_details', 'Реквизиты для перевода пока не указаны.');
        summaryText += `\n\n💳 **Реквизиты для перевода:**\n${manualDetails}`;
        
        const kb = new InlineKeyboard()
          .text('Я оплатил ✅', `manual_paid_${orderId}`).row()
          .text('Изменить заказ', 'restart_order');
          
        await safeReplyWithPhoto(ctx, 'step_summary', 'summary.jpg', summaryText, kb);
      } else {
        const me = await ctx.api.getMe();
        const { url: paymentUrl, paymentId } = await createPayment({
          id: orderId,
          userId,
          username,
          model: quantity > 1 ? 'Сборный заказ (2 шт)' : finalItems[0].model,
          height: finalItems[0].height || finalItems[0].size || '',
          volume: finalItems[0].volume || '',
          color: finalItems[0].color || `${finalItems[0].topColor}/${finalItems[0].bottomColor}`,
          totalPrice,
          status: 'pending'
        }, me.username);
      
        const kb = new InlineKeyboard()
          .url(`Оплатить ${totalPrice} ₽`, paymentUrl).row()
          .text('Я оплатил ✅', `check_payment_${paymentId}_${orderId}`).row()
          .text('Изменить заказ', 'restart_order');
      
        await safeReplyWithPhoto(ctx, 'step_summary', 'summary.jpg', summaryText, kb);
      }
      return; // End of conversation
    }
  }
}
