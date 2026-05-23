export async function generateOrderDescription(items: any[]): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    console.warn('GEMINI_API_KEY is not set. Using fallback description.');
    return 'Спасибо за ваш заказ! Мы с любовью изготовим эту миску для вашего питомца.';
  }

  try {
    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{
              text: `Ты — помощник бренда Doggideed, который делает дизайнерские миски для собак ручной работы.
Клиент собрал заказ:
${JSON.stringify(items, null, 2)}

Напиши тёплое, короткое (3 предложения) описание этого заказа для клиента.
Подчеркни уют, стиль и заботу о питомце. Пиши по-русски, без эмодзи, без заголовков.`
            }]
          }]
        })
      }
    );

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Gemini API Error:', errorText);
      throw new Error('Gemini API Error');
    }

    const data = await response.json() as any;
    return data.candidates[0].content.parts[0].text.trim();
  } catch (error) {
    console.error('Failed to generate order description:', error);
    return 'Спасибо за ваш заказ! Мы с любовью изготовим эту миску для вашего питомца.';
  }
}
