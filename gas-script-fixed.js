/**
 * Google Apps Script for OB会出欠フォーム（修正版）
 * 
 * 重要：このスクリプトを使用する前に、必ず以下を確認してください：
 * 1. 「デプロイ」→「デプロイを管理」→「編集」
 * 2. 「次のユーザーとして実行」が「自分」になっているか確認
 * 3. 「アクセスできるユーザー」が「全員」になっているか確認
 * 4. 設定を変更した場合は、必ず「新しいバージョン」で再デプロイ
 */

function doPost(e) {
  try {
    // デバッグ用ログ
    Logger.log('=== doPost called ===');
    Logger.log('e type: ' + typeof e);
    Logger.log('e is null: ' + (e === null));
    Logger.log('e is undefined: ' + (e === undefined));
    
    // eがundefinedまたはnullの場合の処理
    // GASのWeb Appでは、eは必ず存在するはずですが、念のため処理を追加
    if (e === undefined || e === null) {
      Logger.log('ERROR: e is undefined or null - this should not happen');
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'GASのデプロイ設定を確認してください。「次のユーザーとして実行」を「自分」に設定し、再デプロイしてください。'
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // eオブジェクトのキーを確認
    const eKeys = Object.keys(e);
    Logger.log('e keys: ' + eKeys.join(', '));
    Logger.log('e.parameter exists: ' + (e.parameter !== undefined));
    Logger.log('e.postData exists: ' + (e.postData !== undefined));
    
    // POSTリクエストからデータを取得
    let data = {};
    
    // まず、e.parameterからデータを取得（FormData形式）
    if (e.parameter && typeof e.parameter === 'object') {
      Logger.log('Found e.parameter');
      Logger.log('parameter keys: ' + Object.keys(e.parameter).join(', '));
      Logger.log('parameter values: ' + JSON.stringify(e.parameter));
      
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
    // 次に、e.postDataからデータを取得（JSON形式）
    else if (e.postData && e.postData.contents) {
      Logger.log('Found e.postData');
      Logger.log('postData.type: ' + e.postData.type);
      Logger.log('postData.contents length: ' + e.postData.contents.length);
      Logger.log('postData.contents preview: ' + e.postData.contents.substring(0, 500));
      
      try {
        data = JSON.parse(e.postData.contents);
        Logger.log('JSON parsed successfully');
      } catch (parseError) {
        Logger.log('JSON parse error: ' + parseError.toString());
        Logger.log('Raw contents: ' + e.postData.contents);
      }
    }
    // データが取得できなかった場合
    else {
      Logger.log('ERROR: No data found in e.parameter or e.postData');
      Logger.log('Full e object: ' + JSON.stringify(e));
      Logger.log('e.parameter type: ' + typeof e.parameter);
      Logger.log('e.postData type: ' + typeof e.postData);
      
      // エラーレスポンスを返す
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: 'リクエストデータが取得できませんでした。GASのデプロイ設定を確認してください。',
        debug: {
          eType: typeof e,
          eKeys: eKeys.join(', '),
          hasPostData: e.postData !== undefined,
          hasParameter: e.parameter !== undefined,
          eValue: JSON.stringify(e)
        }
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    // データの検証
    if (!data || !data.name || !data.period || !data.email) {
      Logger.log('Validation failed. data: ' + JSON.stringify(data));
      return ContentService.createTextOutput(JSON.stringify({
        success: false,
        error: '必須項目が不足しています: ' + JSON.stringify(data),
        receivedData: data
      })).setMimeType(ContentService.MimeType.JSON);
    }
    
    Logger.log('Data received successfully: ' + JSON.stringify(data));
    
    // スプレッドシートの処理
    let sheet;
    try {
      // 既存のスプレッドシートを開く（プロジェクトに紐付けられている場合）
      const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
      if (spreadsheet) {
        sheet = spreadsheet.getActiveSheet();
        Logger.log('Using existing spreadsheet');
      } else {
        // スプレッドシートが存在しない場合は新規作成
        const newSpreadsheet = SpreadsheetApp.create('OB会出欠フォーム回答');
        sheet = newSpreadsheet.getActiveSheet();
        Logger.log('Created new spreadsheet');
      }
    } catch (err) {
      // スプレッドシートが存在しない場合は新規作成
      Logger.log('Error accessing spreadsheet: ' + err.toString());
      const newSpreadsheet = SpreadsheetApp.create('OB会出欠フォーム回答');
      sheet = newSpreadsheet.getActiveSheet();
      Logger.log('Created new spreadsheet after error');
    }
    
    // ヘッダー行を確認・追加
    if (!sheet.getRange('A1').getValue()) {
      sheet.getRange('A1:G1').setValues([['氏名', '卒期', 'メールアドレス', '電話番号', '出欠', '備考', '送信日時']]);
      sheet.getRange('A1:G1').setFontWeight('bold');
      Logger.log('Header row added');
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
    Logger.log('Data appended to spreadsheet');
    
    // メール送信
    const subject = `【OB会出欠フォーム】${data.name}様より出欠のご回答がありました`;
    const body = `
OB会出欠フォームより以下の内容でご回答がありました。

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
【氏名】
${data.name}

【卒期】
${data.period}

【メールアドレス】
${data.email}

【電話番号】
${data.phone || '未入力'}

【出欠】
${data.attendance}

【備考・ご連絡事項】
${data.remarks || 'なし'}

【送信日時】
${new Date().toLocaleString('ja-JP')}
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
    `;
    
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
    // エラーログを記録
    Logger.log('ERROR: ' + error.toString());
    Logger.log('Error stack: ' + (error.stack || 'no stack'));
    
    // エラーレスポンス
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

