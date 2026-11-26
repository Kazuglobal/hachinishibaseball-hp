/**
 * 八戸西高等学校野球部OB会 監視・通知・レポート Worker
 * Cloudflare Email Sending (Workers Free プラン対応・検証済み宛先へ無料送信)
 *
 * 機能:
 * 1. 監視・アラート (Cron: 30分ごと) — サイト死活・遅延・コンテンツ欠落を検知して即メール
 * 2. 日次レポート (Cron: 毎朝 08:00 JST / 23:00 UTC) — 各ページの応答速度・稼働状況を定期報告
 * 3. Webhook通知 (POST /webhook) — GitHub Actions / Stripe / 汎用Webhookイベントをメール化
 * 4. 内部通知 (POST /notify/contact, POST /notify/payment) — お問い合わせ・年会費納入を即通知
 * 5. 開発・検証 (GET /health, POST /test) — 無料での送信テスト・即時ヘルスチェック
 */

const MONITOR_TARGETS = [
  { name: 'トップページ', path: '/', expectText: '八戸西' },
  { name: 'OB会について', path: '/about', expectText: '八戸西' },
  { name: '活動報告', path: '/activities', expectText: '八戸西' },
  { name: '年会費・ご支援', path: '/support', expectText: '八戸西' },
  { name: 'お問い合わせ', path: '/contact', expectText: '八戸西' },
];

function nowJstString(date = new Date()) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  }).format(date) + ' JST';
}

function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function json(data, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(data, null, 2), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      ...extraHeaders,
    },
  });
}

function timingSafeEqual(a, b) {
  if (typeof a !== 'string' || typeof b !== 'string' || a.length !== b.length) {
    return false;
  }
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function isAuthorized(request, env) {
  const secret = env.NOTIFY_API_KEY;
  if (!secret) return false;
  const authHeader = request.headers.get('authorization') || '';
  const bearer = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';
  const headerKey = (request.headers.get('x-notify-key') || request.headers.get('x-webhook-secret') || '').trim();
  return timingSafeEqual(bearer, secret) || timingSafeEqual(headerKey, secret);
}

async function checkSingleTarget(baseUrl, target, slowThresholdMs) {
  const url = `${baseUrl.replace(/\/$/, '')}${target.path}`;
  const start = Date.now();
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 10000);
    const res = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'User-Agent': 'Hachinohenishi-Monitor-Worker/1.0' },
    });
    clearTimeout(timeoutId);

    const latencyMs = Date.now() - start;
    const bodyText = await res.text();
    const hasExpected = !target.expectText || bodyText.includes(target.expectText);
    const isSlow = latencyMs > slowThresholdMs;
    const ok = res.ok && hasExpected && !isSlow;

    const issues = [];
    if (!res.ok) issues.push(`HTTP ${res.status} ${res.statusText}`);
    if (!hasExpected) issues.push(`期待コンテンツ「${target.expectText}」が見つかりません`);
    if (isSlow) issues.push(`応答遅延 (${latencyMs}ms > ${slowThresholdMs}ms)`);

    return {
      name: target.name,
      url,
      status: res.status,
      latencyMs,
      ok,
      issues,
    };
  } catch (err) {
    return {
      name: target.name,
      url,
      status: 0,
      latencyMs: Date.now() - start,
      ok: false,
      issues: [err instanceof Error ? err.message : '接続エラー'],
    };
  }
}

async function runHealthChecks(env) {
  const baseUrl = env.SITE_URL || 'https://hachinohenishibaseball.com';
  const slowThresholdMs = Number(env.SLOW_THRESHOLD_MS || 4000);
  const results = await Promise.all(
    MONITOR_TARGETS.map((target) => checkSingleTarget(baseUrl, target, slowThresholdMs))
  );
  const failed = results.filter((r) => !r.ok);
  const avgLatencyMs = Math.round(
    results.reduce((sum, r) => sum + r.latencyMs, 0) / Math.max(results.length, 1)
  );
  return {
    checkedAt: nowJstString(),
    baseUrl,
    allOk: failed.length === 0,
    totalCount: results.length,
    okCount: results.length - failed.length,
    failedCount: failed.length,
    avgLatencyMs,
    results,
    failed,
  };
}

