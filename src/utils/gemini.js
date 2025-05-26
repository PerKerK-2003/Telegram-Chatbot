const axios = require("axios");
const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${GEMINI_API_KEY}`;

async function askGemini(context, question) {
  const data = {
    contents: [
      {
        parts: [
          {
            text: `Hãy sử dụng các thông tin hỗ trợ sau đây để trả lời câu hỏi.\n${context}\n\nCâu hỏi: ${question}\n\nVui lòng trả lời bằng tiếng Việt:`,
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
Xác định xem người dùng có đang dạy bot một câu hỏi và câu trả lời không. Nếu có, trích xuất chúng dưới dạng JSON như sau:
{"question": "Câu hỏi trước đó", "answer": "Câu trả lời ở đây"}
Nếu không phải, trả về null.

Dữ liệu đầu vào:
"""${userInput}"""
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
    if (!text) return null;

    const match = text.match(/\{.*\}/s); // extract JSON part
    if (!match) return null;

    const parsed = JSON.parse(match[0]);
    if (parsed.question && parsed.answer) {
      return parsed;
    }

    return null;
  } catch (error) {
    console.error(
      "Lỗi khi phân tích Q&A:",
      error.response?.data || error.message
    );
    return null;
  }
}

module.exports = { askGemini, askGeminiWithImage, extractQAFromText };
