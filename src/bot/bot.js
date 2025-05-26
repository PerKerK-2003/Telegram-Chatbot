const TelegramBot = require("node-telegram-bot-api");
const handleMessage = require("./handlers");

function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  bot.on("message", (msg) => handleMessage(bot, msg));
  bot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const data = callbackQuery.data;

    if (data === "feedback_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Cảm ơn đánh giá hữu ích của bạn! 🙏",
      });
    } else if (data === "feedback_not_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Xin lỗi, chúng tôi sẽ cố gắng cải thiện nó!",
      });
    }
  });
  console.log("Telegram bot đang chạy...");
}

module.exports = initializeBot;
