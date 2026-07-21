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

const GROOMER_IDS = new Set(["anya", "maxim", "lera", "karina", "timur", "sofia"]);

function validBookingDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

async function getAvailability(data, env) {
  if (!env.DB) {
    return json({ ok: false, code: "SCHEDULE_NOT_CONFIGURED", error: "Расписание пока не подключено" }, 503);
  }
  if (!validBookingDate(data.date)) {
    return json({ ok: false, error: "Некорректная дата расписания" }, 400);
  }

  const result = await env.DB.prepare(`
    SELECT groomer_id AS groomerId, start_min AS startMin, end_min AS endMin
    FROM bookings
    WHERE booking_date = ?
    ORDER BY groomer_id, start_min
  `).bind(data.date).all();

  return json({ ok: true, bookings: result.results || [] });
}

async function reserveAndSendBooking(data, env) {
  if (!env.DB) {
    return json({ ok: false, code: "SCHEDULE_NOT_CONFIGURED", error: "Расписание пока не подключено" }, 503);
  }

  const details = data.booking || {};
  const groomerId = String(details.groomerId || "");
  const startMin = Number(details.startMin);
  const durationMin = Number(details.durationMin);
  const endMin = startMin + durationMin;
  if (
    !GROOMER_IDS.has(groomerId) || !validBookingDate(details.date) ||
    !Number.isInteger(startMin) || !Number.isInteger(durationMin) ||
    startMin < 600 || endMin > 1080 || durationMin < 15 || durationMin > 480
  ) {
    return json({ ok: false, error: "Некорректные параметры записи" }, 400);
  }

  const bookingId = crypto.randomUUID();
  const insert = await env.DB.prepare(`
    INSERT INTO bookings (id, groomer_id, booking_date, start_min, end_min)
    SELECT ?, ?, ?, ?, ?
    WHERE NOT EXISTS (
      SELECT 1 FROM bookings
      WHERE groomer_id = ? AND booking_date = ?
        AND start_min < ? AND end_min > ?
    )
  `).bind(
    bookingId, groomerId, details.date, startMin, endMin,
    groomerId, details.date, endMin, startMin,
  ).run();

  if (!insert.meta?.changes) {
    return json({
      ok: false,
      code: "TIME_UNAVAILABLE",
      error: "Это время уже занято. Выберите другое окно.",
    }, 409);
  }

  const telegramResult = await sendToTelegram(data, env);
  if (!telegramResult.ok) {
    await env.DB.prepare("DELETE FROM bookings WHERE id = ?").bind(bookingId).run();
  }
  return telegramResult;
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
      if (data.action === "availability") return await getAvailability(data, env);
      if (data.action === "booking") return await reserveAndSendBooking(data, env);
      return await sendToTelegram(data, env);
    } catch (error) {
      return json({ ok: false, error: "Сервис временно недоступен" }, 502);
    }
  },
};
