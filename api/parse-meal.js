module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  if (req.method !== 'POST') { res.status(405).json({ error: 'Method not allowed' }); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    res.status(500).json({ error: 'NO_API_KEY', detail: 'ANTHROPIC_API_KEY is not set in Vercel environment variables' });
    return;
  }

  const body = typeof req.body === 'string' ? JSON.parse(req.body) : req.body || {};
  const text = (body.text || '').trim();
  if (!text) { res.status(400).json({ error: 'NO_TEXT' }); return; }

  try {
    const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
        'content-type': 'application/json'
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 200,
        messages: [{
          role: 'user',
          content: 'Nutrition facts for: ' + text + '\nReply with exactly 5 lines:\nNAME: food name\nCAL: number\nPROTEIN: number\nCARBS: number\nFAT: number'
        }]
      })
    });

    const data = await claudeRes.json();
    if (!claudeRes.ok) {
      res.status(502).json({ error: 'CLAUDE_ERROR', status: claudeRes.status, detail: data?.error?.message });
      return;
    }

    const reply = data.content?.[0]?.text || '';
    const get = (label) => {
      const m = reply.match(new RegExp(label + '[:\\s]+([\\d.]+)', 'i'));
      return m ? Math.round(parseFloat(m[1])) : 0;
    };
    const nameMatch = reply.match(/NAME[:\s]+(.+)/i);
    res.status(200).json({
      name: nameMatch ? nameMatch[1].trim() : text,
      cal: get('CAL'),
      protein: get('PROTEIN'),
      carbs: get('CARBS'),
      fat: get('FAT')
    });
  } catch (e) {
    res.status(500).json({ error: 'EXCEPTION', detail: e.message });
  }
};
