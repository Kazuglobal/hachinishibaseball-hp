/**
 * Cloudflare Pages Function: Stripe Checkout Session 作成（八戸西記念ボール 500円寄付・上限3球）
 * エンドポイント: POST /api/create-cheer-checkout
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sanitize(value, maxLen = 100) {
  return String(value ?? '')
    .replace(/[\x00-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

const ALLOWED_HOSTS = new Set([
  'hachinohenishibaseball.com',
  'www.hachinohenishibaseball.com',
  'localhost',
  '127.0.0.1',
]);

function isAllowedHost(hostname) {
  return (
    ALLOWED_HOSTS.has(hostname) ||
    hostname === 'hachinohenishibaseball.pages.dev' ||
    hostname.endsWith('.hachinohenishibaseball.pages.dev')
  );
}

function getBaseUrl(request) {
  const origin = request.headers.get('origin');
  if (origin) {
    try {
      const parsed = new URL(origin);
      if ((parsed.protocol === 'https:' || parsed.protocol === 'http:') && isAllowedHost(parsed.hostname)) {
        return `${parsed.protocol}//${parsed.host}`;
      }
    } catch {
      // ignore invalid origin
    }
  }
  const reqUrl = new URL(request.url);
  if (isAllowedHost(reqUrl.hostname)) {
    return `${reqUrl.protocol}//${reqUrl.host}`;
  }
  return 'https://hachinohenishibaseball.com';
}

function resolveStripeSecretKey(request, env) {
  const host = new URL(request.url).hostname;
  const isPreview = host.endsWith('.pages.dev') || host === 'localhost' || host === '127.0.0.1';
  if (isPreview) {
    return env['STRIPE_SECRET_KEY-test'] || env.STRIPE_SECRET_KEY_TEST || env.STRIPE_SECRET_KEY;
  }
  return env.STRIPE_SECRET_KEY;
}

export async function onRequestPost(context) {
  const { request, env } = context;

  // CSRF / クロスオリジン不正リクエスト防御
  const originHeader = request.headers.get('origin');
  if (originHeader) {
    try {
      const originUrl = new URL(originHeader);
      if (!isAllowedHost(originUrl.hostname)) {
        return json({ error: '許可されていない送信元からのリクエストです。' }, 403);
      }
    } catch {
      return json({ error: '不正な送信元ヘッダーです。' }, 403);
    }
  }

  const secretKey = resolveStripeSecretKey(request, env);

  if (!secretKey) {
    return json(
      {
        error: '現在オンライン決済の準備中です。しばらくしてからお試しください。',
      },
      503
    );
  }

  try {
    const rawText = await request.text();
    if (rawText.length > 4096) {
      return json({ error: 'リクエストサイズが大きすぎます。' }, 413);
    }
    const body = rawText ? JSON.parse(rawText) : {};
    const donorName = sanitize(body.name, 40);
    const period = sanitize(body.period, 20);
    const message = sanitize(body.message, 200);
    const quantity = Math.min(Math.max(parseInt(body.quantity, 10) || 1, 1), 3);

    if (!donorName) {
      return json({ error: 'お名前を入力してください。' }, 400);
    }
    if (!period) {
      return json({ error: '回期（または立場）を入力してください。' }, 400);
    }

    const baseUrl = getBaseUrl(request);
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('locale', 'ja');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price_data][currency]', 'jpy');
    params.append('line_items[0][price_data][unit_amount]', '500');
    params.append(
      'line_items[0][price_data][product_data][name]',
      '八戸西高校野球部 記念ボール応援寄付（1球 500円）'
    );
    params.append(
      'line_items[0][price_data][product_data][description]',
      `現役選手の練習球を支援＆お名前・回期入り八戸西記念ボールを進呈（${period} ${donorName} 様）`
    );
    params.append('line_items[0][quantity]', String(quantity));
    params.append(
      'success_url',
      `${baseUrl}/cheer?status=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.append('cancel_url', `${baseUrl}/cheer?status=cancelled`);

    params.append('metadata[paymentType]', 'cheer_tip');
    params.append('metadata[donorName]', donorName);
    params.append('metadata[period]', period);
    params.append('metadata[category]', 'batting');
    params.append('metadata[quantity]', String(quantity));
    params.append('metadata[message]', message);

    const stripeRes = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${secretKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: params.toString(),
    });

    const session = await stripeRes.json();
    if (!stripeRes.ok) {
      return json({ error: '決済セッションの作成に失敗しました。しばらくしてからお試しください。' }, 502);
    }

    return json({
      sessionId: session.id,
      url: session.url,
    });
  } catch {
    return json({ error: 'サーバーエラーが発生しました。しばらくしてからお試しください。' }, 500);
  }
}
