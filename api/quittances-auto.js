// api/quittances-auto.js
// Cron Vercel — le 1er de chaque mois à 8h
// vercel.json : { "crons": [{ "path": "/api/quittances-auto", "schedule": "0 8 1 * *" }] }
// Variables : SUPABASE_URL, SUPABASE_SERVICE_KEY, RESEND_API_KEY, CRON_SECRET
 
module.exports = async function handler(req, res) {
  const auth = req.headers['authorization'];
  if (auth !== 'Bearer ' + process.env.CRON_SECRET && process.env.CRON_SECRET) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
 
  const SB_URL  = process.env.SUPABASE_URL;
  const SB_KEY  = process.env.SUPABASE_SERVICE_KEY;
  const RESEND  = process.env.RESEND_API_KEY;
 
  if (!SB_URL || !SB_KEY || !RESEND) {
    return res.status(500).json({ error: 'Variables manquantes' });
  }
 
  const now     = new Date();
  const moisNum = now.getMonth() + 1;
  const annee   = now.getFullYear();
  const moisFR  = now.toLocaleDateString('fr-FR', { month: 'long' });
  const periode = moisFR + ' ' + annee;
 
  try {
    // Récupérer toutes les agences actives (plan pro ou trial)
    const rAg = await fetch(
      SB_URL + '/rest/v1/agences?select=id,nom,email,plan&plan=in.(pro,trial)',
      { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
    );
    const agences = await rAg.json();
 
    let totalSent = 0;
    const errors = [];
 
    for (const agence of (agences || [])) {
      // Récupérer les locataires actifs de cette agence
      const rLoc = await fetch(
        SB_URL + '/rest/v1/locataires?select=*&agence_id=eq.' + agence.id + '&statut=eq.actif',
        { headers: { apikey: SB_KEY, Authorization: 'Bearer ' + SB_KEY } }
      );
      const locataires = await rLoc.json();
 
      for (const loc of (locataires || [])) {
        if (!loc.email || !loc.loyer) continue;
 
        const loyer   = parseFloat(loc.loyer) || 0;
        const charges = parseFloat(loc.charges) || 0;
        const complement = parseFloat(loc.complement) || 0;
        const total   = loyer + charges + complement;
        const nom     = [loc.prenom, loc.nom].filter(Boolean).join(' ') || 'Locataire';
        const adresse = loc.adresse || loc.bien_adresse || '';
        const agenceNom = agence.nom || 'Votre agence';
 
        const html = `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f0e8;font-family:'DM Sans',Arial,sans-serif">
<table width="100%" style="max-width:560px;margin:0 auto">
  <tr><td style="background:#111827;border-radius:10px 10px 0 0;padding:20px 28px">
    <div style="font-family:Georgia,serif;font-size:1.2rem;color:white;font-weight:bold">${agenceNom}</div>
    <div style="font-size:.75rem;color:rgba(255,255,255,.4);margin-top:4px">Quittance de loyer — ${periode}</div>
  </td></tr>
  <tr><td style="background:white;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 10px 10px;padding:28px">
    <p style="font-size:.95rem;color:#333;margin:0 0 16px">Bonjour ${nom},</p>
    <p style="font-size:.85rem;color:#555;line-height:1.6;margin:0 0 20px">
      Veuillez trouver votre quittance de loyer pour <strong>${periode}</strong>
      ${adresse ? 'pour le logement situé au <strong>' + adresse + '</strong>' : ''}.
    </p>
    <table style="width:100%;border-collapse:collapse;background:#f8f7f4;border-radius:8px;overflow:hidden;margin-bottom:20px">
      <tr style="border-bottom:1px solid #e0d8cc">
        <td style="padding:12px 16px;font-size:.85rem;color:#555">Loyer hors charges</td>
        <td style="padding:12px 16px;text-align:right;font-weight:600;font-size:.85rem">${loyer.toFixed(2)} €</td>
      </tr>
      ${complement ? '<tr style="border-bottom:1px solid #e0d8cc"><td style="padding:12px 16px;font-size:.85rem;color:#555">Complément de loyer</td><td style="padding:12px 16px;text-align:right;font-weight:600;font-size:.85rem">' + complement.toFixed(2) + ' €</td></tr>' : ''}
      ${charges ? '<tr style="border-bottom:1px solid #e0d8cc"><td style="padding:12px 16px;font-size:.85rem;color:#555">Charges</td><td style="padding:12px 16px;text-align:right;font-weight:600;font-size:.85rem">' + charges.toFixed(2) + ' €</td></tr>' : ''}
      <tr>
        <td style="padding:14px 16px;font-size:.95rem;font-weight:700;color:#111">Total</td>
        <td style="padding:14px 16px;text-align:right;font-size:.95rem;font-weight:700;color:#3b6fd4">${total.toFixed(2)} €</td>
      </tr>
    </table>
    <p style="font-size:.78rem;color:#aaa;text-align:center;margin:0">
      Ce document vaut quittance pour la période de ${periode}. Conservez-le précieusement.
    </p>
  </td></tr>
  <tr><td style="padding:14px 0;text-align:center;font-size:.72rem;color:#aaa">
    Généré automatiquement par BailScan Pro · <a href="https://bailscan.app" style="color:#aaa">bailscan.app</a>
  </td></tr>
</table>
</body></html>`;
 
        try {
          await fetch('https://api.resend.com/emails', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + RESEND },
            body: JSON.stringify({
              from: agenceNom + ' <quittances@bailscan.app>',
              to: [loc.email],
              subject: 'Quittance de loyer — ' + periode,
              html
            })
          });
 
          // Enregistrer la quittance dans Supabase pour l'historique
          await fetch(SB_URL + '/rest/v1/quittances', {
            method: 'POST',
            headers: {
              apikey: SB_KEY,
              Authorization: 'Bearer ' + SB_KEY,
              'Content-Type': 'application/json',
              Prefer: 'return=minimal'
            },
            body: JSON.stringify({
              agence_id: agence.id,
              locataire_id: loc.id,
              mois: moisNum,
              annee: annee,
              loyer: loyer,
              charges: charges,
              complement: complement,
              total: total,
              envoye_le: new Date().toISOString(),
              statut: 'envoye'
            })
          });
 
          totalSent++;
        } catch (mailErr) {
          errors.push({ locataire: nom, error: mailErr.message });
        }
      }
    }
 
    return res.status(200).json({ ok: true, sent: totalSent, periode, errors });
  } catch (err) {
    console.error('quittances-auto error:', err);
    return res.status(500).json({ error: err.message });
  }
};
