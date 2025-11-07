/**
 * Google Apps Script for OB会出欠フォーム
 */

function doPost(e) {
  try {
    Logger.log('doPost called');
    
    // eがundefinedまたはnullの場合の処理
    if (!e) {
      Logger.log('ERROR: e is undefined or null');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'GASのデプロイ設定を確認してください。「次のユーザーとして実行」を「自分」に設定し、再デプロイしてください。'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // POSTリクエストからデータを取得
    let data = {};
    
    // e.parameterからデータを取得（FormData形式）
    if (e.parameter && typeof e.parameter === 'object') {
      Logger.log('Found e.parameter');
      data = {
        name: e.parameter.name || '',
        period: e.parameter.period || '',
        email: e.parameter.email || '',
        phone: e.parameter.phone || '',
        attendance: e.parameter.attendance || '',
        remarks: e.parameter.remarks || '',
        timestamp: e.parameter.timestamp || ''
      };
      Logger.log('Data from parameter: ' + JSON.stringify(data));
    }
    // e.postDataからデータを取得（JSON形式）
    else if (e.postData && e.postData.contents) {
      Logger.log('Found e.postData');
      try {
        data = JSON.parse(e.postData.contents);
        Logger.log('JSON parsed successfully');
      } catch (parseError) {
        Logger.log('JSON parse error: ' + parseError.toString());
      }
    }
    // データが取得できなかった場合
    else {
      Logger.log('ERROR: No data found');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'リクエストデータが取得できませんでした。GASのデプロイ設定を確認してください。',
        debug: {
          eType: typeof e,
          hasPostData: e.postData !== undefined,
          hasParameter: e.parameter !== undefined
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // データの検証
    if (!data || !data.name || !data.period || !data.email) {
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
        const newSpreadsheet = SpreadsheetApp.create('OB会出欠フォーム回答');
        sheet = newSpreadsheet.getActiveSheet();
      }
    } catch (err) {
      const newSpreadsheet = SpreadsheetApp.create('OB会出欠フォーム回答');
      sheet = newSpreadsheet.getActiveSheet();
    }
    
    // ヘッダー行を確認・追加
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange('A1:G1').setValues([['氏名', '卒期', 'メールアドレス', '電話番号', '出欠', '備考', '送信日時']]);
      sheet.getRange('A1:G1').setFontWeight('bold');
    }
    
    // データを追加
    sheet.appendRow([
      data.name || '',
      data.period || '',
      data.email || '',
      data.phone || '',
      data.attendance || '',
      data.remarks || '',
      new Date().toLocaleString('ja-JP')
    ]);
    
    // メール送信
    const subject = '【OB会出欠フォーム】' + data.name + '様より出欠のご回答がありました';
    const body = 'OB会出欠フォームより以下の内容でご回答がありました。\n\n' +
      '━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n' +
      '【氏名】\n' + data.name + '\n\n' +
      '【卒期】\n' + data.period + '\n\n' +
      '【メールアドレス】\n' + data.email + '\n\n' +
      '【電話番号】\n' + (data.phone || '未入力') + '\n\n' +
      '【出欠】\n' + data.attendance + '\n\n' +
      '【備考・ご連絡事項】\n' + (data.remarks || 'なし') + '\n\n' +
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
  return ContentService.createTextOutput('OB会出欠フォーム - Google Apps Script is running!')
    .setMimeType(ContentService.MimeType.TEXT);
}

