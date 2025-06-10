const { google } = require("googleapis");
const path = require("path");

const auth = new google.auth.GoogleAuth({
  keyFile: path.join(
    __dirname,
    "../../credentials/gen-lang-client-0144459987-6832c2bfe09c.json"
  ),
  scopes: ["https://www.googleapis.com/auth/spreadsheets"],
});

const SHEET_ID = process.env.SHEET_ID;
const SHEET_NAME = "SupportHistory";

async function insertSupportMessageToSheet(
  message,
  response,
  messageId,
  chatId,
  userId,
  created_at,
  imageId = ""
) {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  // Step 1: Insert a blank row at index 1 (2nd row in the sheet, under the header)
  await sheets.spreadsheets.batchUpdate({
    spreadsheetId: SHEET_ID,
    requestBody: {
      requests: [
        {
          insertDimension: {
            range: {
              sheetId: await getSheetId(),
              dimension: "ROWS",
              startIndex: 1,
              endIndex: 2,
            },
            inheritFromBefore: false,
          },
        },
      ],
    },
  });

  // Step 2: Write the new data to that inserted row
  const rowData = [
    [message, response, messageId, chatId, userId, created_at, imageId || ""],
  ];

  await sheets.spreadsheets.values.update({
    spreadsheetId: SHEET_ID,
    range: `${SHEET_NAME}!B2`,
    valueInputOption: "USER_ENTERED",
    requestBody: {
      values: rowData,
    },
  });

  console.log("Đã thêm thông tin hỗ trợ vào sheet");
}

async function getSheetId() {
  const client = await auth.getClient();
  const sheets = google.sheets({ version: "v4", auth: client });

  const response = await sheets.spreadsheets.get({
    spreadsheetId: SHEET_ID,
  });

  const sheet = response.data.sheets.find(
    (s) => s.properties.title === SHEET_NAME
  );

  if (!sheet) {
    throw new Error(`Không tìm thấy sheet với tên ${SHEET_NAME}`);
  }

  return sheet.properties.sheetId;
}

module.exports = { insertSupportMessageToSheet };
