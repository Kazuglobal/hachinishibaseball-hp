/**
 * Google Apps Script 統合版（出欠フォーム + お問い合わせフォーム）
 *
 * サイトの2つのフォームは同じ Web App URL（environment.gasWebAppUrl）へ送信するため、
 * 1つのデプロイで両方を受け付ける必要があります。送信データの formType で振り分けます。
 *   formType=attendance : 総会・懇親会の出欠 → シート「総会出欠」
 *   formType=contact    : お問い合わせ       → シート「お問い合わせ」
 *
 * 事前設定（スクリプトのプロパティ）
 *   NOTIFICATION_EMAIL : 通知先メールアドレス（未設定時は hachinishibaseball@gmail.com）
 *   SPREADSHEET_ID     : 記録先スプレッドシートID（未設定時はこのプロジェクトに紐付いたシート、
 *                        それも無ければ新規作成してIDを保存）
 * デプロイ: 次のユーザーとして実行=自分 / アクセスできるユーザー=全員（更新時は「新しいバージョン」）
 */

var DEFAULT_NOTIFICATION_EMAIL = 'hachinishibaseball@gmail.com';

var FORMS = {
  attendance: {
    sheetName: '総会出欠',
    header: ['送信日時', '開催回', '氏名', '卒期', 'メールアドレス', '電話番号', '出欠', '備考'],
    required: ['name', 'period', 'email', 'attendance'],
    row: function (d) { return [d.event, d.name, d.period, d.email, d.phone, d.attendance, d.remarks]; },
    mailSubject: function (d) { return '【OB会出欠フォーム】' + d.name + '様より出欠のご回答がありました（' + d.attendance + '）'; },
    mailBody: function (d) {
      return [['開催回', d.event || '未設定'], ['氏名', d.name], ['卒期', d.period], ['メールアドレス', d.email],
              ['電話番号', d.phone || '未入力'], ['出欠', d.attendance], ['備考・ご連絡事項', d.remarks || 'なし']];
    }
  },
  contact: {
    sheetName: 'お問い合わせ',
    header: ['送信日時', 'お名前', 'メールアドレス', '電話番号', '件名', 'お問い合わせ内容'],
    required: ['name', 'email', 'message'],
    row: function (d) { return [d.name, d.email, d.phone, d.subject, d.message]; },
    mailSubject: function (d) { return '【お問い合わせフォーム】' + d.name + '様よりお問い合わせがありました'; },
    mailBody: function (d) {
      return [['お名前', d.name], ['メールアドレス', d.email], ['電話番号', d.phone || '未入力'],
              ['件名', d.subject || '未入力'], ['お問い合わせ内容', d.message]];
    }
  }
};

/** 制御文字除去・トリム・長さ制限 */
function sanitizeInput(input, maxLength) {
  var s = String(input === undefined || input === null ? '' : input);
  s = s.replace(/[\x00-\x08\x0B\x0C\x0E-\x1F\x7F]/g, '').trim();
  return s.length > (maxLength || 1000) ? s.substring(0, maxLength || 1000) : s;
}

/** セルが数式として解釈されないようにする */
function sanitizeForSheet(value) {
  var s = String(value === undefined || value === null ? '' : value);
  return /^[=+\-@]/.test(s) ? "'" + s : s;
}

