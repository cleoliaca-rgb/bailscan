/**
 * BailScan Pro — /api/cancel-subscription.js
 * Résilie l'abonnement Stripe à la fin de la période en cours
 *
 * Variables d'environnement Vercel :
 *   STRIPE_SECRET_KEY     → sk_live_...
 *   SUPABASE_URL          → https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY  → service_role key
 */
 
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { agence_id } = req.body || {};
  if (!agence_id) return res.status(400).json({ error: 'agence_id requis' });
 
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  try {
    // ── Récupérer l'agence et son stripe_subscription_id ──
    const { data: agence, error } = await sb
      .from('agences')
      .select('stripe_subscription_id, stripe_customer_id, email, nom, plan, mode_engagement')
      .eq('id', agence_id)
      .single();
 
    if (error || !agence) return res.status(404).json({ error: 'Agence introuvable' });
    if (!agence.stripe_subscription_id) return res.status(400).json({ error: 'Aucun abonnement actif trouvé' });
 
    // ── Vérifier la période d'engagement minimale ──
    const sub = await stripe.subscriptions.retrieve(agence.stripe_subscription_id);
    const engagementMonths = parseInt(sub.metadata?.engagement_months || '0');
    const minEnd = sub.metadata?.min_end ? new Date(sub.metadata.min_end) : null;
 
    if (minEnd && new Date() < minEnd) {
      const remaining = Math.ceil((minEnd - new Date()) / (30 * 24 * 3600 * 1000));
      return res.status(400).json({
        error: `Engagement ${engagementMonths} mois en cours. Résiliation possible dans ${remaining} mois (${minEnd.toLocaleDateString('fr-FR')}).`,
        min_end: minEnd.toISOString(),
        locked: true,
      });
    }
 
    // ── Résilier à la fin de la période en cours ──
    const cancelled = await stripe.subscriptions.update(agence.stripe_subscription_id, {
      cancel_at_period_end: true,
    });
 
    // ── Mettre à jour Supabase ──
    const periodEnd = new Date(cancelled.current_period_end * 1000);
    await sb.from('agences').update({
      plan: 'canceling',
      cancel_at: periodEnd.toISOString(),
      updated_at: new Date().toISOString(),
    }).eq('id', agence_id);
 
    return res.status(200).json({
      ok: true,
      cancel_at: periodEnd.toISOString(),
      message: `Résiliation confirmée. Accès actif jusqu'au ${periodEnd.toLocaleDateString('fr-FR')}.`,
    });
 
  } catch (err) {
    console.error('[cancel-subscription] Error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
 
