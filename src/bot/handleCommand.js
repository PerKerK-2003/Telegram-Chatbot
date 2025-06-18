const ConversationHistory = require("../utils/conversation");
const conversationHistory = new ConversationHistory();

function clearConversationHistory(userId, chatId) {
  conversationHistory.clearHistory(userId, chatId);
  return "Lịch sử trò chuyện đã được xóa.";
}

function handleCommand(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const command = msg.text;

  if (command === "/clear_history") {
    const response = clearConversationHistory(userId, chatId);
    bot.sendMessage(chatId, response);
    return true;
  }
  return false;
}

module.exports = handleCommand;