function validateEmail(email) {
  return typeof email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function jsonResponse(obj) {
  return ContentService.createTextOutput(JSON.stringify(obj)).setMimeType(ContentService.MimeType.JSON);
}

/** formType が無い古いクライアント向けに項目から推定 */
function detectFormType(p) {
  if (p.formType && FORMS[p.formType]) return p.formType;
  if (p.period || p.attendance) return 'attendance';
  return 'contact';
}

function readParams(e) {
  if (e.parameter && Object.keys(e.parameter).length) return e.parameter;
  if (e.postData && e.postData.contents) {
    try { return JSON.parse(e.postData.contents); } catch (err) { /* fallthrough */ }
  }
  return null;
}

function getSpreadsheet() {
  var props = PropertiesService.getScriptProperties();
  var id = props.getProperty('SPREADSHEET_ID');
  if (id) {
    try { return SpreadsheetApp.openById(id); } catch (err) { Logger.log('openById failed: ' + err); }
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (active) return active;
  var created = SpreadsheetApp.create('OB会フォーム回答');
  props.setProperty('SPREADSHEET_ID', created.getId());
  return created;
}

function getSheet(cfg) {
  var ss = getSpreadsheet();
  var sheet = ss.getSheetByName(cfg.sheetName) || ss.insertSheet(cfg.sheetName);
  if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, cfg.header.length).setValues([cfg.header]).setFontWeight('bold');
    sheet.setFrozenRows(1);
  }
  return sheet;
}

function doPost(e) {
  try {
    var raw = e ? readParams(e) : null;
    if (!raw) {
      return jsonResponse({ success: false, error: 'リクエストデータが取得できませんでした。デプロイ設定（実行ユーザー=自分／アクセス=全員）を確認してください。' });
    }

    var type = detectFormType(raw);
    var cfg = FORMS[type];

    var d = {};
    ['name', 'period', 'email', 'phone', 'attendance', 'remarks', 'event', 'subject', 'message'].forEach(function (k) {
      d[k] = sanitizeInput(raw[k], (k === 'message' || k === 'remarks') ? 5000 : 300);
    });

    for (var i = 0; i < cfg.required.length; i++) {
      if (!d[cfg.required[i]]) return jsonResponse({ success: false, error: '必須項目が不足しています' });
    }
    if (!validateEmail(d.email)) return jsonResponse({ success: false, error: 'メールアドレスの形式が正しくありません' });
    if (type === 'attendance' && d.attendance !== '出席' && d.attendance !== '欠席') {
      return jsonResponse({ success: false, error: '出欠の値が正しくありません' });
    }

    var now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      getSheet(cfg).appendRow([now].concat(cfg.row(d).map(sanitizeForSheet)));
    } finally {
      lock.releaseLock();
    }

    var lines = cfg.mailBody(d).map(function (kv) { return '【' + kv[0] + '】\n' + kv[1]; });
    var body = '以下の内容で送信がありました。\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      lines.join('\n\n') + '\n\n【送信日時】\n' + now + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    try {
      MailApp.sendEmail({
        to: PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL') || DEFAULT_NOTIFICATION_EMAIL,
        replyTo: d.email,
        subject: cfg.mailSubject(d),
        body: body
      });
    } catch (mailError) {
      Logger.log('メール送信エラー: ' + mailError);
    }

    return jsonResponse({ success: true, message: '送信が完了しました。' });
  } catch (error) {
    Logger.log('ERROR: ' + error + '\n' + (error && error.stack));
    return jsonResponse({ success: false, error: '送信処理中にエラーが発生しました。しばらくしてから再度お試しください。' });
  }
}

function doGet() {
  return ContentService.createTextOutput('OB会フォーム（出欠・お問い合わせ） - Google Apps Script is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}

/**
 * 【初回・コード更新後に1回だけ手動実行】権限の承認と動作確認用。
 * エディタ上部の関数選択で「authorizeAndTest」を選び「実行」→ 権限を承認してください。
 * シート作成とヘッダー行の確認まで行います（回答行は追加しません）。
 */
function authorizeAndTest() {
  Object.keys(FORMS).forEach(function (k) { getSheet(FORMS[k]); });
  LockService.getScriptLock().tryLock(1000);
  LockService.getScriptLock().releaseLock();
  Logger.log('メール残り送信可能数: ' + MailApp.getRemainingDailyQuota());
  Logger.log('記録先: ' + getSpreadsheet().getUrl());
  Logger.log('OK: 権限承認・シート確認が完了しました。「新しいバージョン」で再デプロイしてください。');
}
