const {
  insertFAQ,
  expireOldSessions,
  getHistoryConversation,
  getLatestAnswer,
  getHelpfulResponses,
  continueSession,
} = require("../services/faqs_service");
const { askGemini } = require("../utils/gemini");
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
  await expireOldSessions(userId, chatId);
  console.log("Received message:", messageId);
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
      latestAnswer ? latestAnswer.text : "Không có phản hồi nào."
    }
    Hướng dẫn trả lời:
    - Nếu câu hỏi không rõ ràng, hãy yêu cầu người dùng cung cấp thêm thông tin
    - Cố gắng cung cấp câu trả lời chi tiết và đề xuất các hướng giải quyết cũng như nguyên nhân gây ra vấn đề
    - Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
    - Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời
    - Liên hệ bộ phận hỗ trợ nếu người dùng yêu cầu hoặc khi cần thiết
    `;
    //   Hướng dẫn trả lời:
    // - Cung cấp một số nguyên nhân phổ biến hoặc giải pháp cho câu hỏi
    // - Tham khảo lịch sử trò chuyện để có thể trả lời chính xác hơn
    // - Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời
    // - Nếu có câu hỏi tương tự đã được trả lời, hãy sử dụng câu trả lời đó
    // - Nếu cần thiết, hãy yêu cầu người dùng cung cấp thêm thông tin
    // `;
    console.log("Enhanced prompt:", enhancedPrompt);
    const response = await askGemini(enhancedPrompt, question);
    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];
      if (mostRelevantFAQ.score > 0.99) {
        console.log("Điểm tương đồng gần nhất:", mostRelevantFAQ.score);
        console.log("Relevant FAQ found:", mostRelevantFAQ.rootMessage, chatId);
        if (mostRelevantFAQ.supportStatus === false) {
          await continueSession(chatId, userId);
          const sentMessage = await bot.sendMessage(chatId, response, {
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
          await insertFAQ(
            question,
            response,
            messageId,
            sentMessage.message_id,
            chatId,
            userId
          );
          await insertSupportMessageToSheet(
            question,
            mostRelevantFAQ.answer,
            messageId,
            chatId,
            userId,
            new Date().toISOString(),
            "",
            mostRelevantFAQ.rootMessage
          );
          await saveTextEmbedding(
            messageId,
            userId,
            chatId,
            question,
            response,
            "",
            rootMessage
          );
          return;
        } else {
          const helpfulResponse = await getHelpfulResponses(
            mostRelevantFAQ.rootMessage,
            chatId
          );
          await insertSupportMessageToSheet(
            question,
            helpfulResponse ? helpfulResponse.text : mostRelevantFAQ.answer,
            messageId,
            chatId,
            userId,
            new Date().toISOString(),
            "",
            mostRelevantFAQ.rootMessage
          );

          console.log("Response from FAQ:", helpfulResponse);
          bot.sendMessage(
            chatId,
            helpfulResponse ? helpfulResponse.text : mostRelevantFAQ.answer,
            {
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
            }
          );
          return;
        }
      }
    }
    const sentMessage = await bot.sendMessage(chatId, response, {
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
    rootMessage = await insertFAQ(
      question,
      response,
      messageId,
      sentMessage.message_id,
      chatId,
      userId
    );
    await saveTextEmbedding(
      messageId,
      userId,
      chatId,
      question,
      response,
      "",
      rootMessage
    );
    await insertSupportMessageToSheet(
      question,
      response,
      messageId,
      chatId,
      userId,
      new Date().toISOString(),
      "",
      rootMessage
    );
  } catch (err) {
    console.error("Có lỗi xảy ra khi xử lý tin nhắn:", err);
    bot.sendMessage(
      chatId,
      "Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ."
    );
  }
}

module.exports = handleMessage;
