const cache = {};
const CACHE_DURATION = 120000; // 2 minutes

exports.handler = async (event, context) => {
  const headers = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'GET, OPTIONS',
    'Content-Type': 'application/json'
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 200, headers, body: '' };
  }

  const symbol = event.queryStringParameters?.symbol || 'BTC';
  const cacheKey = symbol;

  if (cache[cacheKey] && (Date.now() - cache[cacheKey].timestamp < CACHE_DURATION)) {
    return {
      statusCode: 200,
      headers,
      body: JSON.stringify(cache[cacheKey].data)
    };
  }

  try {
    const binanceSymbol = symbol + 'USDT';
    let response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=1000`
    );

    if (response.ok) {
      const data = await response.json();
      cache[cacheKey] = { data, timestamp: Date.now() };
      return {
        statusCode: 200,
        headers,
        body: JSON.stringify(data)
      };
    }

    const krakenPair = symbol + 'USD';
response = await fetch(
  `https://api.kraken.com/0/public/OHLC?pair=${krakenPair}&interval=60&count=720`
);
    if (response.ok) {
      const krakenData = await response.json();
      if (krakenData.result) {
        const pairData = Object.values(krakenData.result)[0];
        const convertedData = pairData.map(item => [
          item[0] * 1000,
          item[1], item[2], item[3], item[4], item[6]
        ]);
        cache[cacheKey] = { data: convertedData, timestamp: Date.now() };
        return {
          statusCode: 200,
          headers,
          body: JSON.stringify(convertedData)
        };
      }
    }

    throw new Error('All APIs failed');
  } catch (error) {
    return {
      statusCode: 500,
      headers,
      body: JSON.stringify({ error: 'Failed to fetch crypto data', message: error.message })
    };
  }
};
