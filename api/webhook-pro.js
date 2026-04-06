// api/webhook-pro.js — Stripe webhooks + emails automatiques
// Variables : STRIPE_WEBHOOK_SECRET_PRO, RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY
 
const Stripe = require('stripe');
 
async function sendEmail(to, subject, html) {
  await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
    body: JSON.stringify({ from: 'BailScan Pro <hello@bailscan.app>', to, subject, html })
  });
}
 
function emailBase(content) {
  return `<div style="font-family:'DM Sans',sans-serif;max-width:560px;margin:0 auto;background:white">
    <div style="background:#111827;padding:24px 28px"><div style="font-family:Georgia,serif;font-size:20px;color:white">BailScan Pro</div></div>
    <div style="padding:28px 28px 20px">${content}</div>
    <div style="padding:14px 28px;border-top:1px solid #e0d8cc;font-size:12px;color:#aaa;text-align:center">
      BailScan Pro · <a href="https://bailscan.app" style="color:#aaa">bailscan.app</a>
    </div>
  </div>`;
}
 
module.exports = async function handler(req, res) {
  const stripe = Stripe(process.env.STRIPE_SECRET_KEY);
  const sig = req.headers['stripe-signature'];
  let event;
 
  try {
    event = stripe.webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET_PRO);
  } catch (err) {
    return res.status(400).json({ error: err.message });
  }
 
  const { createClient } = require('@supabase/supabase-js');
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  const getAgence = async (customerId) => {
    const { data } = await sb.from('agences').select('*').eq('stripe_customer_id', customerId).single();
    return data;
  };
 
  switch (event.type) {
 
    case 'customer.subscription.created':
    case 'invoice.payment_succeeded': {
      const invoice = event.data.object;
      const agence = await getAgence(invoice.customer);
      if (!agence) break;
      await sb.from('agences').update({ plan: 'pro', trial_end: null }).eq('id', agence.id);
      if (event.type === 'invoice.payment_succeeded' && invoice.billing_reason === 'subscription_create') {
        await sendEmail(agence.email, 'Bienvenue sur BailScan Pro ! 🎉', emailBase(`
          <h2 style="font-size:18px;color:#111;margin-bottom:12px">Votre abonnement est actif</h2>
          <p style="color:#555;line-height:1.7;margin-bottom:20px">Merci pour votre confiance ! Votre abonnement BailScan Pro est maintenant actif. Vous avez accès à toutes les fonctionnalités sans limite.</p>
          <a href="https://bailscan.app/pro.html" style="background:#3b6fd4;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Accéder à mon dashboard →</a>
        `));
      } else if (event.type === 'invoice.payment_succeeded') {
        // Renouvellement mensuel
        const amount = (invoice.amount_paid / 100).toFixed(0);
        const date = new Date(invoice.period_end * 1000).toLocaleDateString('fr-FR', {month:'long', year:'numeric'});
        await sendEmail(agence.email, `Renouvellement BailScan Pro — ${date}`, emailBase(`
          <h2 style="font-size:18px;color:#111;margin-bottom:12px">Renouvellement confirmé</h2>
          <p style="color:#555;line-height:1.7;margin-bottom:16px">Votre abonnement BailScan Pro a été renouvelé pour ${date}.</p>
          <div style="background:#f8f7f4;border-radius:10px;padding:16px;margin-bottom:20px">
            <div style="display:flex;justify-content:space-between;font-size:14px"><span style="color:#555">Montant prélevé</span><span style="font-weight:700;color:#111">${amount} €</span></div>
          </div>
          <a href="https://bailscan.app/pro.html" style="background:#3b6fd4;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Mon dashboard →</a>
        `));
      }
      break;
    }
 
    case 'invoice.payment_failed': {
      const invoice = event.data.object;
      const agence = await getAgence(invoice.customer);
      if (!agence) break;
      await sendEmail(agence.email, '⚠️ Échec de paiement BailScan Pro', emailBase(`
        <h2 style="font-size:18px;color:#ef4444;margin-bottom:12px">Problème avec votre paiement</h2>
        <p style="color:#555;line-height:1.7;margin-bottom:16px">Le prélèvement de votre abonnement BailScan Pro a échoué. Veuillez mettre à jour vos informations de paiement pour maintenir l'accès à votre dashboard.</p>
        <a href="https://bailscan.app/pro.html" style="background:#ef4444;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Mettre à jour mon moyen de paiement →</a>
      `));
      break;
    }
 
    case 'customer.subscription.deleted': {
      const sub = event.data.object;
      const agence = await getAgence(sub.customer);
      if (!agence) break;
      await sb.from('agences').update({ plan: 'expired', stripe_subscription_id: null }).eq('id', agence.id);
      await sendEmail(agence.email, 'Votre abonnement BailScan Pro est terminé', emailBase(`
        <h2 style="font-size:18px;color:#111;margin-bottom:12px">Abonnement résilié</h2>
        <p style="color:#555;line-height:1.7;margin-bottom:16px">Votre abonnement BailScan Pro est maintenant terminé. Vos données sont conservées pendant 30 jours.</p>
        <p style="color:#555;line-height:1.7;margin-bottom:20px">Vous pouvez vous réabonner à tout moment pour retrouver l'accès complet.</p>
        <a href="https://bailscan.app/pro.html" style="background:#3b6fd4;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Se réabonner →</a>
      `));
      break;
    }
 
    case 'customer.subscription.updated': {
      const sub = event.data.object;
      if (sub.cancel_at_period_end) {
        const agence = await getAgence(sub.customer);
        if (!agence) break;
        const cancelDate = new Date(sub.current_period_end * 1000).toLocaleDateString('fr-FR', {day:'2-digit',month:'long',year:'numeric'});
        await sendEmail(agence.email, 'Résiliation confirmée — BailScan Pro', emailBase(`
          <h2 style="font-size:18px;color:#111;margin-bottom:12px">Résiliation confirmée</h2>
          <p style="color:#555;line-height:1.7;margin-bottom:16px">Votre demande de résiliation a bien été prise en compte. Vous conservez l'accès à BailScan Pro jusqu'au <strong>${cancelDate}</strong>.</p>
          <p style="color:#555;line-height:1.7;margin-bottom:20px">Vous pouvez annuler la résiliation à tout moment depuis votre dashboard.</p>
          <a href="https://bailscan.app/pro.html" style="background:#3b6fd4;color:white;padding:12px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px">Mon dashboard →</a>
        `));
      }
      break;
    }
  }
 
  return res.status(200).json({ received: true });
};
 
