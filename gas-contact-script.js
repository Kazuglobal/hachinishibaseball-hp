/**
 * Google Apps Script for お問い合わせフォーム
 */

function doPost(e) {
  try {
    Logger.log('doPost called');
    Logger.log('e: ' + (e ? 'exists' : 'undefined'));
    Logger.log('e type: ' + typeof e);
    
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
        email: e.parameter.email || '',
        phone: e.parameter.phone || '',
        subject: e.parameter.subject || '',
        message: e.parameter.message || '',
        timestamp: e.parameter.timestamp || ''
      };
      Logger.log('Data extracted from parameter: ' + JSON.stringify(data));
    }
    // 次に、e.postDataからデータを取得（JSON形式）
    else if (e.postData && e.postData.contents) {
      Logger.log('Found e.postData - parsing JSON');
      try {
        data = JSON.parse(e.postData.contents);
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
    
    Logger.log('Data received: ' + JSON.stringify(data));
    
    // スプレッドシートの処理
    let sheet;
    try {
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (spreadsheet) {
        sheet = spreadsheet.getActiveSheet();
      } else {
        const newSpreadsheet = SpreadsheetApp.create('お問い合わせフォーム回答');
        sheet = newSpreadsheet.getActiveSheet();
      }
    } catch (err) {
      const newSpreadsheet = SpreadsheetApp.create('お問い合わせフォーム回答');
      sheet = newSpreadsheet.getActiveSheet();
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
    
    // メール送信
    const subject = '【お問い合わせフォーム】' + data.name + '様よりお問い合わせがありました';
    const body = 'お問い合わせフォームより以下の内容でお問い合わせがありました。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '【お名前】\n' + data.name + '\n\n' +
      '【メールアドレス】\n' + data.email + '\n\n' +
      '【電話番号】\n' + (data.phone || '未入力') + '\n\n' +
      '【件名】\n' + (data.subject || '未入力') + '\n\n' +
      '【お問い合わせ内容】\n' + data.message + '\n\n' +
      '【送信日時】\n' + new Date().toLocaleString('ja-JP') + '\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━';
    
    try {
      MailApp.sendEmail({
        to: 'hachinishibaseball@gmail.com',
        subject: subject,
        body: body
      });
      Logger.log('Email sent successfully');
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

