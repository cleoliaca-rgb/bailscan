/**
 * BailScan — /api/checkout-proprio.js
 * Flow propriétaire (proprio.html) — paiement unique
 * Même logique que checkout.js : customer_email optionnel
 */
 
const Stripe = require('stripe');
 
function isValidEmail(email) {
  return typeof email === 'string' && email.length > 0 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}
 
module.exports = async (req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
  try {
    const { email, bail_ref, price_id } = req.body || {};
 
    const priceId = price_id
      || process.env.STRIPE_PRICE_PROPRIO
      || process.env.STRIPE_PRICE_29;
 
    if (!priceId) {
      return res.status(500).json({ error: 'Price ID non configuré. Ajoutez STRIPE_PRICE_PROPRIO dans Vercel.' });
    }
 
    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{ price: priceId, quantity: 1 }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app'}/proprio.html?paiement=success&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app'}/proprio.html?paiement=cancel`,
      allow_promotion_codes: true,
      payment_intent_data: {
        description: 'BailScan — Analyse propriétaire',
        metadata: { product: 'bailscan-proprio', bail_ref: bail_ref || '' },
      },
      metadata: { product: 'bailscan-proprio', bail_ref: bail_ref || '' },
    };
 
    if (isValidEmail(email)) {
      sessionParams.customer_email = email.trim();
    }
 
    const session = await stripe.checkout.sessions.create(sessionParams);
    return res.status(200).json({ url: session.url });
 
  } catch (err) {
    console.error('[checkout-proprio] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
 
