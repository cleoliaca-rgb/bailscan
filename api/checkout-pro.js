// api/checkout-pro.js
// Abonnement Stripe BailScan Pro — mensuel / 6 mois / 12 mois
// Variables Vercel : STRIPE_SECRET_KEY
 
const Stripe = require('stripe');
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { email, agence_id, mode } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email requis' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
  // Prix selon l'engagement
  const CONFIGS = {
    mensuel: { amount: 15000, interval: 'month', interval_count: 1, label: 'Mensuel — sans engagement' },
    '6mois': { amount: 13500, interval: 'month', interval_count: 1, label: '6 mois — 135€/mois', trial_days: 0, coupon: null },
    '12mois': { amount: 12000, interval: 'month', interval_count: 1, label: '12 mois — 120€/mois' },
  };
  const cfg = CONFIGS[mode] || CONFIGS.mensuel;
 
  try {
    const sessionParams = {
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BailScan Pro',
            description: cfg.label,
          },
          unit_amount: cfg.amount,
          recurring: { interval: cfg.interval },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: { agence_id: agence_id || '', email, mode: mode || 'mensuel' },
        // Envoyer la facture par email à chaque renouvellement
        description: `BailScan Pro — ${cfg.label}`,
        // Engagement 6 ou 12 mois via cancel_at
        ...(mode === '6mois' ? { cancel_at: Math.floor(Date.now() / 1000) + 6 * 30 * 24 * 3600 } : {}),
        ...(mode === '12mois' ? { cancel_at: Math.floor(Date.now() / 1000) + 365 * 24 * 3600 } : {}),
      },
      metadata: { agence_id: agence_id || '', mode: mode || 'mensuel' },
      success_url: 'https://' + req.headers.host + '/pro.html?subscribed=true&plan=pro',
      cancel_url: 'https://' + req.headers.host + '/pro.html',
      locale: 'fr',
    };
 
    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout-pro error:', err);
    return res.status(500).json({ error: err.message });
  }
};
