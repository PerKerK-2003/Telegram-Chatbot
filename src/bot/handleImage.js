const { getFAQs, insertFAQ } = require("../services/faqs_service");
const {
  askGeminiWithImage,
  extractQAFromTextWithRetry,
} = require("../utils/gemini");
const ConversationHistory = require("../utils/conversation");
const {
  saveTextEmbedding,
  findSimilarEmbeddings,
} = require("../embedding/textEmbedding");
const { insertSupportMessageToSheet } = require("../sheet/googleSheet");

const conversationHistory = new ConversationHistory();

async function handleImageMessage(bot, msg, chatId) {
  const photoArray = msg.photo;
  const highestQualityPhoto = photoArray[photoArray.length - 1];
  const fileId = highestQualityPhoto.file_id;
  const userId = msg.from.id;

  try {
    const fileLink = await bot.getFileLink(fileId);
    bot.sendMessage(
      chatId,
      "Cảm ơn! Tôi đã nhận được ảnh của bạn và đang xử lý..."
    );

    const prompt = msg.caption || "Đây là hình ảnh liên quan";

    console.log("Analyzing image message intent for:", prompt);
    const userIntent = await extractQAFromTextWithRetry(prompt);
    console.log("Image message intent detected:", userIntent);

    if (userIntent.type === "teach") {
      console.log(
        "User is teaching bot with image:",
        userIntent.question,
        "->",
        userIntent.answer
      );

      await insertFAQ(
        userIntent.question,
        userIntent.answer,
        msg.message_id,
        msg.chat.id,
        msg.from.id,
        fileId
      );

      await saveTextEmbedding(
        userId,
        chatId,
        userIntent.question,
        userIntent.answer
      );

      await insertSupportMessageToSheet(
        userIntent.question,
        userIntent.answer,
        msg.message_id,
        msg.chat.id,
        msg.from.id,
        new Date().toISOString(),
        fileId
      );

      conversationHistory.addMessage(userId, chatId, prompt, userIntent.answer);

      return bot.sendMessage(
        chatId,
        `✅ Đã học được thông tin mới từ hình ảnh!\n\n🧠 **Câu hỏi:** ${userIntent.question}\n💡 **Trả lời:** ${userIntent.answer}\n🖼️ **Kèm theo:** Hình ảnh minh họa\n\nTôi sẽ nhớ điều này để trả lời các câu hỏi tương tự sau.`
      );
    }

    const followUpContext = conversationHistory.getFollowUpContext(
      userId,
      chatId
    );
    const conversationContext = conversationHistory.formatForGemini(
      userId,
      chatId
    );

    let relevantFAQs;
    let searchQuery = prompt;

    if (followUpContext && followUpContext.isFollowUp) {
      const contextualQuery = `${followUpContext.lastTopic} ${prompt} hình ảnh`;
      relevantFAQs = await findSimilarEmbeddings(contextualQuery, 3);
      const currentRelevantFAQs = await findSimilarEmbeddings(prompt, 2);
      const combinedFAQs = [...relevantFAQs, ...currentRelevantFAQs];
      const uniqueFAQs = combinedFAQs.filter(
        (faq, index, self) =>
          index === self.findIndex((f) => f.question === faq.question)
      );
      relevantFAQs = uniqueFAQs.slice(0, 3);
      searchQuery = contextualQuery;
    } else {
      relevantFAQs = await findSimilarEmbeddings(prompt, 3);
    }

    console.log("Image - Relevant FAQs found:", relevantFAQs.length);
    console.log("Image - Follow-up context:", followUpContext);

    let contextPrompt = `Dưới đây là lịch sử trò chuyện gần đây nếu có: 
    ${conversationContext}`;

    if (followUpContext && followUpContext.isFollowUp) {
      contextPrompt += `
[QUAN TRỌNG] Đây là hình ảnh tiếp theo số ${followUpContext.followUpCount} liên quan đến chủ đề "${followUpContext.lastTopic}".
${followUpContext.contextualPrompt}

Hướng dẫn phân tích hình ảnh:
- Kết nối với câu trả lời trước đó về "${followUpContext.lastTopic}"
- Phân tích hình ảnh trong ngữ cảnh của cuộc trò chuyện trước
- Cung cấp thông tin bổ sung hoặc chi tiết hơn dựa trên hình ảnh
- Nếu hình ảnh không rõ ràng, hãy tham khảo ngữ cảnh trước đó để hiểu ý định
- Tránh lặp lại thông tin đã cung cấp trước đó
`;
    } else {
      contextPrompt += `
Hướng dẫn phân tích hình ảnh:
- Phân tích chi tiết nội dung trong hình ảnh
- Trả lời dựa trên những gì bạn thấy trong hình ảnh
- Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời
- Liên hệ bộ phận hỗ trợ nếu cần thiết
- Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
`;
    }

    contextPrompt += `
Câu hỏi/Mô tả: ${prompt}
Hãy trả lời câu hỏi này một cách ngắn gọn và súc tích nhất có thể. Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời dựa trên hình ảnh.`;

    console.log("Image Context Prompt:", contextPrompt);

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];
      const similarityThreshold = followUpContext?.isFollowUp ? 0.94 : 0.97;

      if (mostRelevantFAQ.score > similarityThreshold) {
        console.log(
          "Using direct FAQ match for image with score:",
          mostRelevantFAQ.score
        );

        let response = mostRelevantFAQ.answer;
        if (followUpContext?.isFollowUp) {
          response = `🖼️ [Tiếp theo hình ảnh trước] ${response}`;
        }

        await insertFAQ(
          prompt,
          response,
          msg.message_id,
          msg.chat.id,
          msg.from.id,
          fileId
        );
        await insertSupportMessageToSheet(
          prompt,
          response,
          msg.message_id,
          msg.chat.id,
          msg.from.id,
          new Date().toISOString(),
          fileId
        );

        conversationHistory.addMessage(userId, chatId, prompt, response);

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

    console.log("Generating AI response for image...");
    const geminiResponse = await askGeminiWithImage(fileLink, contextPrompt);

    await saveTextEmbedding(userId, chatId, prompt, geminiResponse);

    let finalResponse = geminiResponse;
    if (followUpContext?.isFollowUp) {
      finalResponse = `🖼️💬 ${geminiResponse}`;
    }

    conversationHistory.addMessage(userId, chatId, prompt, geminiResponse);

    await insertFAQ(
      prompt,
      geminiResponse,
      msg.message_id,
      msg.chat.id,
      msg.from.id,
      fileId
    );
    await insertSupportMessageToSheet(
      prompt,
      geminiResponse,
      msg.message_id,
      msg.chat.id,
      msg.from.id,
      new Date().toISOString(),
      fileId
    );

    bot.sendMessage(chatId, finalResponse, {
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