function wrapEmailLayout({ badge, badgeColor, title, subtitle, bodyHtml }) {
  return `<!DOCTYPE html>
<html lang="ja">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#f4f6f9;font-family:-apple-system,BlinkMacSystemFont,'Hiragino Kaku Gothic ProN','Yu Gothic',Meiryo,sans-serif;color:#1e293b;">
  <div style="max-width:640px;margin:24px auto;background:#ffffff;border-radius:12px;overflow:hidden;border:1px solid #e2e8f0;box-shadow:0 4px 12px rgba(15,23,42,0.06);">
    <div style="background:#0f2942;color:#ffffff;padding:20px 24px;">
      <div style="display:inline-block;background:${badgeColor};color:#ffffff;font-size:12px;font-weight:700;padding:4px 10px;border-radius:999px;letter-spacing:0.04em;margin-bottom:10px;">
        ${escapeHtml(badge)}
      </div>
      <h1 style="margin:0;font-size:20px;line-height:1.4;font-weight:700;">${escapeHtml(title)}</h1>
      ${subtitle ? `<p style="margin:6px 0 0;font-size:13px;color:#cbd5e1;">${escapeHtml(subtitle)}</p>` : ''}
    </div>
    <div style="padding:24px;font-size:14px;line-height:1.7;">
      ${bodyHtml}
    </div>
    <div style="background:#f8fafc;padding:14px 24px;border-top:1px solid #e2e8f0;font-size:12px;color:#64748b;">
      送信元: Cloudflare Workers Email Sending (Free Plan・検証済み宛先無料送信)<br>
      対象サイト: <a href="https://hachinohenishibaseball.com" style="color:#0f2942;">https://hachinohenishibaseball.com</a>
    </div>
  </div>
</body>
</html>`;
}

async function sendNotificationEmail(env, { subject, html, text, replyTo }) {
  const payload = {
    from: {
      email: env.FROM_EMAIL || 'notify@hachinohenishibaseball.com',
      name: env.FROM_NAME || '八戸西高校野球部OB会 監視・通知システム',
    },
    to: env.TO_EMAIL || 'globalbunny77@gmail.com',
    subject,
    html,
    text,
  };
  if (replyTo && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(replyTo)) {
    payload.replyTo = replyTo;
  }
  return await env.EMAIL.send(payload);
}

function buildHealthRowsHtml(results) {
  return results
    .map((r) => {
      const statusBadge = r.ok
        ? '<span style="color:#15803d;font-weight:700;">✅ 正常</span>'
        : '<span style="color:#b91c1c;font-weight:700;">🚨 異常</span>';
      const detail = r.issues.length > 0 ? `<br><span style="color:#b91c1c;font-size:12px;">${escapeHtml(r.issues.join(' / '))}</span>` : '';
      return `<tr>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;">${escapeHtml(r.name)}${detail}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${statusBadge}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:center;">${r.status || 'ERR'}</td>
        <td style="padding:8px 10px;border-bottom:1px solid #e2e8f0;text-align:right;">${r.latencyMs}ms</td>
      </tr>`;
    })
    .join('');
}

async function sendDailyReport(env, report, extraNote = '') {
  const statusLabel = report.allOk ? '全ページ正常稼働' : `異常あり (${report.failedCount}件)`;
  const badgeColor = report.allOk ? '#15803d' : '#dc2626';

  const bodyHtml = `
    <p style="margin-top:0;">八戸西高校野球部OB会サイトの定期ヘルスチェック結果をお知らせします。</p>
    <div style="display:flex;gap:12px;margin:16px 0;background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:12px 16px;">
      <div style="flex:1;"><strong>総合状態:</strong> ${escapeHtml(statusLabel)}</div>
      <div style="flex:1;"><strong>平均応答:</strong> ${report.avgLatencyMs}ms</div>
      <div style="flex:1;"><strong>正常数:</strong> ${report.okCount}/${report.totalCount}</div>
    </div>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
      <thead>
        <tr style="background:#f1f5f9;">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #cbd5e1;">ページ</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #cbd5e1;">判定</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #cbd5e1;">HTTP</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #cbd5e1;">応答</th>
        </tr>
      </thead>
      <tbody>${buildHealthRowsHtml(report.results)}</tbody>
    </table>
    ${extraNote}
  `;

  const textLines = [
    `【日次レポート】八戸西高校野球部OB会サイト (${report.checkedAt})`,
    `総合状態: ${statusLabel} / 平均応答: ${report.avgLatencyMs}ms (${report.okCount}/${report.totalCount})`,
    '',
    ...report.results.map(
      (r) => `- ${r.name}: ${r.ok ? 'OK' : 'NG'} (HTTP ${r.status}, ${r.latencyMs}ms)${r.issues.length ? ' -> ' + r.issues.join(', ') : ''}`
    ),
  ];

  return sendNotificationEmail(env, {
    subject: `[日次レポート] ${statusLabel} | 八戸西高校野球部OB会 (${report.checkedAt})`,
    html: wrapEmailLayout({
      badge: 'DAILY REPORT',
      badgeColor,
      title: `サイト稼働レポート：${statusLabel}`,
      subtitle: `計測日時: ${report.checkedAt}`,
      bodyHtml,
    }),
    text: textLines.join('\n'),
  });
}

