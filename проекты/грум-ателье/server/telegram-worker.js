// Cloudflare Worker keeps Telegram credentials and AI requests away from the browser.

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

async function answerWithWorkersAI(data, env) {
  if (!env.AI) {
    return json({
      ok: false,
      code: "AI_NOT_CONFIGURED",
      error: "Workers AI пока не подключён: добавьте привязку AI в Cloudflare",
    }, 503);
  }

  const messages = sanitizeMessages(data.messages);
  if (!messages.length || messages[messages.length - 1].role !== "user") {
    return json({ ok: false, error: "Нужно отправить сообщение пользователя" }, 400);
  }

  const aiResult = await env.AI.run("@cf/meta/llama-3.1-8b-instruct-fp8-fast", {
    messages: [{ role: "system", content: GROOMING_PROMPT }, ...messages],
    max_tokens: 450,
    temperature: 0.4,
  });

  const reply = typeof aiResult?.response === "string"
    ? aiResult.response.trim()
    : aiResult?.choices?.[0]?.message?.content?.trim();
  if (!reply) return json({ ok: false, error: "Workers AI не смог ответить" }, 502);

  return json({ ok: true, reply, provider: "cloudflare-workers-ai" });
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
      if (data.action === "chat") return await answerWithWorkersAI(data, env);
      return await sendToTelegram(data, env);
    } catch (error) {
      return json({ ok: false, error: "Сервис временно недоступен" }, 502);
    }
  },
};
