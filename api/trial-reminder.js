// api/trial-reminder.js
// Cron Vercel — appeler chaque jour à 9h
// vercel.json : { "crons": [{ "path": "/api/trial-reminder", "schedule": "0 9 * * *" }] }
// Variables Vercel : SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY
 
module.exports = async function handler(req, res) {
  // Sécurité : autoriser uniquement les appels cron Vercel ou avec le bon token
  const auth = req.headers['authorization'];
  if (req.method !== 'GET' && req.method !== 'POST') return res.status(405).end();
  if (auth !== 'Bearer ' + process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
 
  const SUPABASE_URL = process.env.SUPABASE_URL;
  const SUPABASE_KEY = process.env.SUPABASE_SERVICE_KEY; // clé service (pas anon)
  const RESEND_KEY   = process.env.RESEND_API_KEY;
 
  if (!SUPABASE_URL || !SUPABASE_KEY || !RESEND_KEY) {
    return res.status(500).json({ error: 'Variables manquantes' });
  }
 
  try {
    // Récupérer toutes les agences en trial actif
    const sbRes = await fetch(`${SUPABASE_URL}/rest/v1/agences?plan=eq.trial&select=id,nom,email,trial_end`, {
      headers: {
        'apikey': SUPABASE_KEY,
        'Authorization': 'Bearer ' + SUPABASE_KEY,
      }
    });
    const agences = await sbRes.json();
 
    const now = new Date();
    const sent = [];
 
    for (const ag of agences) {
      if (!ag.email || !ag.trial_end) continue;
      const trialEnd = new Date(ag.trial_end);
      const daysLeft = Math.ceil((trialEnd - now) / 864e5);
 
      // Envoyer seulement à J (3j restants), J1 (2j), J2 (1j), J3 (0j = expiré)
      if (![3, 2, 1, 0].includes(daysLeft)) continue;
 
      const subject = daysLeft === 0
        ? 'Votre essai BailScan Pro a expiré'
        : `Il vous reste ${daysLeft} jour${daysLeft > 1 ? 's' : ''} d'essai BailScan Pro`;
 
      const html = buildReminderEmail(ag.nom || 'votre agence', daysLeft);
 
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${RESEND_KEY}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          from: 'BailScan Pro <noreply@bailscan.app>',
          to: [ag.email],
          subject,
          html,
        })
      });
 
      sent.push({ email: ag.email, daysLeft });
 
      // Si expiré (daysLeft <= 0), bloquer le plan
      if (daysLeft <= 0) {
        await fetch(`${SUPABASE_URL}/rest/v1/agences?id=eq.${ag.id}`, {
          method: 'PATCH',
          headers: {
            'apikey': SUPABASE_KEY,
            'Authorization': 'Bearer ' + SUPABASE_KEY,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({ plan: 'expired' })
        });
      }
    }
 
    return res.status(200).json({ ok: true, processed: agences.length, sent });
  } catch (err) {
    console.error('trial-reminder error:', err);
    return res.status(500).json({ error: err.message });
  }
};
 
