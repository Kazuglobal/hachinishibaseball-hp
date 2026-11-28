/**
 * Cloudflare Pages Function: 協賛・広告枠 Stripe Checkout Session 作成（年額一括）
 * エンドポイント: POST /api/create-sponsor-checkout
 *
 * プラン金額はサーバー側で厳密固定:
 *   bronze : 10,000円（年額・テキストリンク枠）
 *   silver : 30,000円（年額・標準ロゴバナー枠）
 *   gold   : 50,000円（年額・大型ワイドバナー＋演出枠）
 */

const PLANS = {
  bronze: {
    amount: 10000,
    name: '八戸西高校野球部OB会 ブロンズ協賛（年額・1年間掲載）',
    description: 'テキストリンク枠（企業・店舗名＋公式サイトリンク掲出・事務局審査後掲載）',
  },
  silver: {
    amount: 30000,
    name: '八戸西高校野球部OB会 シルバー協賛（年額・1年間掲載）',
    description: '標準ロゴバナー枠＋一言キャッチコピー（事務局審査後掲載）',
  },
  gold: {
    amount: 50000,
    name: '八戸西高校野球部OB会 ゴールド協賛（年額・1年間掲載）',
    description: '大型ワイドバナー優先掲出＋光沢シマー・スライド演出枠（事務局審査後掲載）',
  },
};

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

function validateHttpsUrl(raw) {
  const s = sanitize(raw, 300);
  if (!s) return '';
  try {
    const u = new URL(s);
    if (u.protocol === 'https:') return u.toString();
  } catch {
    return null;
  }
  return null;
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
      // ignore
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
    return json({ error: '現在オンライン決済の準備中です。しばらくしてからお試しください。' }, 503);
  }

  try {
    const rawText = await request.text();
    if (rawText.length > 4096) {
      return json({ error: 'リクエストサイズが大きすぎます。' }, 413);
    }
    const body = rawText ? JSON.parse(rawText) : {};

    const tier = sanitize(body.tier, 20);
    const plan = PLANS[tier];
    if (!plan) {
      return json({ error: '協賛プランの指定が正しくありません。' }, 400);
    }

    const companyName = sanitize(body.companyName, 60);
    const contactName = sanitize(body.contactName, 40);
    const email = sanitize(body.email, 120);
    const phone = sanitize(body.phone, 30);
    const catchphrase = sanitize(body.catchphrase, 60);
    const validUrl = validateHttpsUrl(body.url);

    if (!companyName) return json({ error: '企業・団体名を入力してください。' }, 400);
    if (!contactName) return json({ error: 'ご担当者様のお名前を入力してください。' }, 400);
    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json({ error: '有効なメールアドレスを入力してください。' }, 400);
    }
    if (validUrl === null) {
      return json({ error: 'リンク先URLは https:// から始まる正しい形式で入力してください。' }, 400);
    }

    const baseUrl = getBaseUrl(request);
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('locale', 'ja');
    params.append('customer_email', email);
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price_data][currency]', 'jpy');
    params.append('line_items[0][price_data][unit_amount]', String(plan.amount));
    params.append('line_items[0][price_data][product_data][name]', plan.name);
    params.append(
      'line_items[0][price_data][product_data][description]',
      `${plan.description}（${companyName} 様）`
    );
    params.append('line_items[0][quantity]', '1');
    params.append(
      'success_url',
      `${baseUrl}/sponsors?status=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.append('cancel_url', `${baseUrl}/sponsors?status=cancelled`);

    params.append('metadata[paymentType]', 'sponsor_ad');
    params.append('metadata[tier]', tier);
    params.append('metadata[companyName]', companyName);
    params.append('metadata[contactName]', contactName);
    params.append('metadata[email]', email);
    params.append('metadata[phone]', phone);
    params.append('metadata[url]', validUrl);
    params.append('metadata[catchphrase]', catchphrase);

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
