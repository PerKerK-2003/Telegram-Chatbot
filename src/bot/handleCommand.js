const { conversationHistory } = require("../utils/conservation");

function clearConversationHistory(chatId) {
  conversationHistory.delete(chatId);
  return "Lịch sử trò chuyện đã được xóa.";
}

function handleCommand(bot, msg) {
  const chatId = msg.chat.id;
  const command = msg.text;

  if (command === "/clear_history") {
    const response = clearConversationHistory(chatId);
    bot.sendMessage(chatId, response);
    return true;
  }

  if (command === "/teach") {
    const response = "Bạn đang dạy bot một câu hỏi và câu trả lời.";
    bot.sendMessage(chatId, response);
    return true;
  }

  return false;
}

module.exports = handleCommand;
