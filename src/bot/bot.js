const TelegramBot = require("node-telegram-bot-api");
const handleMessageOrCommand = require("./handlers");
const {
  updateFAQ,
  updateHelpfulResponse,
} = require("../services/faqs_service");
const { updateSupportStatus } = require("../embedding/textEmbedding");

function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  bot.on("message", (msg) => handleMessageOrCommand(bot, msg));
  bot.on("callback_query", (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const messageId = msg.message_id;
    const userId = msg.from.id;
    const data = callbackQuery.data;
    if (data === "feedback_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Cảm ơn đánh giá hữu ích của bạn! 🙏",
      });
      updateFAQ(1, messageId, chatId, userId);
      updateSupportStatus(messageId - 1, true);
      updateHelpfulResponse(messageId, chatId, userId);
    } else if (data === "feedback_not_helpful") {
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Xin lỗi, chúng tôi sẽ cố gắng cải thiện nó!",
      });
      updateFAQ(0, messageId, chatId, userId);
      updateSupportStatus(messageId - 1, false);
      updateHelpfulResponse(messageId, chatId, userId);
    }
  });

  console.log("Telegram bot đang chạy...");
}

module.exports = initializeBot;
