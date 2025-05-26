const {
  askGemini,
  askGeminiWithImage,
  extractQAFromText,
} = require("../utils/gemini");
const { getFAQs, addOrUpdateFAQ } = require("../services/faqs_service");
const { logUniqueQuestion } = require("../services/logQuestion_service");
const stopwords = require("stopwords-vi");

const conversationHistory = new Map();

const MAX_HISTORY_LENGTH = 10;

const greetings = ["hello", "xin chào"];

function extractBoldAnswer(response) {
  const match = response.match(/\*\*(.*?)\*\*/);
  return match ? match[1].trim() : response.trim();
}

function normalize(str) {
  return str
    .toLowerCase()
    .split(/\s+/)
    .filter((word) => word.length > 2 && !stopwords.includes(word))
    .join(" ");
}

function calculateSimilarity(str1, str2) {
  const set1 = new Set(normalize(str1).split(/\s+/));
  const set2 = new Set(normalize(str2).split(/\s+/));

  const intersection = new Set([...set1].filter((x) => set2.has(x)));

  const similarity =
    intersection.size / (set1.size + set2.size - intersection.size);
  return similarity;
}

function findRelevantFAQs(faqs, question) {
  const scoredFAQs = faqs.map((faq) => {
    const similarityScore = calculateSimilarity(question, faq.message);
    return { ...faq, similarityScore };
  });

  return scoredFAQs
    .sort((a, b) => b.similarityScore - a.similarityScore)
    .filter((faq) => faq.similarityScore > 0.1)
    .slice(0, 5);
}

function formatContext(faqs) {
  let context = "Dưới đây là thông tin hỗ trợ liên quan nhất nếu có:\n\n";

  faqs.forEach((faq, index) => {
    context += `${index + 1}. Câu hỏi: ${faq.message}\n   Trả lời: ${
      faq.answer
    }\n\n`;
  });

  context +=
    "Hãy trả lời câu hỏi của người dùng dựa trên thông tin trên. Hãy trả lời bằng tiếng Việt và giữ giọng điệu thân thiện, chuyên nghiệp. Nếu không có thông tin hỗ trợ nào, hãy sử dụng kiến thức chung của bạn để trả lời.";

  return context;
}

function getConversationHistory(chatId) {
  if (!conversationHistory.has(chatId)) {
    conversationHistory.set(chatId, []);
  }
  return conversationHistory.get(chatId);
}

function addToConversationHistory(chatId, userMessage, botResponse) {
  const history = getConversationHistory(chatId);

  history.push({
    user: userMessage,
    bot: botResponse,
    timestamp: new Date().toISOString(),
  });

  if (history.length > MAX_HISTORY_LENGTH) {
    history.shift();
  }

  conversationHistory.set(chatId, history);
}

function formatConversationHistory(history) {
  if (!history || history.length === 0) return "";
  return history
    .map((turn, i) => `Người dùng: ${turn.user}\nBot: ${turn.bot}`)
    .join("\n");
}

async function handleImageMessage(bot, msg, chatId) {
  const photoArray = msg.photo;
  const highestQualityPhoto = photoArray[photoArray.length - 1];
  const fileId = highestQualityPhoto.file_id;

  try {
    const fileLink = await bot.getFileLink(fileId);
    bot.sendMessage(
      chatId,
      "Cảm ơn! Tôi đã nhận được ảnh của bạn và đang xử lý..."
    );

    const faqs = await getFAQs();
    const prompt =
      msg.caption ||
      "Hãy mô tả nội dung trong hình ảnh này và cung cấp thông tin hỗ trợ nếu liên quan.";

    const history = getConversationHistory(chatId);
    const conversationContext = formatConversationHistory(history);

    const contextPrompt = formatContext(faqs) + conversationContext + prompt;

    const qa = await extractQAFromText(contextPrompt);
    console.log("QA:", qa);

    if (qa) {
      await addOrUpdateFAQ(qa.question, qa.answer);
      return bot.sendMessage(
        chatId,
        `✅ Đã ghi nhớ:\n🧠 Câu hỏi: ${qa.question}\n💡 Trả lời: ${qa.answer}`
      );
    }

    const geminiResponse = await askGeminiWithImage(fileLink, contextPrompt);
    const conciseAnswer = extractBoldAnswer(geminiResponse);

    addToConversationHistory(chatId, contextPrompt, conciseAnswer);

    await addOrUpdateFAQ(contextPrompt, conciseAnswer);
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

async function handleMessage(bot, msg) {
  const chatId = msg.chat.id;

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
    addToConversationHistory(
      chatId,
      question,
      "Chào bạn! Tôi là trợ lý AI, bạn cần tôi giúp gì hôm nay?"
    );
    return;
  }

  try {
    const history = getConversationHistory(chatId);
    const conversationContext = formatConversationHistory(history);

    const faqs = await getFAQs();

    const relevantFAQs = findRelevantFAQs(faqs, question);
    console.log("Relevant FAQs:", relevantFAQs);

    let faqContext = formatContext(relevantFAQs);

    const qa = await extractQAFromText(question);
    console.log("QA:", qa);

    if (qa) {
      await addOrUpdateFAQ(qa.question, qa.answer);
      return bot.sendMessage(
        chatId,
        `✅ Đã ghi nhớ:\n🧠 Câu hỏi: ${qa.question}\n💡 Trả lời: ${qa.answer}`
      );
    }

    const enhancedPrompt = `
      Bạn là một trợ lý AI. Dưới đây là lịch sử trò chuyện gần đây nếu có:
      ${conversationContext}
      ${faqContext}

      Câu hỏi: "${question.trim()}"
      Hãy trả lời bằng tiếng Việt và cố gắng cung cấp câu trả lời ngắn gọn, súc tích.
      `;
    console.log("Enhanced Prompt:", enhancedPrompt);
    const response = await askGemini(enhancedPrompt, question);
    const conciseAnswer = extractBoldAnswer(response);

    if (relevantFAQs.length > 0) {
      const mostRelevantFAQ = relevantFAQs[0];
      const similarityScore = calculateSimilarity(
        question,
        mostRelevantFAQ.message
      );

      if (similarityScore > 0.7) {
        console.log(
          "Question: ",
          mostRelevantFAQ.message + " | Answer: ",
          mostRelevantFAQ.answer
        );
        addToConversationHistory(chatId, question, mostRelevantFAQ.answer);
        addOrUpdateFAQ(mostRelevantFAQ.message, mostRelevantFAQ.answer);
      } else {
        addToConversationHistory(chatId, question, conciseAnswer);
        await addOrUpdateFAQ(question, conciseAnswer);
      }
    }

    bot.sendMessage(chatId, response, {
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
    console.error("Có lỗi xảy ra khi xử lý tin nhắn:", err);
    bot.sendMessage(
      chatId,
      "Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ."
    );
  }
}

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

  return false;
}

async function handleMessageOrCommand(bot, msg) {
  if (msg.text && msg.text.startsWith("/")) {
    const handled = handleCommand(bot, msg);
    if (handled) return;
  }

  await handleMessage(bot, msg);
}

module.exports = handleMessageOrCommand;
