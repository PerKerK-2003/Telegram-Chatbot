const {
  insertFAQ,
  getHistoryConversation,
  getRootMessage,
} = require("../services/faqs_service");
const { askGeminiWithImage } = require("../utils/gemini");
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

    const conversationHistory = await getHistoryConversation(chatId, userId);

    const relevantFAQs = await findSimilarEmbeddings(prompt, 3);

    let contextPrompt = `Dưới đây là lịch sử trò chuyện gần đây nếu có: 
    ${conversationHistory
      .map((msg) => `- Người dùng: ${msg.question}\n  Bot: ${msg.answer}`)
      .join("\n")};
    Hướng dẫn phân tích hình ảnh:
    - Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
    - Trả lời dựa trên những thông tin bạn thấy trong hình ảnh
    - Cung cấp các nguyên nhân có thể gây ra vấn đề và đề xuất các hướng giải quyết
    - Nếu hình ảnh không rõ ràng, hãy tham khảo ngữ cảnh trước đó để hiểu ý định
    - Nếu đã đầy đủ thông tin thì trả lời đã tiếp nhận câu hỏi và sẽ chuyển đến bộ phận hỗ trợ
    Câu hỏi/Mô tả: ${prompt}`;
    console.log("Prompt:", contextPrompt);

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];

      if (mostRelevantFAQ.score > 0.99) {
        console.log("Điểm tương đồng gần nhất:", mostRelevantFAQ.score);

        const response = mostRelevantFAQ.answer;
        bot.sendMessage(chatId, response, {
          reply_to_message_id: messageId,
          reply_markup: {
            inline_keyboard: [
              [
                {
                  text: "👍 Giúp ích",
                  callback_data: `feedback_helpful_${messageId}`,
                },
                {
                  text: "👎 Không hữu ích",
                  callback_data: `feedback_not_helpful_${messageId}`,
                },
              ],
            ],
          },
        });
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
        return;
      }
    }

    const geminiResponse = await askGeminiWithImage(fileLink, contextPrompt);
    const sentMessage = await bot.sendMessage(chatId, geminiResponse, {
      reply_to_message_id: messageId,
      reply_markup: {
        inline_keyboard: [
          [
            {
              text: "👍 Giúp ích",
              callback_data: `feedback_helpful_${messageId}`,
            },
            {
              text: "👎 Không hữu ích",
              callback_data: `feedback_not_helpful_${messageId}`,
            },
          ],
        ],
      },
    });
    await saveTextEmbedding(
      messageId,
      userId,
      chatId,
      prompt,
      geminiResponse,
      fileId,
      rootMessage ? rootMessage : ""
    );
    await insertFAQ(
      prompt,
      geminiResponse,
      messageId,
      sentMessage.message_id,
      chatId,
      userId,
      fileId
    );
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
  } catch (err) {
    console.error("Có lỗi xảy ra trong quá trình xử lý ảnh:", err);
    bot.sendMessage(
      chatId,
      "Xin lỗi, tôi không thể xử lý ảnh của bạn. Vui lòng thử lại sau."
    );
  }
}

module.exports = handleImageMessage;
