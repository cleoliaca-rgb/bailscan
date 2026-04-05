// api/webhook-pro.js
// Webhook Stripe — gère les événements d'abonnement
// Variables Vercel : STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET_PRO, SUPABASE_URL, SUPABASE_SERVICE_KEY
 
const Stripe = require('stripe');
 
module.exports = async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET_PRO;
 
  let event;
  try {
    // Vercel body parsing — désactiver pour les webhooks Stripe
    const rawBody = req.body;
    event = stripe.webhooks.constructEvent(rawBody, sig, webhookSecret);
  } catch (err) {
    console.error('Webhook signature error:', err.message);
    return res.status(400).json({ error: 'Invalid signature' });
  }
 
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY;
 
  async function updateAgence(agence_id, updates) {
    if (!agence_id) return;
    await fetch(`${SUPABASE_URL}/rest/v1/agences?id=eq.${agence_id}`, {
      method: 'PATCH',
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(updates)
    });
  }
 
  try {
    switch (event.type) {
 
      case 'checkout.session.completed': {
        const session = event.data.object;
        const agence_id = session.metadata && session.metadata.agence_id;
        const plan = session.metadata && session.metadata.plan;
        if (agence_id && plan) {
          await updateAgence(agence_id, {
            plan: plan,
            stripe_customer_id: session.customer,
            stripe_subscription_id: session.subscription,
            updated_at: new Date().toISOString()
          });
        }
        break;
      }
 
      case 'invoice.payment_succeeded': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          // Récupérer l'agence via subscription_id
          const r = await fetch(`${SUPABASE_URL}/rest/v1/agences?stripe_subscription_id=eq.${subId}&select=id,plan`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
          });
          const rows = await r.json();
          if (rows && rows[0]) {
            await updateAgence(rows[0].id, {
              plan: rows[0].plan || 'starter',
              updated_at: new Date().toISOString()
            });
          }
        }
        break;
      }
 
      case 'invoice.payment_failed': {
        const invoice = event.data.object;
        const subId = invoice.subscription;
        if (subId) {
          const r = await fetch(`${SUPABASE_URL}/rest/v1/agences?stripe_subscription_id=eq.${subId}&select=id`, {
            headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
          });
          const rows = await r.json();
          if (rows && rows[0]) {
            await updateAgence(rows[0].id, {
              plan: 'payment_failed',
              updated_at: new Date().toISOString()
            });
          }
        }
        break;
      }
 
      case 'customer.subscription.deleted': {
        const sub = event.data.object;
        const r = await fetch(`${SUPABASE_URL}/rest/v1/agences?stripe_subscription_id=eq.${sub.id}&select=id`, {
          headers: { 'apikey': SUPABASE_KEY, 'Authorization': 'Bearer ' + SUPABASE_KEY }
        });
        const rows = await r.json();
        if (rows && rows[0]) {
          await updateAgence(rows[0].id, {
            plan: 'cancelled',
            stripe_subscription_id: null,
            updated_at: new Date().toISOString()
          });
        }
        break;
      }
    }
 
    return res.status(200).json({ received: true });
  } catch (err) {
    console.error('webhook-pro handler error:', err);
    return res.status(500).json({ error: err.message });
  }
};
