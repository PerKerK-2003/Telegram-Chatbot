const {
  saveTextEmbedding,
  findSimilarEmbeddings,
} = require("../embedding/textEmbedding");

class ConversationHistory {
  constructor() {
    this.conversations = new Map();
    this.summaries = new Map();
    this.contextTracking = new Map(); // New: Track conversation context
    this.maxHistoryLength = 10;
    this.maxMessageAge = 24 * 60 * 60 * 1000;
    this.summarizationThreshold = 10;
    this.followUpKeywords = [
      "còn",
      "thêm",
      "nữa",
      "tiếp",
      "khác",
      "như thế nào",
      "sao",
      "tại sao",
      "làm sao",
      "có thể",
      "được không",
      "có phải",
      "và",
      "nhưng",
      "tuy nhiên",
      "vậy thì",
      "còn lại",
      "chi tiết",
      "cụ thể",
      "ví dụ",
      "giải thích",
    ];
  }

  generateConversationKey(userId, chatId) {
    return `${userId}_${chatId}`;
  }

  addMessage(userId, chatId, userMessage, botResponse) {
    const key = this.generateConversationKey(userId, chatId);

    if (!this.conversations.has(key)) {
      this.conversations.set(key, []);
      this.contextTracking.set(key, {
        lastTopic: "",
        lastQuestion: "",
        lastAnswer: "",
        followUpCount: 0,
        isInFollowUpSequence: false,
      });
    }

    const conversation = this.conversations.get(key);
    const context = this.contextTracking.get(key);

    // Check if this is a follow-up question
    const isFollowUp = this.detectFollowUpQuestion(userMessage, context);

    if (isFollowUp) {
      context.followUpCount++;
      context.isInFollowUpSequence = true;
    } else {
      context.followUpCount = 0;
      context.isInFollowUpSequence = false;
    }

    // Update context tracking
    context.lastQuestion = userMessage.trim();
    context.lastAnswer = botResponse.trim();
    context.lastTopic = this.extractTopic(userMessage);

    conversation.push({
      timestamp: Date.now(),
      user: userMessage.trim(),
      bot: botResponse.trim(),
      isFollowUp: isFollowUp,
      followUpCount: context.followUpCount,
      topic: context.lastTopic,
    });

    this.cleanupConversation(key);
  }

  detectFollowUpQuestion(userMessage, context) {
    const message = userMessage.toLowerCase().trim();

    // Check if message is too short to be meaningful
    if (message.length < 3) return false;

    // Check if this is the first message in conversation
    if (!context.lastQuestion || !context.lastAnswer) return false;

    // Pattern 1: Contains follow-up keywords
    const hasFollowUpKeywords = this.followUpKeywords.some((keyword) =>
      message.includes(keyword.toLowerCase())
    );

    // Pattern 2: Very short questions (likely follow-ups)
    const isShortQuestion =
      message.length < 20 &&
      (message.includes("?") ||
        message.includes("sao") ||
        message.includes("như thế nào") ||
        message.includes("có phải") ||
        message.includes("được không"));

    // Pattern 3: Starts with conjunctions or continuation words
    const startsWithContinuation = [
      "và",
      "nhưng",
      "tuy nhiên",
      "còn",
      "vậy",
      "thế còn",
      "còn lại",
    ].some((word) => message.startsWith(word));

    // Pattern 4: References previous context without full context
    const hasPronouns = ["nó", "đó", "này", "vậy", "thế"].some((pronoun) =>
      message.includes(pronoun)
    );

    // Pattern 5: Time-based follow-up detection (within 2 minutes)
    const timeSinceLastMessage = Date.now() - (context.lastMessageTime || 0);
    const isRecentMessage = timeSinceLastMessage < 2 * 60 * 1000;

    context.lastMessageTime = Date.now();

    return (
      (hasFollowUpKeywords ||
        isShortQuestion ||
        startsWithContinuation ||
        (hasPronouns && isRecentMessage)) &&
      isRecentMessage
    );
  }

  extractTopic(message) {
    // Simple topic extraction - you can enhance this with NLP
    const words = message.toLowerCase().split(" ");
    const stopWords = [
      "tôi",
      "bạn",
      "là",
      "có",
      "được",
      "và",
      "của",
      "cho",
      "với",
    ];
    const meaningfulWords = words.filter(
      (word) => word.length > 2 && !stopWords.includes(word)
    );

    return meaningfulWords.slice(0, 3).join(" ");
  }

  getContextualHistory(userId, chatId, includeFollowUpContext = true) {
    const key = this.generateConversationKey(userId, chatId);
    const history = this.getHistory(userId, chatId);
    const context = this.contextTracking.get(key) || {};

    if (!includeFollowUpContext) {
      return history;
    }

    // If we're in a follow-up sequence, prioritize recent related messages
    if (context.isInFollowUpSequence) {
      const relevantHistory = history.slice(-5); // Get last 5 messages for context
      return {
        messages: relevantHistory,
        isFollowUpSequence: true,
        followUpCount: context.followUpCount,
        currentTopic: context.lastTopic,
        lastQuestion: context.lastQuestion,
        lastAnswer: context.lastAnswer,
      };
    }

    return {
      messages: history,
      isFollowUpSequence: false,
      followUpCount: 0,
    };
  }

