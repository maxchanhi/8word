require('dotenv').config();
const express = require("express");
const cors =require("cors");
const bodyParser = require("body-parser");
const path = require("path");
const OpenAI = require("openai");

const app = express();
const port = process.env.PORT || 3000;
const requestCounts = {};
const HOURLY_LIMIT = 5; // Adjusted limit name for clarity, you can set your desired limit

app.set('trust proxy', 1);

// Configure OpenAI client for SiliconFlow
const openai = new OpenAI({
        baseURL: 'https://api.siliconflow.cn/v1', // SiliconFlow Base URL
        apiKey: process.env.SK_API_KEY // Use SK_API_KEY from .env
});

app.use(cors());
app.use(bodyParser.json());
app.use(express.static(__dirname));

app.get("/", (req, res) => {
    res.sendFile(path.join(__dirname, "main.html"));
});

const rateLimiter = (req, res, next) => {
    const ip = req.ip || req.socket.remoteAddress;
    const currentHourISO = new Date().toISOString();
    const currentHourKey = currentHourISO.substring(0, 13); // YYYY-MM-DDTHH

    if (!requestCounts[ip] || requestCounts[ip].hourKey !== currentHourKey) {
        requestCounts[ip] = { count: 1, hourKey: currentHourKey };
        console.log(`IP ${ip}: Request 1/${HOURLY_LIMIT} for hour ${currentHourKey}`);
        next();
    } else if (requestCounts[ip].count < HOURLY_LIMIT) {
        requestCounts[ip].count++;
        console.log(`IP ${ip}: Request ${requestCounts[ip].count}/${HOURLY_LIMIT} for hour ${currentHourKey}`);
        next();
    } else {
        console.log(`IP ${ip}: Rate limit exceeded for hour ${currentHourKey}`);
        res.status(429).json({ error: "Too Many Requests", message: `You have exceeded the hourly limit of ${HOURLY_LIMIT} requests.` });
    }
};

// Changed endpoint to /horoscope
app.post("/horoscope", rateLimiter, async (req, res) => {
    const { text: zodiacSign } = req.body; // Renamed for clarity
    console.log("Received Zodiac Sign:", zodiacSign);

    // Updated system prompt for Daily Horoscope in English - Removed extra backticks
    const systemPrompt = `You are an expert astrologer. Provide a concise daily horoscope prediction for the user based on their zodiac sign or the birthday. Respond in English. Do not answer non-horoscope related questions. 
                        Response Format:
                        **Summarize the overall mood:** Based on the provided [zodiac] daily horoscope text, summarize the overall mood or main theme for the day in one sentence.

                        **Extract Lucky Details:** From the [zodiac] daily horoscope text, extract the specific lucky color(s) and lucky number(s) mentioned.

                        **Compare Love Advice:** From the [zodiac] daily horoscope text, analyze and compare the advice given to single individuals versus those in relationships.

                        **Career/Work Guidance:** From the [zodiac] daily horoscope text, extract the key advice or predictions related to career or academics.

                        **Identify Health Recommendations:** From the [zodiac] daily horoscope text, list the specific health recommendations or considerations mentioned.

                        **Assess Overall Fortune:** From the [zodiac] daily horoscope text, provide the assessment of overall fortune for the day and explain the reasoning.`

    try {
        const completion = await openai.chat.completions.create({
            model: "THUDM/GLM-4-9B-0414", // Changed model as requested <mcreference link="https://docs.siliconflow.cn/cn/api-reference/chat-completions/chat-completions" index="0">0</mcreference>
            messages: [
                { role: "system", content: systemPrompt },
                { role: "user", content: zodiacSign } // Structured user prompt
            ],
            // Optional: Add parameters like max_tokens, temperature if needed
            max_tokens: 800,
            temperature: 1
        });

        const aiResponse = completion.choices[0]?.message?.content || "Sorry, I couldn't generate a horoscope right now.";
        console.log("AI Response:", aiResponse);
        res.json({
            receivedText: zodiacSign, // Send back the received sign
            aiResponse: aiResponse
        });

    } catch (error) {
        console.error("Error calling SiliconFlow API:", error);
        if (!res.headersSent) {
            // Provide a more generic error message to the user
            res.status(500).json({ error: "Failed to get AI response", details: "An internal error occurred." });
        }
    }
});

app.listen(port, () => {
    console.log(`Server running at http://localhost:${port}`);
});
