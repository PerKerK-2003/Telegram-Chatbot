const TelegramBot = require("node-telegram-bot-api");
const handleMessage = require("./handlers");

function initializeBot() {
  const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, {
    polling: true,
  });
  bot.on("message", (msg) => handleMessage(bot, msg));
  console.log("Telegram bot đang chạy...");
}

module.exports = initializeBot;
