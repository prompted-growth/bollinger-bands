const cache = {};
const alertCache = {};
const COOLDOWN_PERIOD = 3600000; // 1 hour in milliseconds

// Bollinger Bands calculation
function calculateBollingerBands(prices, period = 20, stdDev = 2) {
  if (prices.length < period) return null;
  
  const recentPrices = prices.slice(-period);
  const sma = recentPrices.reduce((a, b) => a + b, 0) / period;
  
  const squaredDiffs = recentPrices.map(price => Math.pow(price - sma, 2));
  const variance = squaredDiffs.reduce((a, b) => a + b, 0) / period;
  const standardDeviation = Math.sqrt(variance);
  
  const upperBand = sma + (standardDeviation * stdDev);
  const lowerBand = sma - (standardDeviation * stdDev);
  
  return { upper: upperBand, middle: sma, lower: lowerBand };
}

// Calculate position in band (0-100%)
function getPositionInBand(price, bands) {
  if (!bands) return null;
  const position = ((price - bands.lower) / (bands.upper - bands.lower)) * 100;
  return Math.max(0, Math.min(100, position));
}

// Get signal type and confidence
function getSignal(position) {
  if (position === null) return null;
  
  if (position <= 5) {
    return { action: 'STRONG BUY', confidence: 85 + (5 - position) * 3, color: '🟢' };
  } else if (position >= 95) {
    return { action: 'STRONG SELL', confidence: 85 + (position - 95) * 3, color: '🔴' };
  }
  
  return null; // Only alert on STRONG signals
}

// Send SMS via Twilio
async function sendSMS(message) {
  const accountSid = process.env.TWILIO_ACCOUNT_SID;
  const authToken = process.env.TWILIO_AUTH_TOKEN;
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;
  const toNumber = process.env.YOUR_PHONE_NUMBER;
  
  const auth = Buffer.from(`${accountSid}:${authToken}`).toString('base64');
  
  const response = await fetch(`https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`, {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
    },
    body: new URLSearchParams({
      From: fromNumber,
      To: toNumber,
      Body: message
    })
  });
  
  return response.ok;
}

// Check if we should send alert (cooldown logic)
function shouldSendAlert(symbol, signal) {
  const now = Date.now();
  const cacheKey = `${symbol}-${signal}`;
  
  if (alertCache[cacheKey] && (now - alertCache[cacheKey] < COOLDOWN_PERIOD)) {
    return false; // Already sent alert in last hour
  }
  
  alertCache[cacheKey] = now;
  return true;
}

// Fetch and check one coin
async function checkCoin(symbol) {
  try {
    const binanceSymbol = symbol + 'USDT';
    const response = await fetch(
      `https://api.binance.com/api/v3/klines?symbol=${binanceSymbol}&interval=1h&limit=100`
    );
    
    if (!response.ok) return null;
    
    const data = await response.json();
    const prices = data.map(candle => parseFloat(candle[4])); // Close prices
    const currentPrice = prices[prices.length - 1];
    
    const bands = calculateBollingerBands(prices);
    if (!bands) return null;
    
    const position = getPositionInBand(currentPrice, bands);
    const signal = getSignal(position);
    
    if (signal && shouldSendAlert(symbol, signal.action)) {
      const message = `${signal.color} ${symbol} ${signal.action}!\n` +
                     `Price: $${currentPrice.toLocaleString()}\n` +
                     `Confidence: ${Math.round(signal.confidence)}%\n` +
                     `Position: ${position.toFixed(1)}% in band`;
      
      await sendSMS(message);
      return { symbol, signal: signal.action, price: currentPrice };
    }
    
    return null;
  } catch (error) {
    console.error(`Error checking ${symbol}:`, error);
    return null;
  }
}

// Main handler
exports.handler = async (event, context) => {
  const coins = ['BTC', 'ETH', 'SOL', 'ZEC'];
  
  try {
    const results = await Promise.all(coins.map(checkCoin));
    const alerts = results.filter(r => r !== null);
    
    return {
      statusCode: 200,
      body: JSON.stringify({
        message: 'Alert check completed',
        alertsSent: alerts.length,
        alerts: alerts
      })
    };
  } catch (error) {
    console.error('Error in check-alerts:', error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: error.message })
    };
  }
};
