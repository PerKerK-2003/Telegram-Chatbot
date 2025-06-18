const {
  insertFAQ,
  getHistoryConversation,
  getRootMessage,
} = require("../services/faqs_service");
const {
  askGeminiWithImage,
  extractQAFromTextWithRetry,
} = require("../utils/gemini");
const {
  saveTextEmbedding,
  findSimilarEmbeddings,
} = require("../embedding/textEmbedding");
const { insertSupportMessageToSheet } = require("../sheet/googleSheet");

async function handleImageMessage(bot, msg, chatId) {
  const photoArray = msg.photo;
  const highestQualityPhoto = photoArray[photoArray.length - 1];
  const fileId = highestQualityPhoto.file_id;
  const userId = msg.from.id;
  const messageId = msg.message_id;
  let rootMessage;

  try {
    const fileLink = await bot.getFileLink(fileId);
    const prompt = msg.caption || "Đây là hình ảnh liên quan";

    console.log("Câu hỏi:", prompt);
    const userIntent = await extractQAFromTextWithRetry(prompt);
    console.log("Ý định của người dùng:", userIntent);

    if (userIntent.type === "teach") {
      console.log(
        "Người dùng đang dạy bot với hình ảnh:",
        userIntent.question,
        "->",
        userIntent.answer
      );

      await insertFAQ(
        userIntent.question,
        userIntent.answer,
        messageId,
        chatId,
        userId,
        fileId
      );
      rootMessage = await getRootMessage(messageId, chatId, userId);

      await saveTextEmbedding(
        messageId,
        userId,
        chatId,
        userIntent.question,
        userIntent.answer,
        fileId,
        rootMessage ? rootMessage : ""
      );

      await insertSupportMessageToSheet(
        userIntent.question,
        userIntent.answer,
        messageId,
        chatId,
        userId,
        new Date().toISOString(),
        fileId,
        rootMessage ? rootMessage : ""
      );

      return bot.sendMessage(
        chatId,
        `✅ Đã học được thông tin mới từ hình ảnh!\n\n🧠 **Câu hỏi:** ${userIntent.question}\n💡 **Trả lời:** ${userIntent.answer}\n🖼️ **Kèm theo:** Hình ảnh minh họa\n\nTôi sẽ nhớ điều này để trả lời các câu hỏi tương tự sau.`
      );
    }

    const conversationHistory = await getHistoryConversation(chatId, userId);

    const relevantFAQs = await findSimilarEmbeddings(prompt, 3);

    let contextPrompt = `Dưới đây là lịch sử trò chuyện gần đây nếu có: 
    ${conversationHistory
      .map((msg) => `- Người dùng: ${msg.question}\n  Bot: ${msg.answer}`)
      .join("\n")};
    Hướng dẫn phân tích hình ảnh:
    - Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
    - Phân tích hình ảnh trong ngữ cảnh của cuộc trò chuyện trước
    - Trả lời dựa trên những gì bạn thấy trong hình ảnh
    - Nếu hình ảnh không rõ ràng, hãy tham khảo ngữ cảnh trước đó để hiểu ý định
    - Liên hệ bộ phận hỗ trợ nếu cần thiết
    Câu hỏi/Mô tả: ${prompt}`;
    console.log("Prompt:", contextPrompt);

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];

      if (mostRelevantFAQ.score > 0.99) {
        console.log("Điểm tương đồng gần nhất:", mostRelevantFAQ.score);

        const response = mostRelevantFAQ.answer;
        await insertSupportMessageToSheet(
          prompt,
          response,
          messageId,
          chatId,
          userId,
          new Date().toISOString(),
          fileId,
          rootMessage ? rootMessage : ""
        );

        return bot.sendMessage(chatId, response, {
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
      }
    }

    const geminiResponse = await askGeminiWithImage(fileLink, contextPrompt);

    await saveTextEmbedding(
      messageId,
      userId,
      chatId,
      prompt,
      geminiResponse,
      fileId,
      rootMessage ? rootMessage : ""
    );
    await insertFAQ(prompt, geminiResponse, messageId, chatId, userId, fileId);
    rootMessage = await getRootMessage(messageId, chatId, userId);
    await insertSupportMessageToSheet(
      prompt,
      geminiResponse,
      messageId,
      chatId,
      userId,
      new Date().toISOString(),
      fileId,
      rootMessage ? rootMessage : ""
    );

    bot.sendMessage(chatId, geminiResponse, {
      reply_markup: {
        inline_keyboard: [
          [
            { text: "👍 Giúp ích", callback_data: "feedback_helpful" },
            { text: "👎 Không hữu ích", callback_data: "feedback_not_helpful" },
          ],
        ],
      },
    });
  } catch (err) {
    console.error("Có lỗi xảy ra trong quá trình xử lý ảnh:", err);
    bot.sendMessage(
      chatId,
      "Xin lỗi, tôi không thể xử lý ảnh của bạn. Vui lòng thử lại sau."
    );
  }
}

module.exports = handleImageMessage;
