const {
  insertFAQ,
  getRootMessage,
  getHistoryConversation,
  getLatestAnswer,
} = require("../services/faqs_service");
const { askGemini, extractQAFromTextWithRetry } = require("../utils/gemini");
const handleImageMessage = require("./handleImage");
const {
  saveTextEmbedding,
  findSimilarEmbeddings,
} = require("../embedding/textEmbedding");

const { insertSupportMessageToSheet } = require("../sheet/googleSheet");

const greetings = ["hello", "xin chào"];

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  let rootMessage;

  bot.sendChatAction(chatId, "typing");

  if (msg.photo) {
    await handleImageMessage(bot, msg, chatId);
    return;
  }

  const question = msg.text;
  if (!question || question.trim().length === 0) {
    bot.sendMessage(
      chatId,
      "Xin vui lòng gửi một câu hỏi cụ thể để tôi có thể giúp bạn."
    );
    return;
  }

  if (greetings.some((greet) => question.toLowerCase().includes(greet))) {
    bot.sendMessage(
      chatId,
      "Chào bạn! Tôi là trợ lý AI, bạn cần tôi giúp gì hôm nay?"
    );
    return;
  }

  try {
    console.log("Câu hỏi:", question);
    const userIntent = await extractQAFromTextWithRetry(question);
    console.log("Ý định của người dùng:", userIntent);

    if (userIntent.type === "teach") {
      console.log(
        "Người dùng đang dạy bot:",
        userIntent.question,
        "->",
        userIntent.answer
      );

      await insertFAQ(
        userIntent.question,
        userIntent.answer,
        messageId,
        chatId,
        userId
      );
      rootMessage = await getRootMessage(messageId, chatId, userId);

      await saveTextEmbedding(
        messageId,
        userId,
        chatId,
        userIntent.question,
        userIntent.answer,
        rootMessage ? rootMessage : ""
      );

      await insertSupportMessageToSheet(
        userIntent.question,
        userIntent.answer,
        messageId,
        userId,
        chatId,
        new Date().toISOString(),
        "",
        rootMessage ? rootMessage : ""
      );

      return bot.sendMessage(
        chatId,
        `✅ Đã học được thông tin mới!\n\n🧠 **Câu hỏi:** ${userIntent.question}\n💡 **Trả lời:** ${userIntent.answer}\n\nTôi sẽ nhớ điều này để trả lời các câu hỏi tương tự sau.`
      );
    }

    const conversationHistory = await getHistoryConversation(chatId, userId);

    const relevantFAQs = await findSimilarEmbeddings(question, 3);

    console.log("Thông tin liên quan:", relevantFAQs.length);
    console.log("Relevant FAQs:", relevantFAQs);
    const latestAnswer = await getLatestAnswer(userId, chatId);

    let enhancedPrompt = `Dưới đây là lịch sử trò chuyện nếu có: 
    ${conversationHistory
      .map((msg) => `- Người dùng: ${msg.question}\n  Bot: ${msg.answer}`)
      .join("\n")};
    Phản hồi gần nhất của bot: ${
      latestAnswer ? latestAnswer.answer : "Không có phản hồi nào."
    }
    Hướng dẫn trả lời:
    - Nếu câu hỏi không rõ ràng, hãy yêu cầu người dùng cung cấp thêm thông tin
    - Cố gắng cung cấp câu trả lời chi tiết và đề xuất các hướng giải quyết
    - Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
    - Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời
    - Liên hệ bộ phận hỗ trợ nếu cần thiết
    `;
    console.log("Enhanced prompt:", enhancedPrompt);

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];
      if (mostRelevantFAQ.score > 0.99) {
        console.log("Điểm tương đồng gần nhất:", mostRelevantFAQ.score);

        await insertSupportMessageToSheet(
          question,
          mostRelevantFAQ.answer,
          messageId,
          chatId,
          userId,
          new Date().toISOString(),
          "",
          rootMessage ? rootMessage : ""
        );

        const response = mostRelevantFAQ.answer;

        bot.sendMessage(chatId, response, {
          reply_markup: {
            inline_keyboard: [
              [
                { text: "👍 Giúp ích", callback_data: "feedback_helpful" },
                {
                  text: "👎 Không hữu ích",
                  callback_data: "feedback_not_helpful",
                },
              ],
            ],
          },
        });
        return;
      }
    }
    const response = await askGemini(enhancedPrompt, question);
    await insertFAQ(question, response, messageId, chatId, userId);
    rootMessage = await getRootMessage(messageId, chatId, userId);
    await saveTextEmbedding(
      messageId,
      userId,
      chatId,
      question,
      response,
      rootMessage ? rootMessage : ""
    );
    await insertSupportMessageToSheet(
      question,
      response,
      messageId,
      chatId,
      userId,
      new Date().toISOString(),
      "",
      rootMessage ? rootMessage : ""
    );
    bot.sendMessage(chatId, response, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👍 Giúp ích", callback_data: "feedback_helpful" },
            {
              text: "👎 Không hữu ích",
              callback_data: "feedback_not_helpful",
            },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("Có lỗi xảy ra khi xử lý tin nhắn:", err);
    bot.sendMessage(
      chatId,
      "Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ."
    );
  }
}

module.exports = handleMessage;