async function sendAlertEmail(env, report, isTest = false) {
  const titlePrefix = isTest ? '【テスト発報】' : '';
  const bodyHtml = `
    <p style="margin-top:0;color:#b91c1c;font-weight:700;">
      ${isTest ? 'これは監視アラート機能のテスト送信です。実際の障害発生時は以下の形式で即座に通知されます。' : 'サイト監視チェックで異常を検知しました。早急に確認してください。'}
    </p>
    <table style="width:100%;border-collapse:collapse;font-size:13px;margin:16px 0;">
      <thead>
        <tr style="background:#fef2f2;">
          <th style="padding:8px 10px;text-align:left;border-bottom:2px solid #fecaca;">対象ページ</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #fecaca;">判定</th>
          <th style="padding:8px 10px;text-align:center;border-bottom:2px solid #fecaca;">HTTP</th>
          <th style="padding:8px 10px;text-align:right;border-bottom:2px solid #fecaca;">応答</th>
        </tr>
      </thead>
      <tbody>${buildHealthRowsHtml(report.failed.length > 0 ? report.failed : report.results)}</tbody>
    </table>
    <p style="font-size:13px;color:#475569;">確認先: <a href="https://dash.cloudflare.com/">Cloudflare Dashboard</a> / <a href="https://hachinohenishibaseball.com/">本番サイト</a></p>
  `;

  const targets = report.failed.length > 0 ? report.failed : report.results;
  const textLines = [
    `🚨 ${titlePrefix}サイト異常アラート (${report.checkedAt})`,
    ...targets.map(
      (r) => `- ${r.name} (${r.url}): HTTP ${r.status} / ${r.latencyMs}ms / ${r.issues.join(', ') || 'テスト検知'}`
    ),
  ];

  return sendNotificationEmail(env, {
    subject: `🚨 ${titlePrefix}[異常アラート] サイト異常を検知しました (${report.checkedAt})`,
    html: wrapEmailLayout({
      badge: isTest ? 'ALERT TEST' : 'INCIDENT ALERT',
      badgeColor: '#dc2626',
      title: `${titlePrefix}サイト監視アラート`,
      subtitle: `検知日時: ${report.checkedAt}`,
      bodyHtml,
    }),
    text: textLines.join('\n'),
  });
}

async function sendWebhookEmail(env, data) {
  const source = data.source || 'Webhook';
  const eventName = data.event || 'event';
  const title = data.title || `${source} イベント通知 (${eventName})`;
  const message = data.message || '';
  const severity = String(data.severity || 'info').toLowerCase();
  const badgeColor = severity === 'error' || severity === 'critical' ? '#dc2626' : severity === 'warning' ? '#d97706' : '#2563eb';
  const detailsJson = data.details ? JSON.stringify(data.details, null, 2) : '';
  const ts = nowJstString();

  const bodyHtml = `
    <p style="margin-top:0;"><strong>ソース:</strong> ${escapeHtml(source)} / <strong>イベント:</strong> ${escapeHtml(eventName)}</p>
    ${message ? `<p style="white-space:pre-wrap;background:#f8fafc;padding:12px 14px;border-radius:8px;border:1px solid #e2e8f0;">${escapeHtml(message)}</p>` : ''}
    ${detailsJson ? `<pre style="background:#0f172a;color:#e2e8f0;padding:12px 14px;border-radius:8px;font-size:12px;overflow:auto;">${escapeHtml(detailsJson)}</pre>` : ''}
  `;

  const text = [
    `🔔 [Webhook通知] ${title}`,
    `日時: ${ts}`,
    `ソース: ${source} / イベント: ${eventName}`,
    message ? `\n${message}` : '',
    detailsJson ? `\n詳細:\n${detailsJson}` : '',
  ]
    .filter(Boolean)
    .join('\n');

  return sendNotificationEmail(env, {
    subject: `🔔 [${source}] ${title}`,
    html: wrapEmailLayout({
      badge: `WEBHOOK: ${source.toUpperCase()}`,
      badgeColor,
      title,
      subtitle: `受信日時: ${ts}`,
      bodyHtml,
    }),
    text,
  });
}

