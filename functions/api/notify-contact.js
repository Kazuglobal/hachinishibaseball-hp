/**
 * Cloudflare Pages Function: お問い合わせフォーム内部通知プロキシ
 * エンドポイント: POST /api/notify-contact
 *
 * ブラウザにシークレットを露出させず、Cloudflare Workers (hachinohenishi-notifier) へ
 * サーバー間通信でお問い合わせ通知を転送します。
 * 必要な環境変数（Cloudflare Pages > Settings > Environment variables）:
 *   NOTIFIER_URL     : https://hachinohenishi-notifier.<subdomain>.workers.dev
 *   NOTIFIER_API_KEY : Workerに設定した NOTIFY_API_KEY と同じ値（Secret推奨）
 */

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8' },
  });
}

function sanitize(value, maxLen = 1000) {
  return String(value ?? '')
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '')
    .trim()
    .slice(0, maxLen);
}

export async function onRequestPost(context) {
  const { request, env } = context;

  if (!env.NOTIFIER_URL || !env.NOTIFIER_API_KEY) {
    return json({ ok: false, skipped: true, reason: 'NOTIFIER_URL or NOTIFIER_API_KEY is not configured' }, 200);
  }

  try {
    const body = await request.json().catch(() => ({}));
    const payload = {
      name: sanitize(body.name, 80),
      email: sanitize(body.email, 160),
      phone: sanitize(body.phone, 40),
      subject: sanitize(body.subject, 160),
      message: sanitize(body.message, 4000),
    };

    if (!payload.name || !payload.email || !payload.message) {
      return json({ ok: false, error: '必須項目が不足しています。' }, 400);
    }

    const res = await fetch(`${env.NOTIFIER_URL.replace(/\/$/, '')}/notify/contact`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Notify-Key': env.NOTIFIER_API_KEY,
      },
      body: JSON.stringify(payload),
    });

    if (!res.ok) {
      return json({ ok: false, status: res.status }, 502);
    }

    return json({ ok: true });
  } catch (err) {
    return json(
      { ok: false, error: err instanceof Error ? err.message : '通知送信に失敗しました。' },
      500
    );
  }
}
