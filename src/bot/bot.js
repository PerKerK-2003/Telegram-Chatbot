const TelegramBot = require("node-telegram-bot-api");
const handleMessageOrCommand = require("./handlers");
const { updateFAQ } = require("../services/faqs_service");

function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  bot.on("message", (msg) => handleMessageOrCommand(bot, msg));
  bot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const data = callbackQuery.data;

    if (data === "feedback_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Cảm ơn đánh giá hữu ích của bạn! 🙏",
      });
      updateFAQ(1, msg.message_id, chatId);
    } else if (data === "feedback_not_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Xin lỗi, chúng tôi sẽ cố gắng cải thiện nó!",
      });
      updateFAQ(0, msg.message_id, chatId);
    }
  });

  // const fileId =
  //   "AgACAgUAAx0CRK0DTQACCV1kJUn9tSxE229a28YRFkIQT44hxAACxLUxG1cxKVUL8iw9TYOALQEAAwIAA3MAAy8E";

  // bot.getFileLink(fileId).then((fileUrl) => {
  //   console.log("File URL:", fileUrl);
  //   // You can open this URL in the browser or download it using a fetch/axios request
  // });

  console.log("Telegram bot đang chạy...");
}

module.exports = initializeBot;
