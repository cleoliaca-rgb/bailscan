// BailScan — /api/checkout-proprio.js
// Checkout Stripe propriétaire — 49€
 
const Stripe = require('stripe');
const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  try {
    var mode = (req.body && req.body.mode) || 'generer';
    var email = (req.body && req.body.email) || null;
 
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BailScan — Accès complet propriétaire',
            description: 'Génération de bail conforme + Analyse de bail. Accès à vie, modifications illimitées.',
          },
          unit_amount: 4900, // 49€
        },
        quantity: 1,
      }],
      mode: 'payment',
      customer_creation: 'always',
      // Email pour le reçu automatique Stripe
      ...(email ? { customer_email: email } : {}),
      payment_intent_data: {
        ...(email ? { receipt_email: email } : {}),
        description: 'BailScan — Accès propriétaire (génération + analyse)',
      },
      success_url: 'https://' + req.headers.host + '/proprio.html?paid=true&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://' + req.headers.host + '/proprio.html?paid=false',
      locale: 'fr',
    });
 
    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
