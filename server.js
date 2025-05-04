require('dotenv').config(); // Load environment variables from .env file
const express = require("express");
const cors = require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const OpenAI = require("openai"); // Use require for consistency

const app = express();
const port = process.env.PORT || 3000;
const requestCounts = {};
const DAILY_LIMIT = 3;

app.set('trust proxy', 1); // Uncomment if needed

const openai = new OpenAI({
        baseURL: 'https://api.deepseek.com',
        apiKey: process.env.DEEPSEEK_API_KEY // Use the environment variable
});
// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    // Get current date and hour as a unique string key (e.g., "2023-10-27T15")
    const currentHourISO = new Date().toISOString();
    const currentHourKey = currentHourISO.substring(0, 13); // YYYY-MM-DDTHH
    if (!requestCounts[ip] || requestCounts[ip].hourKey !== currentHourKey) {
        // First request this hour or first request ever for this IP
        requestCounts[ip] = { count: 1, hourKey: currentHourKey };
        console.log(`IP ${ip}: Request 1/${DAILY_LIMIT} for hour ${currentHourKey}`);
        next(); // Proceed
    } else if (requestCounts[ip].count < DAILY_LIMIT) {
        // Subsequent request within the limit for this hour
        requestCounts[ip].count++;
        console.log(`IP ${ip}: Request ${requestCounts[ip].count}/${DAILY_LIMIT} for hour ${currentHourKey}`);
        next(); // Proceed
    } else {
        // Limit exceeded for this hour
        console.log(`IP ${ip}: Rate limit exceeded for hour ${currentHourKey}`);
        res.status(429).json({ error: "Too Many Requests", message: `你的使用次數到達上限，限額為每小時${DAILY_LIMIT}次。` });
        // Do not call next()
    }
};

// Handle incoming messages - Apply rate limiter middleware HERE
app.post("/message", rateLimiter, async (req, res) => { // Add rateLimiter before async handler
    const { text } = req.body;
    console.log("Received message:", text);

    // Get today's date in YYYY-MM-DD format
    const today = new Date().toISOString().split('T')[0];

    // Define the system prompt dynamically inside the handler
    const systemPrompt = `今天是${today}。你是一個精通八字算命的大師，請根據用戶提供的生辰八字進行分析，並以繁體中文回答。不要回答非八字算命相關的問題。`;

    try {
        // Call the DeepSeek API
        const completion = await openai.chat.completions.create({
            model: "deepseek-chat", // Use the appropriate model name for DeepSeek
            messages: [
                { role: "system", content: systemPrompt }, // Use the dynamic system prompt
                { role: "user", content: text }           // User's input follows
            ],
        });

        const aiResponse = completion.choices[0]?.message?.content || "No response content.";
        console.log("AI Response:", aiResponse);
        res.json({
            receivedText: text, 
            aiResponse: aiResponse
        });

    } catch (error) {
        console.error("Error calling DeepSeek API:", error);
        if (!res.headersSent) {
            res.status(500).json({ error: "Failed to get AI response", details: error.message });
        }
    }
});

// Start server
app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
