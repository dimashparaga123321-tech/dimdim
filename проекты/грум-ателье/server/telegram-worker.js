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

    // Отправляем в Telegram. Токен берётся из секрета — его не видно в сайте!
    await fetch("https://api.telegram.org/bot" + env.BOT_TOKEN + "/sendMessage", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ chat_id: env.CHAT_ID, text }),
    });

    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...cors, "Content-Type": "application/json" },
    });
  },
};
