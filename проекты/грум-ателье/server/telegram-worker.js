// Cloudflare Worker keeps Telegram and DeepSeek credentials away from the browser.

const JSON_HEADERS = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
  "Content-Type": "application/json; charset=utf-8",
};

const GROOMING_PROMPT = `Ты онлайн-консультант демо-сайта груминг-ателье «Лохматый Стиль».
Отвечай по-русски, дружелюбно и кратко: обычно 2-4 предложения.

Факты об ателье:
- Запись проходит на сайте: порода, грумер, стрижка, спецуслуги, время, оплата и телефон.
- Базовая цена породы: маленькие 500 ₽, средние 1000 ₽, крупные 1600 ₽.
- Стрижки и спецуслуги добавляются к базовой цене; точный итог считает форма записи.
- Спецуслуги: SPA-купание, гигиенический комплекс, вычёсывание, когти и лапки, уши и глаза, антиколтун.
- Грумеры: Аня, Максим, Лера, Карина, Тимур и София. Подходящие мастера показываются после выбора породы.
- Рабочее время в демо: с 10:00 до 18:00.
- Оплата картой и СБП пока демонстрационная: не утверждай, что деньги списаны или платёж принят.

Правила:
- Не придумывай свободное время, окончательную цену, акции и медицинские советы.
- Для точной цены и записи направляй клиента к кнопке «Записаться на стрижку».
- Если вопрос требует человека, предложи оставить телефон в форме записи или попросить администратора.
- Не проси присылать данные банковской карты или другие секретные данные в чат.`;

function json(data, status = 200) {
  return new Response(JSON.stringify(data), { status, headers: JSON_HEADERS });
}

function sanitizeMessages(messages) {
  if (!Array.isArray(messages)) return [];
  return messages
    .filter(message => message && (message.role === "user" || message.role === "assistant"))
    .slice(-10)
    .map(message => ({
      role: message.role,
      content: String(message.content || "").trim().slice(0, 1200),
    }))
    .filter(message => message.content);
}

async function answerWithDeepSeek(data, env) {
  if (!env.DEEPSEEK_API_KEY) {
    return json({
      ok: false,
      code: "AI_NOT_CONFIGURED",
      error: "DeepSeek пока не подключён: добавьте секрет DEEPSEEK_API_KEY",
    }, 503);
  }

  const messages = sanitizeMessages(data.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ ok: false, error: "Нужно отправить сообщение пользователя" }, 400);
  }

  const deepSeekResponse = await fetch("https://api.deepseek.com/chat/completions", {
    method: "POST",
    headers: {
      "Authorization": "Bearer " + env.DEEPSEEK_API_KEY,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: "deepseek-v4-flash",
      messages: [{ role: "system", content: GROOMING_PROMPT }, ...messages],
      thinking: { type: "disabled" },
      max_tokens: 450,
      temperature: 0.4,
      stream: false,
    }),
  });

  const deepSeekData = await deepSeekResponse.json().catch(() => ({}));
  const reply = deepSeekData.choices?.[0]?.message?.content?.trim();
  if (!deepSeekResponse.ok || !reply) {
    return json({
      ok: false,
      error: deepSeekData.error?.message || "DeepSeek не смог ответить",
    }, deepSeekResponse.status >= 400 ? deepSeekResponse.status : 502);
  }

  return json({ ok: true, reply });
}

async function sendToTelegram(data, env) {
  if (!env.BOT_TOKEN || !env.CHAT_ID) {
    return json({
      ok: false,
      error: "BOT_TOKEN или CHAT_ID не настроены в Cloudflare Worker",
    }, 500);
  }

  const text = String(data.text || "🐶 Новая заявка (без текста)").slice(0, 4000);
  const telegramResponse = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ chat_id: env.CHAT_ID, text }),
  });
  const telegramData = await telegramResponse.json().catch(() => ({}));

  if (!telegramResponse.ok || telegramData.ok === false) {
    return json({
      ok: false,
      error: telegramData.description || "Telegram API вернул ошибку",
    }, 502);
  }

  return json({ ok: true });
}

export default {
  async fetch(request, env) {
    if (request.method === "OPTIONS") return new Response(null, { headers: JSON_HEADERS });
    if (request.method !== "POST") return json({ ok: false, error: "Метод не поддерживается" }, 405);

    let data;
    try {
      data = await request.json();
    } catch (error) {
      return json({ ok: false, error: "Некорректный JSON" }, 400);
    }

    try {
      if (data.action === "chat") return await answerWithDeepSeek(data, env);
      return await sendToTelegram(data, env);
    } catch (error) {
      return json({ ok: false, error: "Сервис временно недоступен" }, 502);
    }
  },
};