function buildReminderEmail(agence, daysLeft) {
  const upgradeUrl = 'https://bailscan.app/pro.html';
  const starterUrl = upgradeUrl;
 
  if (daysLeft === 0) {
    return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f0e8;font-family:Arial,sans-serif">
<table width="100%" style="max-width:560px;margin:0 auto">
  <tr><td style="background:#111827;border-radius:10px 10px 0 0;border-bottom:3px solid #c84b2f;padding:16px 24px">
    <span style="font-family:Georgia,serif;font-size:1.3rem;color:white;font-weight:bold">BailScan</span>
    <span style="font-size:.6rem;color:#3b6fd4;margin-left:10px;font-weight:700">PRO</span>
  </td></tr>
  <tr><td style="background:white;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 10px 10px;padding:28px">
    <p style="font-size:1rem;font-weight:700;color:#c84b2f;margin:0 0 12px">Votre essai gratuit a expiré</p>
    <p style="color:#444;margin:0 0 16px;line-height:1.6">L'accès au dashboard BailScan Pro de <strong>${agence}</strong> est temporairement suspendu.</p>
    <p style="color:#444;margin:0 0 24px;line-height:1.6">Pour continuer à analyser vos baux et gérer vos dossiers, choisissez votre formule :</p>
    <table width="100%" style="margin-bottom:20px;border-collapse:separate;border-spacing:0 8px">
      <tr>
        <td style="padding:14px 16px;background:#f8f7f4;border-radius:8px;border:1px solid #e0d8cc">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;font-size:.85rem;color:#111">Mensuel</div>
              <div style="font-size:.78rem;color:#888;margin-top:2px">Sans engagement</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:#111827">150€<span style="font-size:.75rem;font-weight:400;color:#888">/mois</span></div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:#f8f7f4;border-radius:8px;border:1px solid #e0d8cc">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;font-size:.85rem;color:#111">6 mois</div>
              <div style="font-size:.78rem;color:#2d6a4f;margin-top:2px">Économisez 90€/an</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:#111827">135€<span style="font-size:.75rem;font-weight:400;color:#888">/mois</span></div>
          </div>
        </td>
      </tr>
      <tr>
        <td style="padding:14px 16px;background:#111827;border-radius:8px;border:2px solid #3b6fd4">
          <div style="display:flex;justify-content:space-between;align-items:center">
            <div>
              <div style="font-weight:700;font-size:.85rem;color:white">Annuel <span style="background:#3b6fd4;color:white;font-size:.6rem;padding:2px 7px;border-radius:10px;margin-left:6px;vertical-align:middle">MEILLEUR PRIX</span></div>
              <div style="font-size:.78rem;color:rgba(255,255,255,.5);margin-top:2px">Économisez 360€/an</div>
            </div>
            <div style="font-size:1.4rem;font-weight:700;color:white">120€<span style="font-size:.75rem;font-weight:400;color:rgba(255,255,255,.5)">/mois</span></div>
          </div>
        </td>
      </tr>
    </table>
    <a href="${upgradeUrl}" style="display:block;text-align:center;background:#3b6fd4;color:white;padding:13px;border-radius:10px;font-weight:700;text-decoration:none;font-size:.95rem">Choisir mon abonnement →</a>
    <p style="font-size:.75rem;color:#aaa;text-align:center;margin-top:14px">Sans engagement · Résiliation à tout moment</p>
  </td></tr>
</table>
</body></html>`;
  }
 
  const urgencyColor = daysLeft === 1 ? '#c84b2f' : daysLeft === 2 ? '#d97706' : '#3b6fd4';
  const urgencyText = daysLeft === 1 ? 'Dernier jour !' : daysLeft === 2 ? 'Plus que 2 jours' : 'Encore 3 jours';
 
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f0e8;font-family:Arial,sans-serif">
<table width="100%" style="max-width:560px;margin:0 auto">
  <tr><td style="background:#111827;border-radius:10px 10px 0 0;border-bottom:3px solid #3b6fd4;padding:16px 24px">
    <span style="font-family:Georgia,serif;font-size:1.3rem;color:white;font-weight:bold">BailScan</span>
    <span style="font-size:.6rem;color:#3b6fd4;margin-left:10px;font-weight:700">PRO</span>
  </td></tr>
  <tr><td style="background:white;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 10px 10px;padding:28px">
    <div style="display:inline-block;background:${urgencyColor};color:white;padding:4px 12px;border-radius:20px;font-size:.75rem;font-weight:700;margin-bottom:14px">${urgencyText}</div>
    <p style="font-size:1rem;font-weight:700;color:#111;margin:0 0 12px">Votre essai se termine dans ${daysLeft} jour${daysLeft > 1 ? 's' : ''}</p>
    <p style="color:#444;margin:0 0 20px;line-height:1.6">Bonjour, votre essai gratuit BailScan Pro pour <strong>${agence}</strong> expire bientôt. Toutes vos données sont conservées.</p>
    <a href="${upgradeUrl}" style="display:block;text-align:center;background:#3b6fd4;color:white;padding:13px;border-radius:10px;font-weight:700;text-decoration:none;font-size:.95rem;margin-bottom:12px">S'abonner maintenant — à partir de 120€/mois →</a>
    <p style="font-size:.75rem;color:#aaa;text-align:center">Sans engagement · Résiliation à tout moment · Support dédié</p>
  </td></tr>
</table>
</body></html>`;
}
 
