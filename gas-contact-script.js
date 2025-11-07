/**
 * Google Apps Script for お問い合わせフォーム
 */

/**
 * ユーザー入力をサニタイズするヘルパー関数
 * @param {*} input - サニタイズする入力値
 * @param {number} maxLength - 最大文字数（デフォルト: 1000）
 * @return {string} サニタイズされた文字列
 */
function sanitizeInput(input, maxLength) {
  maxLength = maxLength || 1000;
  
  // 文字列に変換
  let sanitized = String(input || '');
  
  // 制御文字を削除（\x00-\x1F と \x7F）
  sanitized = sanitized.replace(/[\x00-\x1F\x7F]/g, '');
  
  // 前後の空白を削除
  sanitized = sanitized.trim();
  
  // 最大長に制限
  if (sanitized.length > maxLength) {
    sanitized = sanitized.substring(0, maxLength);
  }
  
  return sanitized;
}

/**
 * メールアドレスの形式を検証するヘルパー関数
 * @param {string} email - 検証するメールアドレス
 * @return {boolean} 有効なメールアドレスの場合true
 */
function validateEmail(email) {
  if (!email || typeof email !== 'string') {
    return false;
  }
  
  // トリムして空白を削除
  const trimmedEmail = email.trim();
  
  // 基本的なメールアドレス形式の検証（RFC風のシンプルな正規表現）
  // ローカル部@ドメイン部.トップレベルドメイン の形式をチェック
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  
  return emailRegex.test(trimmedEmail);
}

