// 🤖 Мини-сервер (Cloudflare Worker), который ПРЯЧЕТ токен бота.
// Сайт присылает сюда заявку, а этот сервер уже отправляет её в Telegram.
// Токен и chat_id хранятся в СЕКРЕТАХ Cloudflare — в коде сайта их больше нет.

export default {
  async fetch(request, env) {
    // Разрешаем сайту обращаться к серверу (CORS)
    const cors = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };
    if (request.method === "OPTIONS") return new Response(null, { headers: cors });

    // Читаем заявку с сайта
    let data = {};
    try { data = await request.json(); } catch (e) {}
    const text = data.text || "🐶 Новая заявка (без текста)";

    if (!env.BOT_TOKEN || !env.CHAT_ID) {
      return new Response(JSON.stringify({
        ok: false,
        error: "BOT_TOKEN или CHAT_ID не настроены в Cloudflare Worker",
      }), {
        status: 500,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    // Отправляем в Telegram. Токен берётся из секрета — его не видно в сайте!
    const telegramResponse = await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text }),
    });
    const telegramData = await telegramResponse.json().catch(() => ({}));

    if (!telegramResponse.ok || telegramData.ok === false) {
      return new Response(JSON.stringify({
        ok: false,
        error: telegramData.description || "Telegram API вернул ошибку",
      }), {
        status: 502,
        headers: { ...cors, "Content-Type": "application/json" },
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
