/**
 * BailScan Pro — /api/stripe-webhook.js
 * Gère tous les événements Stripe :
 *   - checkout.session.completed → active le plan
 *   - invoice.payment_succeeded  → envoie la facture par email
 *   - invoice.payment_failed     → envoie un email d'alerte
 *   - customer.subscription.deleted → désactive le plan
 *
 * Variables d'environnement Vercel :
 *   STRIPE_SECRET_KEY        → sk_live_...
 *   STRIPE_WEBHOOK_SECRET    → whsec_... (depuis Stripe Dashboard → Webhooks)
 *   SUPABASE_URL             → https://xxx.supabase.co
 *   SUPABASE_SERVICE_KEY     → service_role key
 *   RESEND_API_KEY           → re_...
 *   RESEND_FROM_EMAIL        → noreply@bailscan.app (domaine vérifié sur Resend)
 */
 
import Stripe from 'stripe';
import { createClient } from '@supabase/supabase-js';
 
export const config = { api: { bodyParser: false } };
 
// Lire le raw body (requis pour vérifier la signature Stripe)
async function getRawBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}
 
// ── Envoi email via Resend ──
async function sendEmail({ to, subject, html }) {
  if (!process.env.RESEND_API_KEY) {
    console.warn('[webhook] RESEND_API_KEY manquant — email non envoyé');
    return;
  }
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      from: process.env.RESEND_FROM_EMAIL || 'BailScan Pro <noreply@bailscan.app>',
      to: [to],
      subject,
      html,
    }),
  });
  if (!r.ok) {
    const err = await r.text();
    console.error('[webhook] Resend error:', err);
  }
}
 
// ── Template email facture ──
function invoiceEmailHtml({ agenceName, invoiceUrl, invoiceNumber, amount, date, periodStart, periodEnd, mode }) {
  const modeLabel = mode === '6mois' ? '6 mois' : mode === '12mois' ? '12 mois' : 'mensuel';
  return `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: 'DM Sans', Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .container { max-width: 560px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .header { background: #0f172a; padding: 28px 32px; }
  .logo { font-size: 22px; font-weight: 700; color: white; }
  .logo em { color: #f97316; font-style: italic; }
  .logo-badge { font-size: 10px; font-weight: 700; background: #3b6fd4; color: white; padding: 2px 8px; border-radius: 4px; margin-left: 6px; vertical-align: middle; }
  .body { padding: 32px; }
  h2 { font-size: 20px; color: #0f172a; margin: 0 0 8px; }
  p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 16px; }
  .invoice-box { background: #f1f5f9; border-radius: 10px; padding: 20px 24px; margin: 20px 0; }
  .invoice-row { display: flex; justify-content: space-between; padding: 5px 0; font-size: 14px; color: #334155; border-bottom: 1px solid #e2e8f0; }
  .invoice-row:last-child { border: none; font-weight: 700; color: #0f172a; font-size: 16px; padding-top: 12px; }
  .btn { display: inline-block; background: #3b6fd4; color: white; padding: 12px 28px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; margin: 8px 0; }
  .footer { background: #f8fafc; padding: 20px 32px; font-size: 12px; color: #94a3b8; border-top: 1px solid #e2e8f0; }
</style></head><body>
<div class="container">
  <div class="header">
    <div class="logo">Bail<em>Scan</em><span class="logo-badge">PRO</span></div>
  </div>
  <div class="body">
    <h2>Votre facture BailScan Pro</h2>
    <p>Bonjour ${agenceName || ''},<br>
    Votre paiement a bien été reçu. Retrouvez ci-dessous le récapitulatif de votre facture.</p>
 
    <div class="invoice-box">
      <div class="invoice-row"><span>N° de facture</span><span>${invoiceNumber}</span></div>
      <div class="invoice-row"><span>Date</span><span>${date}</span></div>
      <div class="invoice-row"><span>Abonnement</span><span>BailScan Pro — ${modeLabel}</span></div>
      <div class="invoice-row"><span>Période</span><span>${periodStart} → ${periodEnd}</span></div>
      <div class="invoice-row"><span>Total TTC</span><span>${amount}</span></div>
    </div>
 
    <a href="${invoiceUrl}" class="btn">Télécharger la facture PDF →</a>
 
    <p style="margin-top: 20px; font-size: 13px;">
      Pour toute question, répondez à cet email ou contactez-nous à
      <a href="mailto:contact@bailscan.app" style="color: #3b6fd4;">contact@bailscan.app</a>
    </p>
  </div>
  <div class="footer">
    BailScan Pro · Hive Concept · TVA intracommunautaire disponible sur votre facture<br>
    Vous recevez cet email car vous êtes abonné à BailScan Pro.
  </div>
</div>
</body></html>`;
}
 
