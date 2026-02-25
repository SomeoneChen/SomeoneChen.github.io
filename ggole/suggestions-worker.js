export default {
    async fetch(request, env, ctx) {
        const url = new URL(request.url);
        const query = url.searchParams.get('q');

        // Handle CORS preflight
        if (request.method === 'OPTIONS') {
            return new Response(null, {
                headers: {
                    'Access-Control-Allow-Origin': '*',
                    'Access-Control-Allow-Methods': 'GET, OPTIONS',
                    'Access-Control-Allow-Headers': '*',
                },
            });
        }

        if (!query) {
            return new Response(JSON.stringify([]), {
                headers: {
                    'content-type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }

        // Google Suggest API URL (chrome client returns JSON)
        const googleUrl = `https://suggestqueries.google.com/complete/search?client=chrome&q=${encodeURIComponent(query)}`;

        try {
            const response = await fetch(googleUrl, {
                headers: {
                    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
                }
            });
            const data = await response.json();

            // Return the suggestions with CORS and cache headers
            return new Response(JSON.stringify(data), {
                headers: {
                    'content-type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                    'Cache-Control': 'public, max-age=3600'
                },
            });
        } catch (error) {
            return new Response(JSON.stringify({ error: 'Failed to fetch suggestions', details: error.message }), {
                status: 500,
                headers: {
                    'content-type': 'application/json',
                    'Access-Control-Allow-Origin': '*',
                },
            });
        }
    },
};
