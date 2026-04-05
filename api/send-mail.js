// api/send-mail.js — Vercel serverless function
// npm install resend dans ton projet
// Variable Vercel : RESEND_API_KEY=re_xxxxxxxxxx
 
import { Resend } from 'resend';
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });
 
  const { to, nom, message, pdfBase64, pdfName, bailleur, adresse, date } = req.body || {};
 
  if (!to || !pdfBase64) {
    return res.status(400).json({ error: 'Parametres manquants (to, pdfBase64)' });
  }
 
  if (!process.env.RESEND_API_KEY) {
    console.error('RESEND_API_KEY manquante');
    return res.status(500).json({ error: 'Configuration serveur manquante' });
  }
 
  const resend = new Resend(process.env.RESEND_API_KEY);
 
  const html = `<!DOCTYPE html>
<html lang="fr">
<head><meta charset="utf-8"></head>
<body style="margin:0;padding:0;background:#f5f0e8;font-family:Arial,sans-serif">
  <table width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;margin:0 auto;padding:20px">
    <tr><td>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:#0d0d0d;border-radius:10px 10px 0 0;border-bottom:3px solid #c84b2f">
        <tr><td style="padding:16px 24px">
          <span style="font-family:Georgia,serif;font-size:1.3rem;color:white;font-weight:bold">BailScan</span>
          <span style="font-size:.62rem;color:#c84b2f;margin-left:10px;font-weight:700;letter-spacing:.06em">PROPRIETAIRES</span>
        </td></tr>
      </table>
      <table width="100%" cellpadding="0" cellspacing="0" style="background:white;border:1px solid #e0d8cc;border-top:none;border-radius:0 0 10px 10px">
        <tr><td style="padding:28px">
          <p style="margin:0 0 14px;font-size:.9rem;color:#333">Bonjour${nom ? ' ' + nom : ''},</p>
          <p style="margin:0 0 20px;font-size:.88rem;color:#444;line-height:1.6">${message || 'Veuillez trouver ci-joint votre bail de location genere via BailScan.'}</p>
          <table width="100%" cellpadding="0" cellspacing="0" style="background:#f5f0e8;border-radius:8px;border:1px solid #e0d8cc;margin-bottom:20px">
            <tr><td style="padding:14px 16px">
              <p style="margin:0 0 8px;font-size:.65rem;font-weight:700;color:#c84b2f;text-transform:uppercase;letter-spacing:.1em">Recapitulatif</p>
              ${bailleur ? `<p style="margin:0 0 5px;font-size:.82rem;color:#333"><strong>Bailleur :</strong> ${bailleur}</p>` : ''}
              ${adresse ? `<p style="margin:0 0 5px;font-size:.82rem;color:#333"><strong>Bien loue :</strong> ${adresse}</p>` : ''}
              <p style="margin:0;font-size:.82rem;color:#333"><strong>Date :</strong> ${date || new Date().toLocaleDateString('fr-FR')}</p>
            </td></tr>
          </table>
          <p style="margin:0;font-size:.8rem;color:#888;line-height:1.5">Le bail complet est joint en PDF. Chaque partie signe avec la mention "Lu et approuve".</p>
        </td></tr>
      </table>
      <p style="text-align:center;margin-top:14px;font-size:.7rem;color:#aaa">BailScan · bailscan.app · Loi 89-462 · ALUR · ELAN 2018</p>
    </td></tr>
  </table>
</body>
</html>`;
 
  try {
    const { data, error } = await resend.emails.send({
      from: 'BailScan <noreply@bailscan.app>',
      to: [to],
      subject: `Votre bail de location BailScan — ${date || new Date().toLocaleDateString('fr-FR')}`,
      html,
      attachments: [{ filename: pdfName || 'BailScan-Bail.pdf', content: pdfBase64 }],
    });
 
    if (error) {
      console.error('Resend error:', error);
      return res.status(500).json({ error: error.message });
    }
 
    return res.status(200).json({ ok: true, id: data?.id });
  } catch (err) {
    console.error('Handler error:', err);
    return res.status(500).json({ error: err.message || 'Erreur interne' });
  }
}
