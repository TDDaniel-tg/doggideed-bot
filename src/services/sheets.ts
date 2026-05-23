import { google } from 'googleapis';
import { Order } from '../db/database';

export async function appendToSheet(order: Order) {
  const sheetId = process.env.GOOGLE_SHEETS_ID;
  const serviceAccountJson = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

  if (!sheetId || !serviceAccountJson) {
    console.warn('Google Sheets configuration is missing. Skipping lead capture.');
    return;
  }

  try {
    const credentials = JSON.parse(serviceAccountJson);

    const auth = new google.auth.GoogleAuth({
      credentials,
      scopes: ['https://www.googleapis.com/auth/spreadsheets'],
    });

    const sheets = google.sheets({ version: 'v4', auth });

    let modelDisplay = order.model || '';
    let detailsDisplay = `${order.height || ''}, ${order.volume || ''}, ${order.color || ''}`;

    if (order.itemsJson) {
      try {
        const items = JSON.parse(order.itemsJson);
        modelDisplay = `${items.length} шт.`;
        detailsDisplay = items.map((i: any, idx: number) => {
          if (i.model === 'Бублик') return `${idx+1}) Бублик: ${i.height}, ${i.volume}, ${i.color}`;
          return `${idx+1}) Лимон: ${i.size}, ${i.topColor}/${i.bottomColor}`;
        }).join(' | ');
      } catch(e) {}
    }

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: 'Лист1!A:G',
      valueInputOption: 'USER_ENTERED',
      requestBody: {
        values: [[
          new Date().toLocaleString('ru-RU'),
          order.userId.toString(),
          order.username ?? '',
          modelDisplay,
          detailsDisplay,
          order.totalPrice.toString(),
          order.id,
        ]]
      }
    });
    console.log(`Successfully appended order ${order.id} to Google Sheets.`);
  } catch (error) {
    console.error('Failed to append to Google Sheets:', error);
  }
}
