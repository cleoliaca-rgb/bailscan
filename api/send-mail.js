// api/send-mail.js — Vercel serverless function
// Dépendance : npm install resend
// Variable d'env Vercel : RESEND_API_KEY
 
export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
 
  const { to, nom, message, pdfBase64, pdfName, bailleur, adresse, date } = req.body;
 
  if (!to || !pdfBase64) {
    return res.status(400).json({ error: 'Paramètres manquants' });
  }
 
  if (!process.env.RESEND_API_KEY) {
    return res.status(500).json({ error: 'RESEND_API_KEY non configurée' });
  }
 
  try {
    const { Resend } = await import('resend');
    const resend = new Resend(process.env.RESEND_API_KEY);
 
    const html = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;padding:20px;color:#333">
  <div style="background:#0d0d0d;padding:16px 24px;border-radius:8px 8px 0 0;border-bottom:3px solid #c84b2f">
    <span style="font-family:Georgia,serif;font-size:1.4rem;color:white">BailScan</span>
    <span style="font-size:.7rem;color:#c84b2f;margin-left:8px;font-weight:700;letter-spacing:.05em">PROPRIÉTAIRES</span>
  </div>
  <div style="background:#f5f0e8;padding:24px;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 8px 8px">
    <p style="margin:0 0 16px">Bonjour${nom ? ' ' + nom : ''},</p>
    <p style="margin:0 0 16px">${message || 'Veuillez trouver ci-joint le bail de location généré via BailScan.'}</p>
    <div style="background:white;border:1px solid #e0d8cc;border-radius:8px;padding:16px;margin:20px 0">
      <div style="font-size:.75rem;font-weight:700;color:#c84b2f;text-transform:uppercase;letter-spacing:.08em;margin-bottom:10px">Récapitulatif</div>
      ${bailleur ? `<div style="font-size:.85rem;margin-bottom:6px"><strong>Bailleur :</strong> ${bailleur}</div>` : ''}
      ${adresse ? `<div style="font-size:.85rem;margin-bottom:6px"><strong>Bien loué :</strong> ${adresse}</div>` : ''}
      <div style="font-size:.85rem"><strong>Date de génération :</strong> ${date}</div>
    </div>
    <p style="font-size:.82rem;color:#888;margin:16px 0 0">Le bail complet est joint en PDF à cet email.<br>Chaque partie doit signer avec la mention <em>"Lu et approuvé"</em>.</p>
  </div>
  <p style="font-size:.72rem;color:#aaa;text-align:center;margin-top:16px">
    Document généré par BailScan · bailscan.app<br>
    Conforme loi n°89-462 du 6 juillet 1989 · ALUR · ELAN 2018
  </p>
</body>
</html>`;
 
    const { data, error } = await resend.emails.send({
      from: 'BailScan <noreply@bailscan.app>',
      to: [to],
      subject: `Votre bail de location — ${date}`,
      html,
      attachments: [
        {
          filename: pdfName || 'bail-location.pdf',
          content: pdfBase64,
        },
      ],
    });
 
    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message });
    }
 
    return res.status(200).json({ ok: true, id: data?.id });
 
  } catch (err) {
    console.error('Send mail error:', err);
    return res.status(500).json({ error: err.message });
  }
}