  formatForGemini(userId, chatId) {
    const contextualHistory = this.getContextualHistory(userId, chatId, true);
    const key = this.generateConversationKey(userId, chatId);

    if (
      (!contextualHistory.messages ||
        contextualHistory.messages.length === 0) &&
      !this.summaries.has(key)
    ) {
      return "";
    }

    let formattedContent = "";

    // Add summary if exists
    if (this.summaries.has(key)) {
      formattedContent += `Tóm tắt cuộc trò chuyện trước:\n${this.summaries.get(
        key
      )}\n\n`;
    }

    // Handle follow-up context
    if (contextualHistory.isFollowUpSequence) {
      formattedContent += `[QUAN TRỌNG: Đây là câu hỏi tiếp theo số ${contextualHistory.followUpCount} về chủ đề "${contextualHistory.currentTopic}"]\n`;
      formattedContent += `Câu hỏi gần nhất: "${contextualHistory.lastQuestion}"\n`;
      formattedContent += `Câu trả lời vừa đưa: "${contextualHistory.lastAnswer}"\n\n`;
    }

    // Add recent conversation history
    if (contextualHistory.messages && contextualHistory.messages.length > 0) {
      const formattedHistory = contextualHistory.messages
        .map((msg, index) => {
          const followUpIndicator = msg.isFollowUp ? "[TIẾP THEO] " : "";
          return `${followUpIndicator}Người dùng: ${msg.user}\nBot: ${msg.bot}`;
        })
        .join("\n\n");

      formattedContent += `Lịch sử gần đây:\n${formattedHistory}\n\n`;
    }

    return formattedContent;
  }

  getFollowUpContext(userId, chatId) {
    const key = this.generateConversationKey(userId, chatId);
    const context = this.contextTracking.get(key);

    if (!context || !context.isInFollowUpSequence) {
      return null;
    }

    return {
      isFollowUp: true,
      followUpCount: context.followUpCount,
      lastTopic: context.lastTopic,
      lastQuestion: context.lastQuestion,
      lastAnswer: context.lastAnswer,
      contextualPrompt: this.generateFollowUpPrompt(context),
    };
  }

  generateFollowUpPrompt(context) {
    return `Người dùng đang hỏi tiếp về chủ đề "${context.lastTopic}". 
Câu hỏi trước: "${context.lastQuestion}"
Câu trả lời đã cho: "${context.lastAnswer}"
Đây là lần thứ ${context.followUpCount} họ hỏi tiếp về vấn đề này.
Hãy trả lời dựa trên ngữ cảnh này và cung cấp thông tin bổ sung, chi tiết hơn hoặc làm rõ những điểm chưa rõ.`;
  }

  getHistory(userId, chatId) {
    const key = this.generateConversationKey(userId, chatId);

    if (!this.conversations.has(key)) {
      return [];
    }

    const conversation = this.conversations.get(key);
    this.cleanupConversation(key);
    return conversation;
  }

  async cleanupConversation(key) {
    const conversation = this.conversations.get(key);
    if (!conversation) return;

    const now = Date.now();

    const recentMessages = conversation.filter(
      (msg) => now - msg.timestamp < this.maxMessageAge
    );

    if (recentMessages.length > this.summarizationThreshold) {
      await this.summarizeAndTruncate(key, recentMessages);
    } else {
      const trimmedMessages = recentMessages.slice(-this.maxHistoryLength);
      this.conversations.set(key, trimmedMessages);
    }
  }

  async summarizeAndTruncate(key, messages) {
    try {
      const summaryCount = Math.floor(messages.length * 0.67);
      const messagesToSummarize = messages.slice(0, summaryCount);
      const recentMessages = messages.slice(summaryCount);

      const conversationText = messagesToSummarize
        .map((msg) => {
          const followUpIndicator = msg.isFollowUp
            ? "[Câu hỏi tiếp theo] "
            : "";
          return `${followUpIndicator}Người dùng: ${msg.user}\nBot: ${msg.bot}`;
        })
        .join("\n\n");

      const summary = await this.generateSummary(conversationText);
      this.summaries.set(key, summary);
      this.conversations.set(key, recentMessages.slice(-this.maxHistoryLength));
    } catch (error) {
      console.error("Error during summarization:", error);
      this.conversations.set(key, messages.slice(-this.maxHistoryLength));
    }
  }

  async generateSummary(conversationText) {
    const lines = conversationText.split("\n").filter((line) => line.trim());
    const topics = [];
    const followUpCount = (
      conversationText.match(/\[Câu hỏi tiếp theo\]/g) || []
    ).length;

    lines.forEach((line) => {
      if (
        line.startsWith("Người dùng:") ||
        line.includes("[Câu hỏi tiếp theo] Người dùng:")
      ) {
        const question = line.replace(/.*Người dùng:/, "").trim();
        if (question.length > 10) {
          topics.push(
            question.substring(0, 50) + (question.length > 50 ? "..." : "")
          );
        }
      }
    });

    let summary = `Cuộc trò chuyện đã thảo luận về: ${topics
      .slice(0, 3)
      .join(", ")}. `;
    summary += `Tổng cộng ${Math.floor(lines.length / 2)} trao đổi`;

    if (followUpCount > 0) {
      summary += `, trong đó có ${followUpCount} câu hỏi tiếp theo`;
    }

    summary += ".";

    return summary;
  }

  clearHistory(userId, chatId) {
    const key = this.generateConversationKey(userId, chatId);
    this.conversations.delete(key);
    this.summaries.delete(key);
    this.contextTracking.delete(key);
  }

  getStats() {
    const totalConversations = this.conversations.size;
    let totalMessages = 0;
    let totalFollowUps = 0;

    this.conversations.forEach((conversation) => {
      totalMessages += conversation.length;
      totalFollowUps += conversation.filter((msg) => msg.isFollowUp).length;
    });

    return {
      totalConversations,
      totalMessages,
      totalFollowUps,
      followUpPercentage:
        totalMessages > 0
          ? Math.round((totalFollowUps / totalMessages) * 100)
          : 0,
      averageMessagesPerConversation:
        totalConversations > 0
          ? Math.round(totalMessages / totalConversations)
          : 0,
    };
  }
}

module.exports = ConversationHistory;
