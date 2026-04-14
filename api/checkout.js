/**
 * BailScan — /api/checkout.js
 * Flow locataire (index.html) — paiement unique 29€
 * Fix: customer_email omis si vide/invalide (Stripe le collecte lui-même)
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
 
    // Prix : variable d'env ou fallback price_id passé par le front
    const priceId = price_id
      || process.env.STRIPE_PRICE_TENANT
      || process.env.STRIPE_PRICE_29;
 
    if (!priceId) {
      return res.status(500).json({ error: 'Price ID non configuré. Ajoutez STRIPE_PRICE_TENANT dans Vercel.' });
    }
 
    const sessionParams = {
      mode: 'payment',
      payment_method_types: ['card'],
      line_items: [{
        price: priceId,
        quantity: 1,
      }],
      success_url: `${process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app'}/#paid=true`,
      cancel_url:  `${process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app'}/#paid=false`,
      allow_promotion_codes: true,
      payment_intent_data: {
        description: 'BailScan — Analyse complète de bail',
        metadata: {
          product: 'bailscan-tenant',
          bail_ref: bail_ref || '',
        },
      },
      metadata: {
        product: 'bailscan-tenant',
        bail_ref: bail_ref || '',
      },
    };
 
    // N'ajouter customer_email que si l'email est valide
    // Sinon Stripe le collecte lui-même pendant le checkout → plus d'erreur
    if (isValidEmail(email)) {
      sessionParams.customer_email = email.trim();
    }
 
    const session = await stripe.checkout.sessions.create(sessionParams);
 
    return res.status(200).json({ url: session.url });
 
  } catch (err) {
    console.error('[checkout] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
 
