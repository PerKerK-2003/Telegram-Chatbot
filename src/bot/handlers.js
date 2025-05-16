const { askGemini, askGeminiWithImage } = require("../utils/gemini");
const { getFAQs } = require("../services/faqs_service");
const { logUniqueQuestion } = require("../services/logQuestion_service");

function calculateSimilarity(str1, str2) {
  const set1 = new Set(
    str1
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );
  const set2 = new Set(
    str2
      .toLowerCase()
      .split(/\s+/)
      .filter((word) => word.length > 2)
  );

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
  let context = "Dưới đây là thông tin hỗ trợ liên quan nhất:\n\n";

  faqs.forEach((faq, index) => {
    context += `${index + 1}. Câu hỏi: ${faq.message}\n   Trả lời: ${
      faq.answer
    }\n\n`;
  });

  context +=
    "Hãy trả lời câu hỏi của người dùng dựa trên thông tin trên. Nếu không có thông tin liên quan, hãy cho biết bạn không có đủ thông tin và yêu cầu thêm chi tiết. Hãy trả lời bằng tiếng Việt và giữ giọng điệu thân thiện, chuyên nghiệp.";

  return context;
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

    const contextPrompt = `${prompt}\n\nDựa trên thông tin hỗ trợ sau:\n${faqs
      .map((faq) => `- ${faq.message}: ${faq.answer}`)
      .join("\n")}`;

    const geminiResponse = await askGeminiWithImage(fileLink, contextPrompt);
    await logUniqueQuestion(1, prompt, fileLink, geminiResponse);
    bot.sendMessage(chatId, geminiResponse);
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

  // Send typing indicator
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

  try {
    // Retrieve and process FAQs
    const faqs = await getFAQs();
    const relevantFAQs = findRelevantFAQs(faqs, question);
    const context = formatContext(relevantFAQs);

    // If we have no relevant FAQs, include a few general ones
    const finalContext =
      relevantFAQs.length === 0 ? formatContext(faqs.slice(0, 3)) : context;

    // Generate response with improved prompt
    const enhancedPrompt = `Câu hỏi người dùng: "${question}"\n\n${finalContext}`;
    const response = await askGemini(enhancedPrompt, question);

    await logUniqueQuestion(1, question, null, response);
    bot.sendMessage(chatId, response);
  } catch (err) {
    console.error("Có lỗi xảy ra khi xử lý tin nhắn:", err);
    bot.sendMessage(
      chatId,
      "Có lỗi xảy ra khi xử lý yêu cầu của bạn. Vui lòng thử lại sau hoặc liên hệ bộ phận hỗ trợ."
    );
  }
}

module.exports = handleMessage;
