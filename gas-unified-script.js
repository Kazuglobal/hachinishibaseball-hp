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
  },
  membership_fee: {
    sheetName: '年会費納入',
    header: ['送信日時', 'セッションID', 'お名前', '卒期', '対象年度', '金額', 'メッセージ'],
    required: ['name', 'period'],
    skipEmailValidation: true,
    row: function (d) { return [d.sessionId, d.name, d.period, d.year || String(new Date().getFullYear()), d.amount || '5000', d.message]; },
    mailSubject: function (d) { return '【OB会年会費納入】' + d.period + ' ' + d.name + '様より年会費のご納入がありました（' + (d.amount || 5000) + '円）'; },
    mailBody: function (d) {
      return [['お名前', d.name], ['卒期', d.period], ['対象年度', (d.year || String(new Date().getFullYear())) + '年'],
              ['金額', (d.amount || '5000') + '円'], ['メッセージ', d.message || 'なし'],
              ['StripeセッションID', d.sessionId || '未設定']];
    }
  },
  cheer_tip: {
    sheetName: '寄付',
    header: ['送信日時', 'セッションID', 'お名前', '回期', '種目', '金額', '口数', '応援メッセージ'],
    required: ['name', 'period'],
    skipEmailValidation: true,
    row: function (d) { return [d.sessionId, d.name, d.period, d.category || 'batting', d.amount || '500', d.quantity || '1', d.message]; },
    mailSubject: function (d) { return '【記念ボール寄付】' + d.period + ' ' + d.name + '様よりご寄付がありました（' + (d.amount || 500) + '円）'; },
    mailBody: function (d) {
      return [['お名前', d.name], ['回期', d.period], ['応援内容', '八戸西記念ボール寄付'],
              ['金額', (d.amount || '500') + '円（' + (d.quantity || '1') + '球）'],
              ['応援メッセージ', d.message || 'なし'], ['StripeセッションID', d.sessionId || '未設定']];
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
    ['name', 'period', 'email', 'phone', 'attendance', 'remarks', 'event', 'subject', 'message', 'category', 'amount', 'quantity', 'sessionId', 'year'].forEach(function (k) {
      d[k] = sanitizeInput(raw[k], (k === 'message' || k === 'remarks') ? 5000 : 300);
    });

    for (var i = 0; i < cfg.required.length; i++) {
      if (!d[cfg.required[i]]) return jsonResponse({ success: false, error: '必須項目が不足しています' });
    }
    if (!cfg.skipEmailValidation && !validateEmail(d.email)) {
      return jsonResponse({ success: false, error: 'メールアドレスの形式が正しくありません' });
    }
    if (type === 'attendance' && d.attendance !== '出席' && d.attendance !== '欠席') {
      return jsonResponse({ success: false, error: '出欠の値が正しくありません' });
    }

    var now = new Date().toLocaleString('ja-JP', { timeZone: 'Asia/Tokyo' });
    var isDuplicate = false;

    var lock = LockService.getScriptLock();
    lock.waitLock(10000);
    try {
      var sheet = getSheet(cfg);
      if ((type === 'membership_fee' || type === 'cheer_tip') && d.sessionId) {
        var lastRow = sheet.getLastRow();
        if (lastRow > 1) {
          var existingIds = sheet.getRange(2, 2, lastRow - 1, 1).getValues();
          for (var r = 0; r < existingIds.length; r++) {
            if (String(existingIds[r][0]) === d.sessionId) {
              isDuplicate = true;
              break;
            }
          }
        }
      }
      if (!isDuplicate) {
        sheet.appendRow([now].concat(cfg.row(d).map(sanitizeForSheet)));
      }
    } finally {
      lock.releaseLock();
    }

    if (isDuplicate) {
      return jsonResponse({ success: true, duplicate: true, message: '既に記録済みです。' });
    }

    var lines = cfg.mailBody(d).map(function (kv) { return '【' + kv[0] + '】\n' + kv[1]; });
    var body = '以下の内容で送信がありました。\n\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      lines.join('\n\n') + '\n\n【送信日時】\n' + now + '\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    try {
      var mailOpts = {
        to: PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL') || DEFAULT_NOTIFICATION_EMAIL,
        subject: cfg.mailSubject(d),
        body: body
      };
      if (d.email && validateEmail(d.email)) {
        mailOpts.replyTo = d.email;
      }
      MailApp.sendEmail(mailOpts);
    } catch (mailError) {
      Logger.log('メール送信エラー: ' + mailError);
    }

    return jsonResponse({ success: true, message: '送信が完了しました。' });
  } catch (error) {
    Logger.log('ERROR: ' + error + '\n' + (error && error.stack));
    return jsonResponse({ success: false, error: '送信処理中にエラーが発生しました。しばらくしてから再度お試しください。' });
  }
}

function doGet(e) {
  try {
    var type = e && e.parameter && e.parameter.type;
    if (type === 'membership_fee') {
      var mfSheet = getSheet(FORMS.membership_fee);
      var mfLastRow = mfSheet.getLastRow();
      var records = [];
      if (mfLastRow > 1) {
        var mfValues = mfSheet.getRange(2, 1, mfLastRow - 1, 7).getValues();
        for (var j = mfValues.length - 1; j >= 0; j--) {
          var mfRow = mfValues[j];
          if (!mfRow[2]) continue;
          records.push({
            createdAt: mfRow[0] instanceof Date ? mfRow[0].toISOString() : String(mfRow[0]),
            sessionId: String(mfRow[1] || ''),
            name: String(mfRow[2]),
            period: String(mfRow[3] || 'OB'),
            year: Number(mfRow[4]) || new Date().getFullYear(),
            amount: Number(mfRow[5]) || 5000,
            message: String(mfRow[6] || '')
          });
        }
      }
      return jsonResponse({ success: true, records: records });
    }
    if (type === 'cheer_tips') {
      var ctSheet = getSheet(FORMS.cheer_tip);
      var ctLastRow = ctSheet.getLastRow();
      var donations = [];
      if (ctLastRow > 1) {
        var ctValues = ctSheet.getRange(2, 1, ctLastRow - 1, 8).getValues();
        for (var k = ctValues.length - 1; k >= 0; k--) {
          var ctRow = ctValues[k];
          if (!ctRow[2]) continue;
          donations.push({
            createdAt: ctRow[0] instanceof Date ? ctRow[0].toISOString() : String(ctRow[0]),
            sessionId: String(ctRow[1] || ''),
            name: String(ctRow[2]),
            period: String(ctRow[3] || 'OB'),
            category: String(ctRow[4] || 'batting'),
            amount: Number(ctRow[5]) || 500,
            quantity: Number(ctRow[6]) || 1,
            message: String(ctRow[7] || '')
          });
        }
      }
      return jsonResponse({ success: true, donations: donations });
    }
  } catch (err) {
    Logger.log('doGet ERROR: ' + err);
    return jsonResponse({ success: false, error: 'データ取得に失敗しました' });
  }
  return ContentService.createTextOutput('OB会フォーム（出欠・お問い合わせ・年会費納入・記念ボール寄付） - Google Apps Script is running!')
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
