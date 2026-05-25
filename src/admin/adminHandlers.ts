import { InlineKeyboard } from 'grammy';
import { MODELS, getMergedColors, getSetPrices } from '../config/catalog';
import { isItemAvailable, setOverride, getRecentPaidOrders, getStats, deleteCustomColor, getUserRole, getBotUsers, removeBotUser } from '../db/database';
import { adminEditState } from './adminScenes';

function buildAdminMainKeyboard() {
  return new InlineKeyboard()
    .text('🎨 Управление цветами', 'admin_colors').row()
    .text('📦 Управление моделями', 'admin_models').row()
    .text('💰 Управление ценами', 'admin_prices').row()
    .text('📝 Контент и Тексты', 'admin_content').row()
    .text('💳 Настройки оплаты', 'admin_payment').row()
    .text('👥 Управление доступом', 'admin_users').row()
    .text('📋 Последние заказы', 'admin_recent_orders').row()
    .text('📊 Статистика', 'admin_stats');
}

function buildColorKeyboard() {
  const keyboard = new InlineKeyboard();
  const colors = getMergedColors();
  let i = 0;
  colors.forEach(color => {
    const available = isItemAvailable('color', color.id, color.available);
    keyboard.text(
      `${available ? '✅' : '⛔'} ${color.name}`,
      `admin_toggle_color_${color.id}`
    );
    i++;
    if (i % 2 === 0) keyboard.row();
  });
  if (i % 2 !== 0) keyboard.row();
  keyboard.text('➕ Добавить цвет', 'admin_add_color').row();
  keyboard.text('🗑 Удалить добавленный цвет', 'admin_delete_color_menu').row();
  keyboard.text('🔙 Назад', 'admin_main');
  return keyboard;
}

function buildModelKeyboard() {
  const keyboard = new InlineKeyboard();
  MODELS.forEach(model => {
    const available = isItemAvailable('model', model.id, true);
    keyboard.text(
      `${available ? '✅' : '⛔'} ${model.name}`,
      `admin_toggle_model_${model.id}`
    ).row();
  });
  keyboard.text('🔙 Назад', 'admin_main');
  return keyboard;
}

function buildPricesKeyboard() {
  const { price1, price2 } = getSetPrices();
  const keyboard = new InlineKeyboard();
  keyboard.text(`Изменить цену 1 комплекта (${price1}₽)`, `admin_set_price_global_set_1`).row();
  keyboard.text(`Изменить цену 2 комплектов (${price2}₽)`, `admin_set_price_global_set_2`).row();
  keyboard.text('🔙 Назад', 'admin_main');
  return keyboard;
}

function buildContentKeyboard() {
  const keyboard = new InlineKeyboard();
  const steps = [
    { id: 'step_quantity', name: 'Шаг 1: Количество' },
    { id: 'step_model', name: 'Шаг 2: Выбор модели' },
    { id: 'step_bublik_height', name: 'Бублик: Высота' },
    { id: 'step_bublik_volume', name: 'Бублик: Объём' },
    { id: 'step_palette', name: 'Бублик: Цвет' },
    { id: 'step_lemon_size', name: 'Лимон: Размер' },
    { id: 'step_lemon_top_color', name: 'Лимон: Цвет верха' },
    { id: 'step_lemon_bot_color', name: 'Лимон: Цвет низа' },
    { id: 'step_summary', name: 'Финальный шаг: Оплата' },
  ];
  
  steps.forEach(s => {
    keyboard.text(`Редактировать: ${s.name}`, `admin_edit_content_${s.id}`).row();
  });
  
  keyboard.text('🔙 Назад', 'admin_main');
  return keyboard;
}

function buildPaymentKeyboard() {
  const paymentMode = require('../db/database').getSetting('payment_mode', 'yookassa');
  const keyboard = new InlineKeyboard();
  keyboard.text(`Режим: ${paymentMode === 'yookassa' ? '🟢 ЮKassa' : '🔴 Реквизиты'} (изменить)`, 'admin_toggle_payment').row();
  if (paymentMode === 'manual') {
    keyboard.text('Изменить реквизиты', 'admin_edit_requisites').row();
  }
  keyboard.text('🔙 Назад', 'admin_main');
  return keyboard;
}

