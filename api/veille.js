// api/veille.js — Veille réglementaire BailScan Pro
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
 
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) return res.status(500).json({ error: 'ANTHROPIC_API_KEY manquante' });
 
  const prompt = `Tu es un expert en droit immobilier français. Génère 6 actualités réglementaires récentes sur la location immobilière en France (loi, décret, jurisprudence, IRL, encadrement loyers, DPE...). 
Réponds UNIQUEMENT en JSON valide, sans markdown, sans explication :
{"items":[{"titre":"...","résumé":"...","source":"...","date":"...","urgence":"info|warning|danger","lien":""},...]}`;
 
  try {
    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'anthropic-version': '2023-06-01',
        'x-api-key': apiKey
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 1200,
        messages: [{ role: 'user', content: prompt }]
      })
    });
 
    const data = await response.json();
    const text = data.content?.[0]?.text || '{}';
    
    let parsed;
    try {
      parsed = JSON.parse(text);
    } catch(e) {
      const match = text.match(/\{[\s\S]*\}/);
      parsed = match ? JSON.parse(match[0]) : { items: [] };
    }
 
    return res.status(200).json(parsed);
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
 
