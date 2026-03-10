import Stripe from 'stripe';

const stripe = Stripe(process.env.STRIPE_SECRET_KEY);

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [{
        price_data: {
          currency: 'eur',
          product_data: {
            name: 'BailScan — Analyse complete',
            description: 'Toutes les clauses analysees + 5 lettres officielles personnalisees',
          },
          unit_amount: 900,
        },
        quantity: 1,
      }],
      mode: 'payment',
      success_url: 'https://' + req.headers.host + '/?paid=true&session_id={CHECKOUT_SESSION_ID}',
      cancel_url: 'https://' + req.headers.host + '/?paid=false',
      locale: 'fr',
    });

    res.status(200).json({ url: session.url, sessionId: session.id });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
};
