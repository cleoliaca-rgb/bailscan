/**
 * BailScan Pro — /api/send-welcome.js
 * Email de bienvenue immédiat + relances J+1, J+2, J+3
 */
 
const FROM = process.env.RESEND_FROM_EMAIL || 'BailScan Pro <bonjour@bailscan.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app';
 
async function sendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Resend error ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
 
function headerHtml(preview = '') {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
${preview ? `<div style="display:none;max-height:0;overflow:hidden">${preview}</div>` : ''}
<style>
  body{font-family:Arial,sans-serif;background:#f8fafc;margin:0;padding:0;color:#0f172a}
  .wrap{max-width:560px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:#0f172a;padding:24px 32px}
  .logo{font-size:22px;font-weight:700;color:white;font-style:italic}
  .logo span{color:#f97316}
  .badge{font-size:10px;font-weight:700;background:#3b6fd4;color:white;padding:2px 8px;border-radius:4px;margin-left:6px;vertical-align:middle;font-style:normal}
  .body{padding:32px}
  h2{font-size:20px;color:#0f172a;margin:0 0 12px}
  p{font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px}
  .btn{display:inline-block;background:#3b6fd4;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}
  .feature{display:flex;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:8px}
  .fi{font-size:1.1rem;width:24px;flex-shrink:0}
  .ft{font-size:13px;color:#334155}
  .footer{background:#f1f5f9;padding:20px 32px;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0}
</style></head><body><div class="wrap">
  <div class="hdr"><div class="logo">Bail<span>Scan</span><span class="badge">PRO</span></div></div>`;
}
 
const footerHtml = `</div><div class="footer">
  BailScan Pro · Pour les agences immobilières françaises<br>
  <a href="${APP_URL}" style="color:#3b6fd4;text-decoration:none">Accéder à mon dashboard →</a>
</div></div></body></html>`;
 
function welcomeHtml({ prenom, trialEnd }) {
  return headerHtml('Votre essai gratuit BailScan Pro est activé') + `
  <div class="body">
    <h2>Bienvenue ${prenom} !</h2>
    <p>Votre essai gratuit de <strong>3 jours</strong> est actif jusqu'au <strong>${trialEnd}</strong>. Aucune carte bancaire requise.</p>
    <div class="feature"><div class="fi">◎</div><div class="ft"><strong>Analyse de baux IA</strong> — Score de conformité, clauses illégales, corrections clause par clause</div></div>
    <div class="feature"><div class="fi">□</div><div class="ft"><strong>Gestion des biens & mandats</strong> — Portefeuille centralisé, fiches complètes</div></div>
    <div class="feature"><div class="fi">◇</div><div class="ft"><strong>Dossiers locataires</strong> — Scoring IA, analyse de solvabilité automatique</div></div>
    <div class="feature"><div class="fi">▭</div><div class="ft"><strong>Génération de baux & quittances</strong> — Conformes loi 1989 / ALUR / ELAN</div></div>
    <p style="margin-top:20px">Pour démarrer, configurez d'abord les informations de votre agence dans <strong>Paramètres</strong>.</p>
    <a href="${APP_URL}" class="btn">Accéder à mon dashboard →</a>
    <p style="margin-top:20px;font-size:13px;color:#94a3b8">Questions ? Répondez directement à cet email.</p>
  </div>` + footerHtml;
}
 
function reminderJ1Html({ prenom, trialEnd }) {
  return headerHtml("Il vous reste 2 jours d'essai") + `
  <div class="body">
    <h2>Avez-vous testé l'analyse de bail, ${prenom} ?</h2>
    <p>Il vous reste <strong>2 jours</strong> d'essai (jusqu'au <strong>${trialEnd}</strong>).</p>
    <p>En moins de 30 secondes, l'IA détecte les clauses illégales, calcule le score de conformité et propose les corrections.</p>
    <a href="${APP_URL}" class="btn">Analyser mon premier bail →</a>
  </div>` + footerHtml;
}
 
function reminderJ2Html({ prenom, trialEnd }) {
  return headerHtml("Plus qu'un jour d'essai") + `
  <div class="body">
    <h2>Plus qu'un jour d'essai, ${prenom}</h2>
    <p>Votre essai expire <strong>demain</strong> (${trialEnd}).</p>
    <a href="${APP_URL}" class="btn">Créer mon premier bien →</a>
  </div>` + footerHtml;
}
 
function reminderJ3Html({ prenom }) {
  return headerHtml("Votre essai expire aujourd'hui") + `
  <div class="body">
    <h2>Votre essai expire aujourd'hui, ${prenom}</h2>
    <p>Pour continuer sans perdre vos données, choisissez votre formule.</p>
    <a href="${APP_URL}#tarifs" class="btn">S'abonner maintenant →</a>
  </div>` + footerHtml;
}
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
 
  const { action, email, prenom, nom, agence } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email requis' });
 
  const prenomFmt = prenom || email.split('@')[0];
  const trialEnd = new Date(Date.now() + 3 * 24 * 3600 * 1000)
    .toLocaleDateString('fr-FR', { weekday: 'long', day: 'numeric', month: 'long' });
 
  console.log('[send-welcome] action:', action, 'email:', email);
 
  try {
    switch (action) {
      case 'welcome': {
        const result = await sendEmail({
          to: email,
          subject: 'Bienvenue sur BailScan Pro — votre essai gratuit est activé',
          html: welcomeHtml({ prenom: prenomFmt, trialEnd }),
        });
        console.log('[send-welcome] welcome sent OK:', result.id);
 
        // Essayer de programmer les relances en Supabase (optionnel — ne bloque pas si la table n'existe pas)
        try {
          const { createClient } = require('@supabase/supabase-js');
          const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          const trialEndDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
          await sb.from('email_sequences').insert([
            { email, type: 'trial_j1', send_at: new Date(Date.now() + 1*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
            { email, type: 'trial_j2', send_at: new Date(Date.now() + 2*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
            { email, type: 'trial_j3', send_at: new Date(Date.now() + 3*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
          ]);
        } catch(e) { console.warn('[send-welcome] Supabase sequences (non bloquant):', e.message); }
 
        return res.status(200).json({ ok: true, sent: 'welcome' });
      }
      case 'trial_j1':
        await sendEmail({ to: email, subject: "[BailScan Pro] Il vous reste 2 jours d'essai", html: reminderJ1Html({ prenom: prenomFmt, trialEnd }) });
        return res.status(200).json({ ok: true, sent: 'trial_j1' });
      case 'trial_j2':
        await sendEmail({ to: email, subject: "[BailScan Pro] Plus qu'un jour d'essai gratuit", html: reminderJ2Html({ prenom: prenomFmt, trialEnd }) });
        return res.status(200).json({ ok: true, sent: 'trial_j2' });
      case 'trial_j3':
        await sendEmail({ to: email, subject: "[BailScan Pro] Votre essai expire aujourd'hui", html: reminderJ3Html({ prenom: prenomFmt }) });
        return res.status(200).json({ ok: true, sent: 'trial_j3' });
      default:
        return res.status(400).json({ error: `action inconnue: ${action}` });
    }
  } catch (err) {
    console.error('[send-welcome] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
};
 
