// netlify/functions/analyze.js
exports.handler = async function(event, context) {
    // 1. Only allow POST requests
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        // 2. Get User Input
        const { userText, webContext } = JSON.parse(event.body);

        // 3. Get API Key from Netlify Environment (Secure)
        const GROQ_KEY = process.env.GROQ_API_KEY;

        if (!GROQ_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: "Server API Key Missing" }) };
        }

        // 4. Call Groq AI from the Server
        const systemPrompt = `
        You are TruthLens. Compare USER CLAIM with LIVE NEWS.
        If news confirms it -> 100/Verified. If contradicts -> 0/Fake.
        Output JSON: { "score": 0-100, "reasons": ["Fact 1", "Fact 2"], "confidence": 0-100 }
        
        LIVE NEWS: ${webContext || "No live news found."}
        USER CLAIM: ${userText}
        `;

        const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${GROQ_KEY}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                model: "llama-3.3-70b-versatile",
                messages: [{ role: "system", content: systemPrompt }],
                response_format: { type: "json_object" },
                temperature: 0.3
            })
        });

        const data = await response.json();

        // 5. Send ONLY the result back to your website
        return {
            statusCode: 200,
            body: data.choices[0].message.content
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Backend Error: " + error.message })
        };
    }
};