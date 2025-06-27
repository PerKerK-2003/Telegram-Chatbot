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
  generateEmbedding,
};
