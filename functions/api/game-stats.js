
const json = (data, status = 200) =>
  new Response(JSON.stringify(data), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff"
    }
  });

const dateKey = () =>
  new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Bangkok",
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(new Date());

const getNumber = async (kv, key) =>
  Number((await kv.get(key)) || 0);

async function increment(kv, key) {
  const next = (await getNumber(kv, key)) + 1;
  await kv.put(key, String(next));
  return next;
}

export async function onRequest({ request, env }) {
  if (!env.GAME_STATS) {
    return json({ error: "KV_NOT_CONFIGURED" }, 503);
  }

  const kv = env.GAME_STATS;
  const url = new URL(request.url);

  if (request.method === "GET") {
    return json({
      ok: true,
      service: "KARAN'S PHONE Analytics",
      status: "ready"
    });
  }

  if (request.method !== "POST") {
    return json({ error: "METHOD_NOT_ALLOWED" }, 405);
  }

  let body;
  try {
    body = await request.json();
  } catch {
    return json({ error: "INVALID_JSON" }, 400);
  }

  const action = body.action;
  const today = dateKey();

  if (action === "visit") {
    const visitorId = body.visitorId;

    if (
      typeof visitorId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)
    ) {
      return json({ error: "INVALID_VISITOR_ID" }, 400);
    }

    await increment(kv, "opens:total");

    const firstVisitKey = "visitor:" + visitorId;
    const dailyKey = "daily:" + today + ":" + visitorId;

    if (!(await kv.get(firstVisitKey))) {
      await kv.put(firstVisitKey, today);
      await increment(kv, "players:total");
    }

    if (!(await kv.get(dailyKey))) {
      await kv.put(dailyKey, "1", {
        expirationTtl: 86400 * 9
      });
      await increment(kv, "players:day:" + today);
    }

    return json({ ok: true, recorded: true });
  }

  if (action === "complete") {
    const visitorId = body.visitorId;

    if (
      typeof visitorId !== "string" ||
      !/^[a-zA-Z0-9_-]{16,100}$/.test(visitorId)
    ) {
      return json({ error: "INVALID_VISITOR_ID" }, 400);
    }

    const key = "completed:" + visitorId;

    if (!(await kv.get(key))) {
      await kv.put(key, today);
      await increment(kv, "players:completed");
    }

    return json({ ok: true });
  }

  if (action === "stats") {
    if (!env.OWNER_PIN) {
      return json({ error: "OWNER_PIN_NOT_CONFIGURED" }, 503);
    }

    if (
      typeof body.pin !== "string" ||
      body.pin !== env.OWNER_PIN
    ) {
      return json({ error: "INVALID_PIN" }, 401);
    }

    const days = [];

    for (let i = 6; i >= 0; i--) {
      const d = new Date();
      d.setTime(Date.now() - i * 86400000);

      const day = new Intl.DateTimeFormat("en-CA", {
        timeZone: "Asia/Bangkok",
        year: "numeric",
        month: "2-digit",
        day: "2-digit"
      }).format(d);

      days.push({
        date: day,
        players: await getNumber(kv, "players:day:" + day)
      });
    }

    return json({
      ok: true,
      totalPlayers: await getNumber(kv, "players:total"),
      todayPlayers: await getNumber(kv, "players:day:" + today),
      totalOpens: await getNumber(kv, "opens:total"),
      completedPlayers: await getNumber(kv, "players:completed"),
      last7Days: days,
      updatedAt: new Date().toISOString()
    });
  }

  return json({ error: "UNKNOWN_ACTION" }, 400);
}

