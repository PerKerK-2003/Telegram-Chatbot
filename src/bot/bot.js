const TelegramBot = require("node-telegram-bot-api");
const messageHandler = require("./handlers");
const { updateFAQ } = require("../services/faqs_service");
const { updateSupportStatus } = require("../embedding/textEmbedding");

function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  bot.on("message", async (msg) => {
    messageHandler(bot, msg);
  });
  bot.on("callback_query", async (callbackQuery) => {
    const msg = callbackQuery.message;
    const chatId = msg.chat.id;
    const userId = msg.from.id;
    const data = callbackQuery.data;
    const helpfulMatch = data.match(/^feedback_helpful_(\d+)$/);
    const notHelpfulMatch = data.match(/^feedback_not_helpful_(\d+)$/);

    if (helpfulMatch) {
      const rootMessageId = parseInt(helpfulMatch[1], 10);
      console.log(`User ${userId} marked FAQ ${rootMessageId} as helpful`);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Cảm ơn đánh giá hữu ích của bạn! 🙏",
      });
      updateFAQ(1, rootMessageId, chatId);
      updateSupportStatus(rootMessageId, true);
    } else if (notHelpfulMatch) {
      const rootMessageId = parseInt(notHelpfulMatch[1], 10);
      bot.answerCallbackQuery(callbackQuery.id, {
        text: "Xin lỗi, chúng tôi sẽ cố gắng cải thiện nó!",
      });
      updateFAQ(-1, rootMessageId, chatId);
      updateSupportStatus(rootMessageId, false);
    }
  });

  console.log("Telegram bot đang chạy...");
}

module.exports = initializeBot;
