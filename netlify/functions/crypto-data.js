// netlify/functions/crypto-data.js
// This serverless function fetches crypto data and caches it

const cache = {};
const CACHE_DURATION = 120000; // 2 minutes

exports.handler = async (event, context) => {
  // Enable CORS
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  // Handle OPTIONS request for CORS
  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const symbol = event.queryStringParameters?.symbol || 'BTC';
  const cacheKey = symbol;

  // Check cache
  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_DURATION)) {
    console.log(`Cache hit for ${symbol}`);
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(cache[cacheKey].data)
    };
  }

  try {
    // Try Binance first
    const binanceSymbol = symbol + 'USDT';
    let response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=100`
    );

    if (response.ok) {
      const data = await response.json();
      
      // Cache the result
      cache[cacheKey] = {
        data: data,
        timestamp: Date.now()
      };

      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    // If Binance fails, try Kraken
    console.log('Binance failed, trying Kraken');
    const krakenPair = symbol + 'USD';
    response = await fetch(
      `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=60`
    );

    if (response.ok) {
      const krakenData = await response.json();
      
      if (krakenData.result) {
        const pairData = Object.values(krakenData.result)[0];
        
        // Convert Kraken format to Binance format for consistency
        const convertedData = pairData.map(item => [
          item[0] * 1000, // timestamp to milliseconds
          item[1],        // open
          item[2],        // high
          item[3],        // low
          item[4],        // close
          item[6]         // volume
        ]);

        cache[cacheKey] = {
          data: convertedData,
          timestamp: Date.now()
        };

        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(convertedData)
        };
      }
    }

    throw new Error('All APIs failed');

  } catch (error) {
    console.error('Error fetching crypto data:', error);
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch crypto data', message: error.message })
    };
  }
};
```

**Save this as:** `netlify/functions/crypto-data.js`

**Final folder structure:**
```
your-project/
├── index.html
└── netlify/
    └── functions/
        └── crypto-data.js