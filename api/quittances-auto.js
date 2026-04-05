// api/quittances-auto.js
// Cron le 1er de chaque mois à 8h : envoie les quittances à tous les locataires actifs
// Variables Vercel : RESEND_API_KEY, SUPABASE_URL, SUPABASE_SERVICE_KEY, CRON_SECRET
 
module.exports = async function handler(req, res) {
  if (req.headers['authorization'] !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
 
  const now = new Date();
  const mois = now.toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' });
  const moisNom = now.toLocaleDateString('fr-FR', { month: 'long' });
  const annee = now.getFullYear();
 
  try {
    // Récupérer locataires actifs avec email depuis Supabase
    const r = await fetch(
      `${process.env.SUPABASE_URL}/rest/v1/clients?select=*&statut=eq.actif`,
      { headers: { 'apikey': process.env.SUPABASE_SERVICE_KEY, 'Authorization': `Bearer ${process.env.SUPABASE_SERVICE_KEY}` }}
    );
    const locataires = await r.json();
 
    let sent = 0;
    for (const loc of (locataires || [])) {
      if (!loc.email || !loc.loyer) continue;
 
      const total = (parseFloat(loc.loyer)||0) + (parseFloat(loc.charges)||0);
      const nom = [loc.prenom, loc.nom].filter(Boolean).join(' ');
      const adresse = loc.adresse || '';
 
      const html = `
        <div style="font-family:'DM Sans',sans-serif;max-width:580px;margin:0 auto;background:white">
          <div style="background:#111827;padding:24px 28px">
            <div style="font-family:Georgia,serif;font-size:20px;color:white">BailScan Pro</div>
            <div style="font-size:12px;color:rgba(255,255,255,.45);margin-top:4px">Quittance de loyer — ${moisNom} ${annee}</div>
          </div>
          <div style="padding:28px">
            <p style="font-size:15px;color:#333;margin-bottom:20px">Bonjour ${nom},</p>
            <p style="font-size:14px;color:#555;margin-bottom:20px">
              Veuillez trouver votre quittance de loyer pour le mois de <strong>${moisNom} ${annee}</strong>
              pour le logement situé au <strong>${adresse}</strong>.
            </p>
            <div style="background:#f8f7f4;border-radius:10px;padding:20px;margin-bottom:20px">
              <table style="width:100%;border-collapse:collapse">
                <tr><td style="padding:8px 0;font-size:14px;color:#555;border-bottom:1px solid #e0d8cc">Loyer hors charges</td><td style="text-align:right;font-size:14px;font-weight:600;border-bottom:1px solid #e0d8cc">${loc.loyer}€</td></tr>
                ${loc.charges ? `<tr><td style="padding:8px 0;font-size:14px;color:#555;border-bottom:1px solid #e0d8cc">Charges</td><td style="text-align:right;font-size:14px;font-weight:600;border-bottom:1px solid #e0d8cc">${loc.charges}€</td></tr>` : ''}
                <tr><td style="padding:10px 0 0;font-size:15px;font-weight:700;color:#111">Total</td><td style="text-align:right;font-size:15px;font-weight:700;padding-top:10px;color:#3b6fd4">${total}€</td></tr>
              </table>
            </div>
            <p style="font-size:13px;color:#888;text-align:center">
              Ce document vaut quittance de loyer pour la période de ${moisNom} ${annee}.<br>
              Conservez-le précieusement.
            </p>
          </div>
          <div style="padding:16px 28px;border-top:1px solid #e0d8cc;font-size:12px;color:#aaa;text-align:center">
            BailScan Pro · <a href="https://bailscan.app" style="color:#aaa">bailscan.app</a>
          </div>
        </div>`;
 
      await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${process.env.RESEND_API_KEY}` },
        body: JSON.stringify({
          from: 'BailScan Pro <quittances@bailscan.app>',
          to: loc.email,
          subject: `Quittance de loyer — ${moisNom} ${annee}`,
          html
        })
      });
      sent++;
    }
 
    return res.status(200).json({ sent, mois });
  } catch (err) {
    console.error('quittances-auto error:', err);
    return res.status(500).json({ error: err.message });
  }
};
