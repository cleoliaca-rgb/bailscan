// BailScan — /api/checkout-proprio.js
// Checkout Stripe propriétaire — 49€
 
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  try {
    var mode = (req.body && req.body.mode) || 'generer';
    var productName = mode === 'generer'
      ? 'BailScan — Bail conforme généré'
      : 'BailScan — Analyse bail propriétaire';
    var description = mode === 'generer'
      ? 'Bail conforme rédigé selon loi 1989 / ALUR / ELAN, adapté à votre bien'
      : 'Analyse complète de votre bail avec détection des clauses à risque';
 
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: productName,
            description: description,
          },
          unit_amount: 4900, // 49€
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://' + req.headers.host + '/proprio.html?paid=true&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://' + req.headers.host + '/proprio.html?paid=false',
      locale: 'fr',
    });
 
    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
 
