import { Order } from '../db/database';

export async function createPayment(order: Order, botUsername: string): Promise<{ url: string, paymentId: string }> {
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) {
    console.warn('YooKassa credentials not set. Returning a dummy payment URL.');
    return { url: `https://t.me/${botUsername}`, paymentId: 'dummy_payment_id' };
  }

  const idempotenceKey = `order-${order.id}-${Date.now()}`;

  try {
    const response = await fetch('https://api.yookassa.ru/v3/payments', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Idempotence-Key': idempotenceKey,
        'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
      body: JSON.stringify({
        amount: { value: order.totalPrice.toFixed(2), currency: 'RUB' },
        confirmation: { type: 'redirect', return_url: `https://t.me/${botUsername}` },
        description: `Заказ миски Doggideed #${order.id}`,
        metadata: { orderId: order.id, telegramUserId: order.userId },
        capture: true,
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('YooKassa API Error:', errorText);
      throw new Error('YooKassa API Error');
    }

    const data = await response.json() as any;
    return { url: data.confirmation.confirmation_url, paymentId: data.id };
  } catch (error) {
    console.error('Failed to create payment:', error);
    throw error;
  }
}

export async function checkPayment(paymentId: string): Promise<boolean> {
  if (paymentId === 'dummy_payment_id') return true;
  
  const shopId = process.env.YOOKASSA_SHOP_ID;
  const secretKey = process.env.YOOKASSA_SECRET_KEY;

  if (!shopId || !secretKey) return true;

  try {
    const response = await fetch(`https://api.yookassa.ru/v3/payments/${paymentId}`, {
      method: 'GET',
      headers: {
        'Authorization': 'Basic ' + Buffer.from(`${shopId}:${secretKey}`).toString('base64'),
      },
    });

    if (!response.ok) return false;

    const data = await response.json() as any;
    return data.status === 'succeeded';
  } catch (error) {
    console.error('Failed to check payment:', error);
    return false;
  }
}
