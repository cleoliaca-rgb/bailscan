/**
 * BailScan Pro — /api/checkout-pro.js
 * Crée une session Stripe Checkout pour les 3 modes d'abonnement
 *
 * Variables d'environnement Vercel (obligatoires) :
 *   STRIPE_SECRET_KEY          → sk_live_... ou sk_test_...
 *   STRIPE_PRICE_MENSUEL       → price_xxx  (150€/mois, sans engagement)
 *   STRIPE_PRICE_6MOIS         → price_xxx  (135€/mois × 6)
 *   STRIPE_PRICE_12MOIS        → price_xxx  (120€/mois × 12)
 *   NEXT_PUBLIC_APP_URL        → https://bailscan.app (ou ton domaine)
 *
 * Comment créer les prix dans Stripe Dashboard :
 *   → Produits → "BailScan Pro" → Ajouter un prix
 *   → Mensuel  : 150€, récurrent mensuel, sans engagement
 *   → 6 mois   : 135€, récurrent mensuel — ajouter metadata engagement=6mois
 *   → 12 mois  : 120€, récurrent mensuel — ajouter metadata engagement=12mois
 */
 
import Stripe from 'stripe';
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { plan, mode, email, agence_id } = req.body || {};
 
  if (!email) return res.status(400).json({ error: 'Email requis' });
 
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
 
  // ── Choisir le bon Price ID selon le mode ──
  const PRICES = {
    mensuel: process.env.STRIPE_PRICE_MENSUEL,
    '6mois':  process.env.STRIPE_PRICE_6MOIS,
    '12mois': process.env.STRIPE_PRICE_12MOIS,
  };
 
  const priceId = PRICES[mode] || PRICES['mensuel'];
  if (!priceId) {
    return res.status(500).json({
      error: `Price ID manquant pour le mode "${mode}". Configurez STRIPE_PRICE_${(mode||'mensuel').toUpperCase()} dans Vercel.`
    });
  }
 
  const appUrl = process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app';
 
  try {
    // ── Trouver ou créer le customer Stripe ──
    let customer;
    const existing = await stripe.customers.list({ email, limit: 1 });
    if (existing.data.length > 0) {
      customer = existing.data[0];
    } else {
      customer = await stripe.customers.create({
        email,
        metadata: { agence_id: agence_id || '', source: 'bailscan_pro' },
      });
    }
 
    // ── Paramètres d'engagement selon le mode ──
    const subscriptionData = {
      metadata: {
        agence_id: agence_id || '',
        plan: 'pro',
        mode: mode || 'mensuel',
      },
    };
 
    // Pour les engagements 6 et 12 mois, on peut ajouter une période minimale via cancel_at
    // (Stripe gère ça via des cancellation rules côté dashboard, mais on stocke en metadata)
    if (mode === '6mois') {
      subscriptionData.metadata.engagement_months = '6';
      subscriptionData.metadata.min_end = new Date(Date.now() + 6 * 30 * 24 * 3600 * 1000).toISOString();
    } else if (mode === '12mois') {
      subscriptionData.metadata.engagement_months = '12';
      subscriptionData.metadata.min_end = new Date(Date.now() + 12 * 30 * 24 * 3600 * 1000).toISOString();
    }
 
    // ── Créer la session Checkout ──
    const session = await stripe.checkout.sessions.create({
      mode: 'subscription',
      customer: customer.id,
      line_items: [{ price: priceId, quantity: 1 }],
      subscription_data: subscriptionData,
 
      // Facturation automatique par email (Stripe envoie les factures auto)
      invoice_creation: undefined, // Géré par les paramètres Stripe (voir webhook)
 
      // URL de retour
      success_url: `${appUrl}?subscribed=true&plan=${plan || 'pro'}&mode=${mode || 'mensuel'}&session_id={CHECKOUT_SESSION_ID}`,
      cancel_url:  `${appUrl}?canceled=true`,
 
      // Email du client pré-rempli
      customer_email: customer.id ? undefined : email,
 
      // Permettre les codes promo
      allow_promotion_codes: true,
 
      // Langue française
      locale: 'fr',
 
      // Metadonnées session
      metadata: {
        agence_id: agence_id || '',
        plan: 'pro',
        mode: mode || 'mensuel',
      },
    });
 
    return res.status(200).json({ url: session.url, session_id: session.id });
 
  } catch (err) {
    console.error('[checkout-pro] Stripe error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
