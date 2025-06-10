const { insertFAQ } = require("../services/faqs_service");
const { askGemini, extractQAFromTextWithRetry } = require("../utils/gemini");
const ConversationHistory = require("../utils/conversation");
const handleImageMessage = require("./handleImage");
const {
  saveTextEmbedding,
  findSimilarEmbeddings,
} = require("../embedding/textEmbedding");

const { insertSupportMessageToSheet } = require("../sheet/googleSheet");

const greetings = ["hello", "xin chào"];
const conversationHistory = new ConversationHistory();

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;
  const userId = msg.from.id;

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
    conversationHistory.addMessage(
      userId,
      chatId,
      question,
      "Chào bạn! Tôi là trợ lý AI, bạn cần tôi giúp gì hôm nay?"
    );
    return;
  }

  try {
    console.log("Analyzing user intent for:", question);
    const userIntent = await extractQAFromTextWithRetry(question);
    console.log("User intent detected:", userIntent);

    if (userIntent.type === "teach") {
      console.log(
        "User is teaching bot:",
        userIntent.question,
        "->",
        userIntent.answer
      );

      await insertFAQ(
        userIntent.question,
        userIntent.answer,
        msg.message_id,
        msg.from.id,
        msg.chat.id
      );

      await saveTextEmbedding(
        msg.from.id,
        chatId,
        userIntent.question,
        userIntent.answer
      );

      await insertSupportMessageToSheet(
        userIntent.question,
        userIntent.answer,
        msg.message_id,
        msg.from.id,
        msg.chat.id,
        new Date().toISOString()
      );

      conversationHistory.addMessage(
        userId,
        chatId,
        question,
        userIntent.answer
      );

      return bot.sendMessage(
        chatId,
        `✅ Đã học được thông tin mới!\n\n🧠 **Câu hỏi:** ${userIntent.question}\n💡 **Trả lời:** ${userIntent.answer}\n\nTôi sẽ nhớ điều này để trả lời các câu hỏi tương tự sau.`
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
    let searchQuery = question;

    if (followUpContext && followUpContext.isFollowUp) {
      const contextualQuery = `${followUpContext.question} ${question}`;
      relevantFAQs = await findSimilarEmbeddings(contextualQuery, 3);

      const currentRelevantFAQs = await findSimilarEmbeddings(question, 2);
      const combinedFAQs = [...relevantFAQs, ...currentRelevantFAQs];
      const uniqueFAQs = combinedFAQs.filter(
        (faq, index, self) =>
          index === self.findIndex((f) => f.question === faq.question)
      );
      relevantFAQs = uniqueFAQs.slice(0, 3);
      searchQuery = contextualQuery;
    } else {
      relevantFAQs = await findSimilarEmbeddings(question, 3);
    }

    console.log("Relevant FAQs found:", relevantFAQs.length);
    console.log("Follow-up context:", followUpContext);

    let enhancedPrompt = `Dưới đây là lịch sử trò chuyện gần đây nếu có: 
    ${conversationContext}`;

    if (followUpContext && followUpContext.isFollowUp) {
      enhancedPrompt += `
[QUAN TRỌNG] Đây là câu hỏi tiếp theo số ${followUpContext.followUpCount} về chủ đề "${followUpContext.lastTopic}".
${followUpContext.contextualPrompt}`;
    } else {
      enhancedPrompt += `
Hướng dẫn trả lời:
- Nếu câu hỏi không rõ ràng, hãy yêu cầu người dùng cung cấp thêm thông tin
- Cố gắng cung cấp câu trả lời chi tiết và đề xuất các hướng giải quyết
- Sử dụng lịch sử trò chuyện để hiểu ngữ cảnh tốt hơn
- Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời
- Liên hệ bộ phận hỗ trợ nếu cần thiết
`;
    }

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];
      const similarityThreshold = followUpContext?.isFollowUp ? 0.95 : 0.98;

      if (mostRelevantFAQ.score > similarityThreshold) {
        console.log(
          "Using direct FAQ match with score:",
          mostRelevantFAQ.score
        );

        await insertFAQ(
          question,
          mostRelevantFAQ.answer,
          msg.message_id,
          msg.chat.id,
          msg.from.id
        );
        await insertSupportMessageToSheet(
          question,
          mostRelevantFAQ.answer,
          msg.message_id,
          msg.chat.id,
          msg.from.id,
          new Date().toISOString()
        );

        let response = mostRelevantFAQ.answer;
        if (followUpContext?.isFollowUp) {
          response = `[Tiếp theo câu hỏi trước] ${response}`;
        }

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

        conversationHistory.addMessage(userId, chatId, question, response);
        return;
      }
    }

    console.log("Generating AI response...");
    const response = await askGemini(enhancedPrompt, question);

    await saveTextEmbedding(msg.from.id, chatId, question, response);
    await insertFAQ(
      question,
      response,
      msg.message_id,
      msg.chat.id,
      msg.from.id
    );
    await insertSupportMessageToSheet(
      question,
      response,
      msg.message_id,
      msg.chat.id,
      msg.from.id,
      new Date().toISOString()
    );

    let finalResponse = response;
    if (followUpContext?.isFollowUp) {
      finalResponse = `💬 ${response}`;
    }

    bot.sendMessage(chatId, finalResponse, {
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

    conversationHistory.addMessage(userId, chatId, question, response);
  } catch (err) {
    console.error("Có lỗi xảy ra khi xử lý tin nhắn:", err);
    bot.sendMessage(
      chatId,
      "Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ."
    );
  }
}

module.exports = handleMessage;
