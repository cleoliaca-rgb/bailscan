// api/cancel-subscription.js
// Annuler l'abonnement Stripe depuis le dashboard
const Stripe = require('stripe');
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
 
  const { agence_id } = req.body || {};
  if (!agence_id) return res.status(400).json({ error: 'agence_id requis' });
 
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  try {
    // Récupérer l'ID abonnement depuis Supabase
    const { data: agence } = await sb.from('agences').select('stripe_subscription_id').eq('id', agence_id).single();
    if (!agence?.stripe_subscription_id) return res.status(404).json({ error: 'Aucun abonnement actif' });
 
    // Annuler en fin de période (pas immédiatement)
    await stripe.subscriptions.update(agence.stripe_subscription_id, {
      cancel_at_period_end: true
    });
 
    // Mettre à jour Supabase
    await sb.from('agences').update({ plan: 'canceling' }).eq('id', agence_id);
 
    return res.status(200).json({ ok: true, message: 'Abonnement annulé en fin de période' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
};
 
