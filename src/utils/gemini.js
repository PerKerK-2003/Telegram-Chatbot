const axios = require("axios");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

async function askGemini(context, question) {
  const data = {
    contents: [
      {
        parts: [
          {
            text: `Hãy sử dụng các thông tin hỗ trợ sau đây để trả lời câu hỏi.\n${context}\nCâu hỏi: ${question}\nVui lòng trả lời bằng tiếng Việt, ngắn gọn và rõ ràng.`,
          },
        ],
      },
    ],
  };

  const res = await axios.post(url, data, {
    headers: { "Content-Type": "application/json" },
  });

  return res.data.candidates[0].content.parts[0].text;
}

async function askGeminiWithImage(imageUrl, prompt) {
  try {
    await new Promise((resolve) => setTimeout(resolve, 5000)); // 1.5s delay
    const response = await fetch(imageUrl);
    const imageArrayBuffer = await response.arrayBuffer();
    const base64Image = Buffer.from(imageArrayBuffer).toString("base64");

    const data = {
      contents: [
        {
          parts: [
            {
              inlineData: {
                mimeType: "image/jpeg",
                data: base64Image,
              },
            },
            {
              text: prompt,
            },
          ],
        },
      ],
    };

    const result = await axios.post(url, data, {
      headers: { "Content-Type": "application/json" },
    });

    return result.data.candidates[0].content.parts[0].text;
  } catch (error) {
    console.error(
      "Lỗi khi gửi yêu cầu đến Gemini:",
      error.response?.status,
      error.response?.data || error.message
    );
    return "Xin lỗi, tôi không thể xử lý ảnh.";
  }
}

async function extractQAFromText(userInput) {
  const prompt = `
Phân tích văn bản sau và xác định xem người dùng có đang:
1. Dạy bot một cặp câu hỏi-trả lời
2. Đặt một câu hỏi mới
3. Chỉ trò chuyện bình thường

Các mẫu dạy bot (QUAN TRỌNG - chỉ những mẫu này mới được coi là dạy bot):
- "Khi có người hỏi [câu hỏi] thì trả lời [câu trả lời]"
- "Câu hỏi: [câu hỏi], Câu trả lời: [câu trả lời]"
- "Nếu ai đó hỏi [câu hỏi], hãy nói [câu trả lời]"
- "Hãy nhớ: [câu hỏi] - [câu trả lời]"
- "Q: [câu hỏi] A: [câu trả lời]"
- "Bot nhớ rằng [câu hỏi] thì trả lời [câu trả lời]"

Trả về CHÍNH XÁC một trong các format JSON sau:
- Nếu dạy bot: {"type": "teach", "question": "câu hỏi được dạy", "answer": "câu trả lời được dạy"}
- Nếu đặt câu hỏi: {"type": "ask", "question": "câu hỏi của người dùng"}
- Nếu trò chuyện: {"type": "chat"}

Văn bản cần phân tích:
"""${userInput}"""

CHỈ trả về JSON, KHÔNG có văn bản giải thích thêm.
`;

  const data = {
    contents: [
      {
        parts: [{ text: prompt }],
      },
    ],
  };

  try {
    const res = await axios.post(url, data, {
      headers: { "Content-Type": "application/json" },
    });

    const text = res.data.candidates?.[0]?.content?.parts?.[0]?.text?.trim();
    if (!text) return fallbackAnalysis(userInput);

    let jsonMatch;

    jsonMatch = text.match(/\{[^{}]*(?:\{[^{}]*\}[^{}]*)*\}/);

    if (!jsonMatch) {
      jsonMatch = text.match(/\{.*?"type".*?\}/s);
    }

    if (!jsonMatch) {
      console.log("Không tìm thấy JSON trong response:", text);
      return fallbackAnalysis(userInput);
    }

    try {
      const parsed = JSON.parse(jsonMatch[0]);

      if (parsed.type === "teach" && parsed.question && parsed.answer) {
        return {
          type: "teach",
          question: parsed.question.trim(),
          answer: parsed.answer.trim(),
        };
      } else if (parsed.type === "ask" && parsed.question) {
        return {
          type: "ask",
          question: parsed.question.trim(),
        };
      } else if (parsed.type === "chat") {
        return { type: "chat" };
      }

      return fallbackAnalysis(userInput);
    } catch (parseError) {
      console.log("JSON parse error:", parseError.message);
      return fallbackAnalysis(userInput);
    }
  } catch (error) {
    console.error("API Error:", error.response?.data || error.message);
    return fallbackAnalysis(userInput);
  }
}

function fallbackAnalysis(userInput) {
  const text = userInput.toLowerCase().trim();

  const teachingPatterns = [
    /(?:khi|nếu).*(?:người|ai).*hỏi.*(?:thì|hãy).*(?:trả lời|nói|đáp)/i,
    /câu hỏi:\s*(.+?)(?:,|\n|\.)\s*câu trả lời:\s*(.+)/i,
    /q:\s*(.+?)\s*a:\s*(.+)/i,
    /hãy nhớ.*?:\s*(.+?)\s*-\s*(.+)/i,
    /bot.*nhớ.*(?:rằng|là).*?(.+?)\s*(?:thì|->|=)\s*(.+)/i,
    /hỏi:\s*(.+?)(?:,|\n)\s*đáp:\s*(.+)/i,
  ];

  for (const pattern of teachingPatterns) {
    const match = userInput.match(pattern);
    if (match && match[1] && match[2]) {
      return {
        type: "teach",
        question: match[1].trim(),
        answer: match[2].trim(),
      };
    }
  }

  const questionWords = [
    "gì",
    "sao",
    "như thế nào",
    "tại sao",
    "khi nào",
    "ở đâu",
    "ai",
    "làm",
    "có",
  ];
  const hasQuestionWord = questionWords.some((word) => text.includes(word));
  const endsWithQuestionMark = text.endsWith("?");

  if (endsWithQuestionMark || hasQuestionWord) {
    return {
      type: "ask",
      question: userInput.trim(),
    };
  }

  return { type: "chat" };
}

async function extractQAFromTextWithRetry(userInput, maxRetries = 2) {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      const result = await extractQAFromText(userInput);
      if (result) return result;
    } catch (error) {
      console.log(`Attempt ${attempt + 1} failed:`, error.message);
      if (attempt === maxRetries) {
        return fallbackAnalysis(userInput);
      }
      await new Promise((resolve) => setTimeout(resolve, 1000));
    }
  }
  return fallbackAnalysis(userInput);
}

async function generateEmbedding(text) {
  const response = await axios.post(
    `https://generativelanguage.googleapis.com/v1beta/models/embedding-001:embedContent?key=${process.env.GEMINI_API_KEY}`,
    {
      content: { parts: [{ text }] },
    },
    {
      headers: { "Content-Type": "application/json" },
    }
  );

  return response.data.embedding.values;
}

module.exports = {
  askGemini,
  askGeminiWithImage,
  extractQAFromText,
  extractQAFromTextWithRetry,
  generateEmbedding,
};
