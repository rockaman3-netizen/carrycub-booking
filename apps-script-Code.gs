// Paste this whole file into script.google.com (a standalone script — no
// need to open it through the spreadsheet's Extensions menu). See
// APPS_SCRIPT_SETUP.md for full setup steps.
//
// This is a tiny JSON API in front of the spreadsheet, so the Next.js app
// can read/write rows without a Google Cloud service account. Every request
// must include the correct "secret" (set below via Script Properties) or it
// is rejected.

// Your CarryCub Bookings spreadsheet ID (from its URL, between /d/ and /edit).
var SPREADSHEET_ID = "1USe5mdQsUuuK5qFxgEqGTmmdqYetePilWttq6JWjEBM";

function doPost(e) {
  var result;
  try {
    var body = JSON.parse(e.postData.contents);
    var expected = PropertiesService.getScriptProperties().getProperty("API_SECRET");

    if (!expected || body.secret !== expected) {
      result = { error: "Unauthorized" };
    } else {
      var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
      var sheet = ss.getSheetByName(body.sheet);
      if (!sheet) {
        result = { error: "Sheet not found: " + body.sheet };
      } else {
        result = handleAction(sheet, body);
      }
    }
  } catch (err) {
    result = { error: String(err) };
  }
  return ContentService.createTextOutput(JSON.stringify(result)).setMimeType(
    ContentService.MimeType.JSON
  );
}

function handleAction(sheet, body) {
  switch (body.action) {
    case "getRows": {
      var lastRow = sheet.getLastRow();
      var lastCol = sheet.getLastColumn();
      if (lastRow < 2) return { values: [] };
      var values = sheet.getRange(2, 1, lastRow - 1, lastCol).getValues();
      // Normalize Dates (Sheets sometimes parses ISO strings into Date
      // objects) back to plain strings so the app's parsing stays simple.
      for (var i = 0; i < values.length; i++) {
        for (var j = 0; j < values[i].length; j++) {
          if (values[i][j] instanceof Date) {
            values[i][j] = values[i][j].toISOString();
          }
        }
      }
      return { values: values };
    }
    case "appendRow": {
      sheet.appendRow(body.row);
      return { ok: true };
    }
    case "updateRow": {
      var sheetRow = body.rowNumber + 1; // +1 for header row
      sheet.getRange(sheetRow, 1, 1, body.row.length).setValues([body.row]);
      return { ok: true };
    }
    case "deleteRow": {
      var delRow = body.rowNumber + 1; // +1 for header row
      sheet.deleteRow(delRow);
      return { ok: true };
    }
    default:
      return { error: "Unknown action: " + body.action };
  }
}

// Quick manual check: open this script, run this function once, and look
// at the execution log — confirms the script can see your sheet tabs.
function testConnection() {
  var ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  var names = ss.getSheets().map(function (s) {
    return s.getName();
  });
  Logger.log("Tabs found: " + names.join(", "));
}