async function sendContactEmail(env, data) {
  const ts = nowJstString();
  const name = data.name || '未入力';
  const email = data.email || '未入力';
  const phone = data.phone || '未入力';
  const subjectText = data.subject || '（件名なし）';
  const message = data.message || '';

  const bodyHtml = `
    <p style="margin-top:0;">公式サイトのお問い合わせフォームから新しいメッセージが届きました。</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0;">
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;width:120px;">お名前</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(name)}</td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">メール</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(email)}</td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">電話番号</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(phone)}</td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">件名</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(subjectText)}</td></tr>
    </table>
    <div style="background:#f8fafc;border:1px solid #e2e8f0;border-radius:8px;padding:14px;white-space:pre-wrap;">${escapeHtml(message)}</div>
  `;

  const text = [
    `📩 [お問い合わせ通知] ${subjectText}`,
    `受信日時: ${ts}`,
    `お名前: ${name}`,
    `メール: ${email}`,
    `電話番号: ${phone}`,
    '',
    '--- お問い合わせ内容 ---',
    message,
  ].join('\n');

  return sendNotificationEmail(env, {
    subject: `📩 [お問い合わせ] ${subjectText}（${name} 様）`,
    html: wrapEmailLayout({
      badge: 'CONTACT FORM',
      badgeColor: '#0284c7',
      title: `新規お問い合わせ：${subjectText}`,
      subtitle: `受信日時: ${ts}`,
      bodyHtml,
    }),
    text,
    replyTo: email,
  });
}

async function sendPaymentEmail(env, data) {
  const ts = nowJstString();
  const name = data.name || '匿名OB';
  const period = data.period || 'OB';
  const year = data.year || new Date().getFullYear();
  const amount = Number(data.amount || 5000).toLocaleString('ja-JP');
  const message = data.message || '（応援メッセージなし）';
  const sessionId = data.sessionId || '-';

  const bodyHtml = `
    <p style="margin-top:0;">Stripe経由でOB会年会費のご納入が完了しました。</p>
    <table style="width:100%;border-collapse:collapse;font-size:14px;margin:14px 0;">
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;width:130px;">納入者</th><td style="padding:8px;border:1px solid #e2e8f0;"><strong>${escapeHtml(period)} ${escapeHtml(name)} 様</strong></td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">年度・金額</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(year)}年度 / <strong>¥${escapeHtml(amount)}</strong></td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">応援メッセージ</th><td style="padding:8px;border:1px solid #e2e8f0;">${escapeHtml(message)}</td></tr>
      <tr><th style="text-align:left;padding:8px;background:#f8fafc;border:1px solid #e2e8f0;">Session ID</th><td style="padding:8px;border:1px solid #e2e8f0;font-family:monospace;font-size:12px;">${escapeHtml(sessionId)}</td></tr>
    </table>
  `;

  const text = [
    `⚾ [年会費納入通知] ${period} ${name} 様（¥${amount}）`,
    `受信日時: ${ts}`,
    `年度: ${year}年度`,
    `応援メッセージ: ${message}`,
    `Stripe Session ID: ${sessionId}`,
  ].join('\n');

  return sendNotificationEmail(env, {
    subject: `⚾ [年会費納入] ${period} ${name} 様より ¥${amount} のご納入`,
    html: wrapEmailLayout({
      badge: 'STRIPE PAYMENT',
      badgeColor: '#16a34a',
      title: `年会費納入完了：${period} ${name} 様`,
      subtitle: `処理日時: ${ts}`,
      bodyHtml,
    }),
    text,
  });
}