export function setupAdminHandlers(bot: any) {
  const adminMiddleware = async (ctx: any, next: any) => {
    const userId = ctx.from?.id.toString();
    const role = getUserRole(userId);
    if (role !== 'admin') {
      if (role === 'manager' && (ctx.callbackQuery?.data === 'admin_recent_orders' || ctx.callbackQuery?.data === 'admin_main')) {
        // Managers can only see recent orders
        await next();
      } else if (role === 'manager') {
        await ctx.answerCallbackQuery('У вас нет прав на это действие.').catch(() => {});
      }
      return;
    }
    await next();
  };

  const managerMenu = new InlineKeyboard().text('📋 Последние заказы', 'admin_recent_orders');

  bot.command('admin', async (ctx: any) => {
    const role = getUserRole(ctx.from?.id.toString());
    if (role === 'admin') {
      await ctx.reply('🛠 Панель администратора', { reply_markup: buildAdminMainKeyboard() });
    } else if (role === 'manager') {
      await ctx.reply('👋 Панель менеджера', { reply_markup: managerMenu });
    }
  });

  bot.callbackQuery('admin_main', adminMiddleware, async (ctx: any) => {
    const role = getUserRole(ctx.from?.id.toString());
    if (role === 'admin') {
      await ctx.editMessageText('🛠 Панель администратора', { reply_markup: buildAdminMainKeyboard() });
    } else if (role === 'manager') {
      await ctx.editMessageText('👋 Панель менеджера', { reply_markup: managerMenu });
    }
  });

  bot.callbackQuery('admin_colors', adminMiddleware, async (ctx: any) => {
    await ctx.editMessageText('🎨 Управление цветами (нажмите для переключения статуса):', {
      reply_markup: buildColorKeyboard()
    });
  });

  bot.callbackQuery('admin_models', adminMiddleware, async (ctx: any) => {
    await ctx.editMessageText('📦 Управление моделями (нажмите для переключения статуса):', {
      reply_markup: buildModelKeyboard()
    });
  });

  bot.callbackQuery('admin_prices', adminMiddleware, async (ctx: any) => {
    await ctx.editMessageText('💰 Управление ценами:', {
      reply_markup: buildPricesKeyboard()
    });
  });

  bot.callbackQuery('admin_content', adminMiddleware, async (ctx: any) => {
    await ctx.editMessageText('📝 Управление текстами, фотографиями и кнопками:', {
      reply_markup: buildContentKeyboard()
    });
  });

  bot.callbackQuery('admin_payment', adminMiddleware, async (ctx: any) => {
    await ctx.editMessageText('💳 Настройки оплаты:', {
      reply_markup: buildPaymentKeyboard()
    });
  });

  bot.callbackQuery('admin_toggle_payment', adminMiddleware, async (ctx: any) => {
    const current = require('../db/database').getSetting('payment_mode', 'yookassa');
    require('../db/database').setSetting('payment_mode', current === 'yookassa' ? 'manual' : 'yookassa');
    await ctx.editMessageReplyMarkup({ reply_markup: buildPaymentKeyboard() });
    await ctx.answerCallbackQuery('Режим оплаты изменён');
  });

  bot.callbackQuery('admin_edit_requisites', adminMiddleware, async (ctx: any) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('adminPaymentSettingsScene');
  });

  bot.callbackQuery(/^admin_edit_content_(.+)$/, adminMiddleware, async (ctx: any) => {
    await ctx.answerCallbackQuery();
    adminEditState.set(ctx.from.id, { type: 'content', id: ctx.match[1] });
    await ctx.conversation.enter('adminEditContentScene');
  });



  bot.callbackQuery(/^admin_toggle_color_(.+)$/, adminMiddleware, async (ctx: any) => {
    const colorId = ctx.match[1];
    const colors = getMergedColors();
    const targetColor = colors.find(c => c.id === colorId);
    if (targetColor) {
      const current = isItemAvailable('color', colorId, targetColor.available);
      setOverride('color', colorId, !current);
      await ctx.editMessageReplyMarkup({ reply_markup: buildColorKeyboard() });
      await ctx.answerCallbackQuery('Статус цвета обновлён');
    }
  });

  bot.callbackQuery(/^admin_toggle_model_(.+)$/, adminMiddleware, async (ctx: any) => {
    const modelId = ctx.match[1];
    const defaultModel = MODELS.find(m => m.id === modelId);
    if (defaultModel) {
      const current = isItemAvailable('model', modelId, true);
      setOverride('model', modelId, !current);
      await ctx.editMessageReplyMarkup({ reply_markup: buildModelKeyboard() });
      await ctx.answerCallbackQuery('Статус модели обновлён');
    }
  });

  bot.callbackQuery('admin_delete_color_menu', adminMiddleware, async (ctx: any) => {
    const keyboard = new InlineKeyboard();
    const colors = getMergedColors();
    // Only show colors not in static COLORS config to avoid deleting built-ins
    const customColors = colors.filter(c => !require('../config/catalog').COLORS.find((bc: any) => bc.id === c.id));
    
    if (customColors.length === 0) {
      await ctx.answerCallbackQuery('Нет добавленных вручную цветов для удаления');
      return;
    }

    customColors.forEach(c => {
      keyboard.text(`🗑 Удалить ${c.name}`, `admin_delete_color_${c.id}`).row();
    });
    keyboard.text('🔙 Назад', 'admin_colors');
    await ctx.editMessageText('Выберите цвет для полного удаления:', { reply_markup: keyboard });
  });

  bot.callbackQuery(/^admin_delete_color_(.+)$/, adminMiddleware, async (ctx: any) => {
    const colorId = ctx.match[1];
    deleteCustomColor(colorId);
    await ctx.editMessageText('🎨 Управление цветами (нажмите для переключения статуса):', { reply_markup: buildColorKeyboard() });
    await ctx.answerCallbackQuery('Цвет удалён');
  });

  bot.callbackQuery('admin_add_color', adminMiddleware, async (ctx: any) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('adminAddColorScene');
  });

  bot.callbackQuery('admin_users', adminMiddleware, async (ctx: any) => {
    const keyboard = new InlineKeyboard();
    const users = getBotUsers();
    users.forEach(u => {
      keyboard.text(`🗑 Удалить ${u.role}: ${u.id}`, `admin_delete_user_${u.id}`).row();
    });
    keyboard.text('➕ Добавить пользователя', 'admin_add_user').row();
    keyboard.text('🔙 Назад', 'admin_main');
    await ctx.editMessageText('👥 Управление доступом:', { reply_markup: keyboard });
  });

  bot.callbackQuery(/^admin_delete_user_(.+)$/, adminMiddleware, async (ctx: any) => {
    const targetId = ctx.match[1];
    if (targetId === ctx.from?.id.toString()) {
      await ctx.answerCallbackQuery('Нельзя удалить самого себя!');
      return;
    }
    removeBotUser(targetId);
    
    // Refresh menu
    const keyboard = new InlineKeyboard();
    const users = getBotUsers();
    users.forEach(u => {
      keyboard.text(`🗑 Удалить ${u.role}: ${u.id}`, `admin_delete_user_${u.id}`).row();
    });
    keyboard.text('➕ Добавить пользователя', 'admin_add_user').row();
    keyboard.text('🔙 Назад', 'admin_main');
    await ctx.editMessageText('Пользователь удалён.\n\n👥 Управление доступом:', { reply_markup: keyboard });
    await ctx.answerCallbackQuery('Пользователь удалён');
  });

  bot.callbackQuery('admin_add_user', adminMiddleware, async (ctx: any) => {
    await ctx.answerCallbackQuery();
    await ctx.conversation.enter('adminAddUserScene');
  });

  bot.callbackQuery(/^admin_set_price_(global)_(.+)$/, adminMiddleware, async (ctx: any) => {
    await ctx.answerCallbackQuery();
    adminEditState.set(ctx.from.id, { type: ctx.match[1], id: ctx.match[2] });
    await ctx.conversation.enter('adminChangePriceScene');
  });

  bot.callbackQuery('admin_recent_orders', adminMiddleware, async (ctx: any) => {
    const orders = getRecentPaidOrders(10);
    const keyboard = new InlineKeyboard().text('🔙 Назад', 'admin_main');
    if (orders.length === 0) {
      await ctx.editMessageText('📋 Нет оплаченных заказов', { reply_markup: keyboard });
      return;
    }
    
    let text = '📋 Последние 10 оплаченных заказов:\n\n';
    orders.forEach(o => {
      text += `#${o.id} - @${o.username || o.userId} - ${o.totalPrice}₽\n`;
      if (o.itemsJson) {
        try {
          const items = JSON.parse(o.itemsJson);
          text += `Комплектов: ${items.length}\n`;
        } catch(e) {}
      } else {
        text += `${o.model}, ${o.height}, ${o.volume}, ${o.color}\n`;
      }
      text += `\n`;
    });

    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });

  bot.callbackQuery('admin_stats', adminMiddleware, async (ctx: any) => {
    const stats = getStats();
    const text = `📊 Статистика:\n\nВсего оплаченных заказов: ${stats.totalOrders}\nОбщая выручка: ${stats.totalRevenue} ₽`;
    const keyboard = new InlineKeyboard().text('🔙 Назад', 'admin_main');
    await ctx.editMessageText(text, { reply_markup: keyboard });
    await ctx.answerCallbackQuery();
  });
}