// ── Template email échec de paiement ──
function paymentFailedHtml({ agenceName, amount, nextAttempt }) {
  return `
<!DOCTYPE html><html><head><meta charset="utf-8">
<style>
  body { font-family: Arial, sans-serif; background: #f8fafc; margin: 0; padding: 0; }
  .container { max-width: 540px; margin: 40px auto; background: white; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 24px rgba(0,0,0,.08); }
  .header { background: #dc2626; padding: 24px 32px; }
  .logo { font-size: 18px; font-weight: 700; color: white; }
  .body { padding: 28px 32px; }
  h2 { color: #dc2626; font-size: 18px; margin: 0 0 12px; }
  p { font-size: 14px; color: #64748b; line-height: 1.6; margin: 0 0 14px; }
  .btn { display: inline-block; background: #dc2626; color: white; padding: 12px 24px; border-radius: 8px; text-decoration: none; font-weight: 700; font-size: 14px; }
</style></head><body>
<div class="container">
  <div class="header"><div class="logo">BailScan Pro — Échec de paiement</div></div>
  <div class="body">
    <h2>Votre paiement n'a pas abouti</h2>
    <p>Bonjour ${agenceName || ''},<br>
    Nous n'avons pas pu débiter ${amount} sur votre moyen de paiement enregistré.</p>
    <p>${nextAttempt ? `Une nouvelle tentative sera effectuée le <strong>${nextAttempt}</strong>.` : 'Merci de mettre à jour votre moyen de paiement.'}</p>
    <a href="https://bailscan.app" class="btn">Mettre à jour mon paiement →</a>
    <p style="margin-top: 16px; font-size: 12px; color: #94a3b8;">Sans régularisation, votre accès sera suspendu.</p>
  </div>
</div></body></html>`;
}
 
