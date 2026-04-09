// api/send-mail.js
// Aucune dépendance npm — utilise fetch natif (Node 18+ sur Vercel)
// Variable Vercel : RESEND_API_KEY=re_xxxxxxxxxx
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  try {
    const { to, nom, message, pdfBase64, pdfName, bailleur, adresse, date, type } = req.body || {};
 
    if (!to || !pdfBase64) {
      return res.status(400).json({ error: 'Parametres manquants : to et pdfBase64 requis' });
    }
 
    const apiKey = process.env.RESEND_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ error: 'RESEND_API_KEY manquante dans les variables Vercel' });
    }
 
    const dateStr = date || new Date().toLocaleDateString('fr-FR');
 
    const html = `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"></head>
<body style="margin:0;padding:20px;background:#f5f0e8;font-family:Arial,sans-serif">
<table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto">
  <tr><td style="background:#0d0d0d;border-radius:10px 10px 0 0;border-bottom:3px solid #c84b2f;padding:16px 24px">
    <span style="font-family:Georgia,serif;font-size:1.3rem;color:white;font-weight:bold">BailScan</span>
  </td></tr>
  <tr><td style="background:white;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 10px 10px;padding:28px">
    <p style="margin:0 0 14px;color:#333">Bonjour${nom ? ' ' + nom : ''},</p>
    <p style="margin:0 0 20px;color:#444;line-height:1.6">${message || 'Veuillez trouver ci-joint votre bail de location généré via BailScan.'}</p>
    <table width="100%" cellpadding="10" style="background:#f5f0e8;border-radius:8px;border:1px solid #e0d8cc;margin-bottom:20px"><tr><td>
      <p style="margin:0 0 6px;font-size:.7rem;font-weight:700;color:#c84b2f;text-transform:uppercase">Récapitulatif</p>
      ${bailleur ? `<p style="margin:0 0 4px;font-size:.85rem;color:#333"><b>Bailleur :</b> ${bailleur}</p>` : ''}
      ${adresse ? `<p style="margin:0 0 4px;font-size:.85rem;color:#333"><b>Bien loué :</b> ${adresse}</p>` : ''}
      <p style="margin:0;font-size:.85rem;color:#333"><b>Généré le :</b> ${dateStr}</p>
    </td></tr></table>
    <p style="margin:0;font-size:.82rem;color:#888">${type === 'rapport' ? 'Ce rapport est fourni à titre informatif. Pour les litiges complexes, consultez un juriste ou l'ADIL de votre département.' : 'Le bail est joint en PDF. Chaque partie signe avec la mention <em>&quot;Lu et approuvé&quot;</em>.'}</p>
  </td></tr>
  <tr><td style="text-align:center;padding-top:12px">
    <p style="font-size:.7rem;color:#aaa;margin:0">BailScan · bailscan.app · Loi 89-462 · ALUR · ELAN 2018</p>
  </td></tr>
</table>
</body></html>`;
 
    // Appel direct à l'API Resend via fetch (pas de dépendance npm)
    const response = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from: 'BailScan <noreply@bailscan.app>',
        to: [to],
        subject: type === 'rapport' ? `Votre rapport BailScan — ${dateStr}` : `Votre bail de location BailScan — ${dateStr}`,
        html: html,
        attachments: [{
          filename: pdfName || 'BailScan-Bail.pdf',
          content: pdfBase64,
        }],
      }),
    });
 
    const data = await response.json();
 
    if (!response.ok) {
      console.error('Resend API error:', JSON.stringify(data));
      return res.status(500).json({ error: data.message || data.name || 'Erreur Resend API' });
    }
 
    console.log('Email sent OK, id:', data.id, 'to:', to);
    return res.status(200).json({ ok: true, id: data.id });
 
  } catch (err) {
    console.error('send-mail error:', err.message, err.stack);
    return res.status(500).json({ error: err.message || 'Erreur serveur interne' });
  }
};
 
