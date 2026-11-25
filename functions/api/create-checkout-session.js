/**
 * Cloudflare Pages Function: Stripe Checkout Session 作成（OB会年会費 5,000円）
 * エンドポイント: POST /api/create-checkout-session
 *
 * Cloudflare Pages > Settings > Environment variables に設定:
 *   STRIPE_SECRET_KEY : Stripe シークレットキー（sk_test_... / sk_live_...）
 */

const MEMBERSHIP_FEE_AMOUNT = 5000;

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

function getBaseUrl(request) {
  const origin = request.headers.get('origin');
  if (origin && /^https?:\/\/[^/\s]+$/.test(origin)) {
    return origin;
  }
  const url = new URL(request.url);
  return `${url.protocol}//${url.host}`;
}

export async function onRequestPost(context) {
  const { request, env } = context;
  const secretKey = env.STRIPE_SECRET_KEY;

  if (!secretKey) {
    return json(
      {
        error:
          'Stripe決済が未設定です（Cloudflare Pages の環境変数 STRIPE_SECRET_KEY が設定されていません）。「演出をデモ体験」ボタンから動作確認を行えます。',
      },
      503
    );
  }

  try {
    const body = await request.json().catch(() => ({}));
    const donorName = sanitize(body.name, 40);
    const period = sanitize(body.period, 20);
    const message = sanitize(body.message, 200);
    const parsedYear = parseInt(body.year, 10);
    const year =
      Number.isInteger(parsedYear) && parsedYear >= 2024 && parsedYear <= 2099
        ? String(parsedYear)
        : String(new Date().getFullYear());

    if (!donorName) {
      return json({ error: 'お名前を入力してください。' }, 400);
    }
    if (!period) {
      return json({ error: '卒期を入力してください。' }, 400);
    }

    const baseUrl = getBaseUrl(request);
    const params = new URLSearchParams();
    params.append('mode', 'payment');
    params.append('locale', 'ja');
    params.append('payment_method_types[0]', 'card');
    params.append('line_items[0][price_data][currency]', 'jpy');
    params.append('line_items[0][price_data][unit_amount]', String(MEMBERSHIP_FEE_AMOUNT));
    params.append('line_items[0][price_data][product_data][name]', '八戸西高校野球部OB会 年会費納入');
    params.append(
      'line_items[0][price_data][product_data][description]',
      `OB会年会費のご納入（ミニチュアユニフォームにお名前・卒期を自動表示）（${period} ${donorName} 様）`
    );
    params.append('line_items[0][quantity]', '1');
    params.append(
      'success_url',
      `${baseUrl}/support?status=success&session_id={CHECKOUT_SESSION_ID}`
    );
    params.append('cancel_url', `${baseUrl}/support?status=cancelled`);

    params.append('metadata[paymentType]', 'membership_fee');
    params.append('metadata[donorName]', donorName);
    params.append('metadata[period]', period);
    params.append('metadata[category]', 'membership_fee');
    params.append('metadata[year]', year);
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
      return json(
        { error: session?.error?.message || 'Stripeセッションの作成に失敗しました。' },
        502
      );
    }

    return json({
      sessionId: session.id,
      url: session.url,
    });
  } catch (err) {
    return json(
      { error: err instanceof Error ? err.message : 'サーバーエラーが発生しました。' },
      500
    );
  }
}
