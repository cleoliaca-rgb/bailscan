// api/checkout-pro.js
// Abonnement Stripe récurrent — Starter 79€/mois ou Pro 199€/mois
// Variables Vercel : STRIPE_SECRET_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 
const Stripe = require('stripe');
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { plan, email, agence_id, prenom, nom } = req.body || {};
 
  if (!plan || !email) return res.status(400).json({ error: 'plan et email requis' });
  if (!['starter', 'pro'].includes(plan)) return res.status(400).json({ error: 'plan invalide' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
  // Prix mensuels récurrents (à créer dans Stripe Dashboard ou via API)
  // Starter : 79€/mois — Pro : 199€/mois
  const PRICES = {
    starter: { amount: 7900, name: 'BailScan Pro Starter', description: 'Jusqu\'à 50 analyses/mois, tous outils inclus' },
    pro:     { amount: 19900, name: 'BailScan Pro',        description: 'Analyses illimitées, équipe, export, support prioritaire' },
  };
  const p = PRICES[plan];
 
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'subscription',
      customer_email: email,
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: p.name,
            description: p.description,
          },
          unit_amount: p.amount,
          recurring: { interval: 'month' },
        },
        quantity: 1,
      }],
      subscription_data: {
        metadata: { agence_id: agence_id || '', plan, email },
        trial_period_days: 0,
      },
      metadata: { agence_id: agence_id || '', plan },
      success_url: 'https://' + req.headers.host + '/pro.html?subscribed=true&plan=' + plan,
      cancel_url: 'https://' + req.headers.host + '/pro.html?subscribed=false',
      locale: 'fr',
    });
 
    return res.status(200).json({ url: session.url });
  } catch (err) {
    console.error('checkout-pro error:', err);
    return res.status(500).json({ error: err.message });
  }
};