export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).end();
 
  const stripe = new Stripe(process.env.STRIPE_SECRET_KEY, { apiVersion: '2023-10-16' });
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  const rawBody = await getRawBody(req);
  const sig = req.headers['stripe-signature'];
 
  let event;
  try {
    event = stripe.webhooks.constructEvent(rawBody, sig, process.env.STRIPE_WEBHOOK_SECRET);
  } catch (err) {
    console.error('[webhook] Signature invalide:', err.message);
    return res.status(400).json({ error: 'Signature webhook invalide' });
  }
 
  console.log(`[webhook] Event: ${event.type}`);
 
  try {
    // ─────────────────────────────────────────────────────────
    // checkout.session.completed → Activer le plan
    // ─────────────────────────────────────────────────────────
    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      const agenceId = session.metadata?.agence_id;
      const mode = session.metadata?.mode || 'mensuel';
      const subId = session.subscription;
 
      if (agenceId && subId) {
        await sb.from('agences').update({
          plan: 'pro',
          mode_engagement: mode,
          stripe_subscription_id: subId,
          stripe_customer_id: session.customer,
          trial_end: null,
          updated_at: new Date().toISOString(),
        }).eq('id', agenceId);
 
        console.log(`[webhook] Plan activé pour agence ${agenceId} (mode: ${mode})`);
      }
    }
 
    // ─────────────────────────────────────────────────────────
    // invoice.payment_succeeded → Envoyer la facture par email
    // ─────────────────────────────────────────────────────────
    if (event.type === 'invoice.payment_succeeded') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
 
      // Récupérer l'email et le nom de l'agence depuis Supabase
      const { data: agence } = await sb
        .from('agences')
        .select('email, nom, mode_engagement')
        .eq('stripe_customer_id', customerId)
        .single();
 
      const emailTo = agence?.email || invoice.customer_email;
      if (!emailTo) { console.warn('[webhook] Pas d\'email pour la facture'); }
      else {
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.amount_paid / 100);
        const date = new Date(invoice.created * 1000).toLocaleDateString('fr-FR');
        const periodStart = new Date(invoice.lines.data[0]?.period?.start * 1000).toLocaleDateString('fr-FR');
        const periodEnd = new Date(invoice.lines.data[0]?.period?.end * 1000).toLocaleDateString('fr-FR');
 
        await sendEmail({
          to: emailTo,
          subject: `Votre facture BailScan Pro — ${amount}`,
          html: invoiceEmailHtml({
            agenceName: agence?.nom || '',
            invoiceUrl: invoice.hosted_invoice_url || '#',
            invoiceNumber: invoice.number || invoice.id,
            amount,
            date,
            periodStart,
            periodEnd,
            mode: agence?.mode_engagement || 'mensuel',
          }),
        });
        console.log(`[webhook] Facture envoyée à ${emailTo}`);
      }
    }
 
    // ─────────────────────────────────────────────────────────
    // invoice.payment_failed → Email d'alerte
    // ─────────────────────────────────────────────────────────
    if (event.type === 'invoice.payment_failed') {
      const invoice = event.data.object;
      const customerId = invoice.customer;
 
      const { data: agence } = await sb
        .from('agences')
        .select('email, nom')
        .eq('stripe_customer_id', customerId)
        .single();
 
      const emailTo = agence?.email || invoice.customer_email;
      if (emailTo) {
        const amount = new Intl.NumberFormat('fr-FR', { style: 'currency', currency: invoice.currency.toUpperCase() }).format(invoice.amount_due / 100);
        const nextAttempt = invoice.next_payment_attempt
          ? new Date(invoice.next_payment_attempt * 1000).toLocaleDateString('fr-FR')
          : null;
 
        await sendEmail({
          to: emailTo,
          subject: `Action requise — Échec de paiement BailScan Pro`,
          html: paymentFailedHtml({ agenceName: agence?.nom || '', amount, nextAttempt }),
        });
        console.log(`[webhook] Alerte échec de paiement envoyée à ${emailTo}`);
      }
    }
 
    // ─────────────────────────────────────────────────────────
    // customer.subscription.deleted → Désactiver le plan
    // ─────────────────────────────────────────────────────────
    if (event.type === 'customer.subscription.deleted') {
      const sub = event.data.object;
      await sb.from('agences').update({
        plan: 'expired',
        stripe_subscription_id: null,
        updated_at: new Date().toISOString(),
      }).eq('stripe_subscription_id', sub.id);
      console.log(`[webhook] Abonnement résilié: ${sub.id}`);
    }
 
    // ─────────────────────────────────────────────────────────
    // customer.subscription.updated → Sync statut
    // ─────────────────────────────────────────────────────────
    if (event.type === 'customer.subscription.updated') {
      const sub = event.data.object;
      if (sub.cancel_at_period_end) {
        const cancelAt = new Date(sub.cancel_at * 1000).toISOString();
        await sb.from('agences').update({
          plan: 'canceling',
          cancel_at: cancelAt,
          updated_at: new Date().toISOString(),
        }).eq('stripe_subscription_id', sub.id);
      }
    }
 
  } catch (err) {
    console.error('[webhook] Handler error:', err.message, err.stack);
    // On répond 200 quand même pour éviter que Stripe retry indéfiniment
    return res.status(200).json({ received: true, warning: err.message });
  }
 
  return res.status(200).json({ received: true });
}
 
