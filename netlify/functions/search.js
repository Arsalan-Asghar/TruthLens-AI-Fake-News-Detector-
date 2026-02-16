// netlify/functions/search.js
exports.handler = async function(event, context) {
    if (event.httpMethod !== "POST") {
        return { statusCode: 405, body: "Method Not Allowed" };
    }

    try {
        const { query } = JSON.parse(event.body);
        
        // 🔒 Get Key from Netlify (Secure)
        const TAVILY_KEY = process.env.TAVILY_API_KEY;

        if (!TAVILY_KEY) {
            return { statusCode: 500, body: JSON.stringify({ error: "Server API Key Missing" }) };
        }

        // Call Tavily from Server
        const response = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: TAVILY_KEY,
                query: query,
                search_depth: "basic",
                include_answer: true,
                max_results: 3
            })
        });

        const data = await response.json();

        return {
            statusCode: 200,
            body: JSON.stringify(data)
        };

    } catch (error) {
        return {
            statusCode: 500,
            body: JSON.stringify({ error: "Search Failed: " + error.message })
        };
    }
};