export default {
  async scheduled(controller, env, ctx) {
    const report = await runHealthChecks(env);

    // 毎朝 08:00 JST (23:00 UTC) は必ず日次レポートを送信
    if (controller.cron === '0 23 * * *') {
      ctx.waitUntil(sendDailyReport(env, report));
      return;
    }

    // 30分ごとの死活監視では異常検知時のみ即アラート送信
    if (!report.allOk) {
      ctx.waitUntil(sendAlertEmail(env, report, false));
    }
  },

  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;

    if (request.method === 'GET' && (path === '/' || path === '/health')) {
      const report = await runHealthChecks(env);
      return json({
        service: 'hachinohenishi-notifier',
        emailSending: 'Cloudflare Workers Free Plan (verified destination)',
        ...report,
      });
    }

    if (request.method !== 'POST') {
      return json({ error: 'Method Not Allowed' }, 405);
    }

    if (!isAuthorized(request, env)) {
      return json({ error: 'Unauthorized: X-Notify-Key または Authorization: Bearer が必要です。' }, 401);
    }

    const body = await request.json().catch(() => ({}));

    try {
      if (path === '/webhook' || path === '/webhook/github' || path === '/webhook/stripe') {
        const result = await sendWebhookEmail(env, body);
        return json({ ok: true, type: 'webhook', result });
      }

      if (path === '/notify/contact') {
        const result = await sendContactEmail(env, body);
        return json({ ok: true, type: 'contact', result });
      }

      if (path === '/notify/payment') {
        const result = await sendPaymentEmail(env, body);
        return json({ ok: true, type: 'payment', result });
      }

      if (path === '/test') {
        const type = url.searchParams.get('type') || body.type || 'report';

        if (type === 'report') {
          const report = await runHealthChecks(env);
          const extraNote = body.extraNoteHtml || '';
          const result = await sendDailyReport(env, report, extraNote);
          return json({ ok: true, type, report, result });
        }

        if (type === 'alert') {
          const simulatedReport = {
            checkedAt: nowJstString(),
            baseUrl: env.SITE_URL || 'https://hachinohenishibaseball.com',
            allOk: false,
            totalCount: 1,
            okCount: 0,
            failedCount: 1,
            avgLatencyMs: 5420,
            results: [],
            failed: [
              {
                name: 'トップページ（シミュレーション）',
                url: 'https://hachinohenishibaseball.com/',
                status: 503,
                latencyMs: 5420,
                ok: false,
                issues: ['HTTP 503 Service Unavailable（テスト発報）', '応答遅延 (5420ms > 4000ms)'],
              },
            ],
          };
          const result = await sendAlertEmail(env, simulatedReport, true);
          return json({ ok: true, type, result });
        }

        if (type === 'webhook') {
          const result = await sendWebhookEmail(env, {
            source: body.source || 'GitHub Actions / Stripe',
            event: body.event || 'deployment.succeeded',
            title: body.title || '本番デプロイ完了＆Webhook通知テスト',
            message:
              body.message ||
              'Cloudflare Workers の /webhook エンドポイントが正常に稼働しています。\nGitHub Actions・Stripe・外部ツールからのイベントをこのようにメール化できます。',
            severity: body.severity || 'info',
            details: body.details || {
              repository: 'hachinohenishibaseball',
              environment: 'production',
              triggeredBy: 'Cloudflare Workers Free Plan',
            },
          });
          return json({ ok: true, type, result });
        }

        if (type === 'contact') {
          const result = await sendContactEmail(env, {
            name: body.name || 'テスト送信（OB会事務局）',
            email: body.email || 'globalbunny77@gmail.com',
            phone: body.phone || '0178-00-0000',
            subject: body.subject || 'お問い合わせ通知テスト',
            message:
              body.message ||
              '公式サイトのお問い合わせフォーム送信時に、このような形式で即座にメール通知が届きます。',
          });
          return json({ ok: true, type, result });
        }

        if (type === 'payment') {
          const result = await sendPaymentEmail(env, {
            name: body.name || 'テスト OB太郎',
            period: body.period || '第30期',
            year: body.year || 2026,
            amount: body.amount || 5000,
            message: body.message || '後輩たちの活躍を応援しています！（Stripe通知テスト）',
            sessionId: body.sessionId || 'cs_test_demo_notification',
          });
          return json({ ok: true, type, result });
        }

        return json({ error: `未対応のテストタイプです: ${type}` }, 400);
      }

      return json({ error: 'Not Found' }, 404);
    } catch (err) {
      return json(
        {
          ok: false,
          error: err instanceof Error ? err.message : 'メール送信に失敗しました。',
        },
        500
      );
    }
  },
};