function doPost(e) {
  try {
    Logger.log('doPost called');
    Logger.log('e: ' + (e ? 'exists' : 'undefined'));
    Logger.log('e type: ' + typeof e);
    
    // Script Propertiesから通知メールアドレスを取得
    const notificationEmail = PropertiesService.getScriptProperties().getProperty('NOTIFICATION_EMAIL');
    if (!notificationEmail) {
      const errorMsg = 'NOTIFICATION_EMAILプロパティが設定されていません。PropertiesService.getScriptProperties().setProperty(\'NOTIFICATION_EMAIL\', \'<email>\')で設定してください。';
      Logger.log('ERROR: ' + errorMsg);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: errorMsg
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // eがundefinedまたはnullの場合の処理
    if (!e) {
      Logger.log('ERROR: e is undefined or null');
      Logger.log('This usually means the deployment settings are incorrect.');
      Logger.log('Please check:');
      Logger.log('1. "Execute as" is set to "Me"');
      Logger.log('2. "Who has access" is set to "Anyone"');
      Logger.log('3. A new version was deployed after changing settings');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'GASのデプロイ設定を確認してください。「次のユーザーとして実行」を「自分」に設定し、「アクセスできるユーザー」を「全員」に設定してから、必ず「新しいバージョン」で再デプロイしてください。'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // eオブジェクトの内容をログに記録（デバッグ用）
    try {
      Logger.log('e keys: ' + Object.keys(e).join(', '));
      if (e.parameter) {
        Logger.log('e.parameter exists with keys: ' + Object.keys(e.parameter).join(', '));
      } else {
        Logger.log('e.parameter is undefined');
      }
      if (e.postData) {
        Logger.log('e.postData exists, type: ' + e.postData.type);
      } else {
        Logger.log('e.postData is undefined');
      }
    } catch (logError) {
      Logger.log('Error logging e object: ' + logError.toString());
    }
    
    // POSTリクエストからデータを取得
    let data = {};
    
    // まず、e.parameterからデータを取得（application/x-www-form-urlencoded形式）
    if (e.parameter && typeof e.parameter === 'object') {
      Logger.log('Found e.parameter - extracting data');
      data = {
        name: e.parameter.name || '',
        email: (e.parameter.email || '').trim(),
        phone: e.parameter.phone || '',
        subject: e.parameter.subject || '',
        message: e.parameter.message || ''
      };
      Logger.log('Data extracted from parameter: ' + JSON.stringify(data));
    }
    // 次に、e.postDataからデータを取得（JSON形式）
    else if (e.postData && e.postData.contents) {
      Logger.log('Found e.postData - parsing JSON');
      try {
        data = JSON.parse(e.postData.contents);
        // メールアドレスをトリム
        if (data.email) {
          data.email = data.email.trim();
        }
        // クライアントから送られてくるtimestampは使用しない（サーバー側で生成するため削除）
        if (data.timestamp !== undefined) {
          delete data.timestamp;
        }
        Logger.log('JSON parsed successfully: ' + JSON.stringify(data));
      } catch (parseError) {
        Logger.log('JSON parse error: ' + parseError.toString());
        Logger.log('Raw contents: ' + e.postData.contents.substring(0, 200));
      }
    }
    // データが取得できなかった場合
    else {
      Logger.log('ERROR: No data found in e.parameter or e.postData');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'リクエストデータが取得できませんでした。GASのデプロイ設定を確認してください。',
        debug: {
          eType: typeof e,
          eKeys: e ? Object.keys(e).join(', ') : 'none',
          hasPostData: e && e.postData !== undefined,
          hasParameter: e && e.parameter !== undefined
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // データの検証
    if (!data || !data.name || !data.email || !data.message) {
      Logger.log('Validation failed');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '必須項目が不足しています'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // メールアドレスの形式検証
    if (!validateEmail(data.email)) {
      Logger.log('Email validation failed for: ' + data.email);
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'メールアドレスの形式が正しくありません'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('Data received: ' + JSON.stringify(data));
    
    // スプレッドシートの処理
    let sheet;
    const scriptProperties = PropertiesService.getScriptProperties();
    let spreadsheetId = scriptProperties.getProperty('SPREADSHEET_ID');
    
    if (spreadsheetId) {
      // 保存されたIDでスプレッドシートを開く
      try {
        Logger.log('Opening spreadsheet with ID: ' + spreadsheetId);
        const spreadsheet = SpreadsheetApp.openById(spreadsheetId);
        sheet = spreadsheet.getActiveSheet();
        Logger.log('Successfully opened existing spreadsheet');
      } catch (openError) {
        // IDが無効な場合（削除されたなど）、新規作成
        Logger.log('Failed to open spreadsheet with ID ' + spreadsheetId + ': ' + openError.toString());
        Logger.log('Creating new spreadsheet');
        const newSpreadsheet = SpreadsheetApp.create('お問い合わせフォーム回答');
        spreadsheetId = newSpreadsheet.getId();
        scriptProperties.setProperty('SPREADSHEET_ID', spreadsheetId);
        sheet = newSpreadsheet.getActiveSheet();
        Logger.log('Created new spreadsheet with ID: ' + spreadsheetId);
      }
    } else {
      // IDが保存されていない場合、新規作成してIDを保存
      Logger.log('No spreadsheet ID found, creating new spreadsheet');
      const newSpreadsheet = SpreadsheetApp.create('お問い合わせフォーム回答');
      spreadsheetId = newSpreadsheet.getId();
      scriptProperties.setProperty('SPREADSHEET_ID', spreadsheetId);
      sheet = newSpreadsheet.getActiveSheet();
      Logger.log('Created new spreadsheet with ID: ' + spreadsheetId);
    }
    
    // ヘッダー行を確認・追加
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange('A1:F1').setValues([['お名前', 'メールアドレス', '電話番号', '件名', 'お問い合わせ内容', '送信日時']]);
      sheet.getRange('A1:F1').setFontWeight('bold');
    }
    
    // データを追加
    sheet.appendRow([
      data.name || '',
      data.email || '',
      data.phone || '',
      data.subject || '',
      data.message || '',
      new Date().toLocaleString('ja-JP')
    ]);
    
    // メール送信（ユーザー入力をサニタイズ）
    const sanitizedName = sanitizeInput(data.name);
    const sanitizedEmail = sanitizeInput(data.email);
    const sanitizedPhone = sanitizeInput(data.phone);
    const sanitizedSubject = sanitizeInput(data.subject);
    const sanitizedMessage = sanitizeInput(data.message);
    
    const subject = '【お問い合わせフォーム】' + sanitizedName + '様よりお問い合わせがありました';
    const body = 'お問い合わせフォームより以下の内容でお問い合わせがありました。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '【お名前】\n' + sanitizedName + '\n\n' +
      '【メールアドレス】\n' + sanitizedEmail + '\n\n' +
      '【電話番号】\n' + (sanitizedPhone || '未入力') + '\n\n' +
      '【件名】\n' + (sanitizedSubject || '未入力') + '\n\n' +
      '【お問い合わせ内容】\n' + sanitizedMessage + '\n\n' +
      '【送信日時】\n' + new Date().toLocaleString('ja-JP') + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    
    try {
      MailApp.sendEmail({
        to: notificationEmail,
        subject: subject,
        body: body
      });
      Logger.log('Email sent successfully to: ' + notificationEmail);
    } catch (mailError) {
      Logger.log('メール送信エラー: ' + mailError.toString());
    }
    
    // 成功レスポンス
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: '送信が完了しました。'
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    Logger.log('ERROR: ' + error.toString());
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

// GETリクエスト用（テスト用）
function doGet(e) {
  return ContentService.createTextOutput('お問い合わせフォーム - Google Apps Script is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}

