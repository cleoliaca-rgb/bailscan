/**
 * BailScan Pro — /api/send-welcome.js
 * Envoi de l'email de bienvenue immédiat au signup
 * + programmation des relances J+1, J+2, J+3
 *
 * Appelé depuis handleSignup() dans pro.html juste après signUp réussi
 *
 * Variables Vercel :
 *   RESEND_API_KEY
 *   RESEND_FROM_EMAIL   → ex: BailScan Pro <bonjour@bailscan.app>
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 */
 
import { createClient } from '@supabase/supabase-js';
 
const FROM = process.env.RESEND_FROM_EMAIL || 'BailScan Pro <bonjour@bailscan.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app';
 
async function sendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  if (!r.ok) throw new Error(`Resend error: ${await r.text()}`);
  return r.json();
}
 
// ── Templates ──────────────────────────────────────────────────────────
 
function headerHtml(preview = '') {
  return `<!DOCTYPE html><html><head><meta charset="utf-8">
<meta name="x-apple-data-detectors" content="true">
${preview ? `<div style="display:none;max-height:0;overflow:hidden">${preview}</div>` : ''}
<style>
  body{font-family:'DM Sans',Arial,sans-serif;background:#f8fafc;margin:0;padding:0;color:#0f172a}
  .wrap{max-width:580px;margin:32px auto;background:white;border-radius:16px;overflow:hidden;box-shadow:0 4px 24px rgba(0,0,0,.08)}
  .hdr{background:#0f172a;padding:24px 32px}
  .logo{font-size:22px;font-weight:700;color:white}
  .logo em{color:#f97316;font-style:italic}
  .badge{font-size:10px;font-weight:700;background:#3b6fd4;color:white;padding:2px 8px;border-radius:4px;margin-left:6px;vertical-align:middle}
  .body{padding:32px}
  h2{font-size:20px;color:#0f172a;margin:0 0 12px}
  p{font-size:14px;color:#475569;line-height:1.7;margin:0 0 16px}
  .btn{display:inline-block;background:#3b6fd4;color:white;padding:13px 28px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}
  .feature{display:flex;gap:12px;padding:12px;background:#f8fafc;border-radius:8px;margin-bottom:8px}
  .feature-icon{font-size:1.2rem;width:24px;flex-shrink:0}
  .feature-text{font-size:13px;color:#334155}
  .footer{background:#f1f5f9;padding:20px 32px;font-size:12px;color:#94a3b8;text-align:center;border-top:1px solid #e2e8f0}
</style></head><body><div class="wrap">
  <div class="hdr"><div class="logo">Bail<em>Scan</em><span class="badge">PRO</span></div></div>`;
}
 
const footerHtml = `</div><div class="footer">
  BailScan Pro · Pour les agences immobilières françaises<br>
  <a href="${APP_URL}" style="color:#3b6fd4;text-decoration:none">Accéder à mon dashboard →</a>
</div></div></body></html>`;
 
function welcomeHtml({ prenom, email, trialEnd }) {
  return headerHtml('Votre essai gratuit BailScan Pro est activé') + `
  <div class="body">
    <h2>Bienvenue ${prenom} ! ✓</h2>
    <p>Votre essai gratuit de <strong>3 jours</strong> est actif jusqu'au <strong>${trialEnd}</strong>. Aucune carte bancaire requise.</p>
 
    <div class="feature"><div class="feature-icon">◎</div><div class="feature-text"><strong>Analyse de baux IA</strong> — Score de conformité, clauses illégales, corrections clause par clause</div></div>
    <div class="feature"><div class="feature-icon">□</div><div class="feature-text"><strong>Gestion des biens & mandats</strong> — Portefeuille centralisé, fiches complètes</div></div>
    <div class="feature"><div class="feature-icon">◇</div><div class="feature-text"><strong>Dossiers locataires</strong> — Scoring IA, analyse de solvabilité automatique</div></div>
    <div class="feature"><div class="feature-icon">▭</div><div class="feature-text"><strong>Génération de baux & quittances</strong> — Conformes loi 1989 / ALUR / ELAN</div></div>
 
    <p style="margin-top:20px">Pour démarrer, configurez d'abord les informations de votre agence dans Paramètres — elles apparaîtront sur tous vos documents PDF.</p>
    <a href="${APP_URL}" class="btn">Accéder à mon dashboard →</a>
    <p style="margin-top:20px;font-size:13px;color:#94a3b8">Questions ? Répondez directement à cet email, nous vous répondons sous 24h.</p>
  </div>` + footerHtml;
}
 
function reminderJ1Html({ prenom, trialEnd }) {
  return headerHtml('Il vous reste 2 jours d\'essai — avez-vous testé l\'analyse IA ?') + `
  <div class="body">
    <h2>Avez-vous testé l'analyse de bail, ${prenom} ?</h2>
    <p>Il vous reste <strong>2 jours</strong> d'essai (jusqu'au <strong>${trialEnd}</strong>).</p>
    <p>L'analyse de bail IA est la fonctionnalité phare de BailScan Pro. En moins de 30 secondes, elle détecte les clauses illégales, calcule le score de conformité et propose les corrections.</p>
    <p><strong>Pour tester :</strong> Tableau de bord → Nouvelle analyse → uploadez un bail PDF.</p>
    <a href="${APP_URL}" class="btn">Analyser mon premier bail →</a>
    <p style="margin-top:20px;font-size:13px;color:#94a3b8">Si vous avez des questions, répondez à cet email.</p>
  </div>` + footerHtml;
}
 
function reminderJ2Html({ prenom, trialEnd }) {
  return headerHtml('Derniers jours d\'essai — créez votre premier bien en gestion') + `
  <div class="body">
    <h2>Plus qu'un jour d'essai, ${prenom}</h2>
    <p>Votre essai expire <strong>demain</strong> (${trialEnd}).</p>
    <p>Vous n'avez pas encore créé de bien en gestion ? C'est le cœur de BailScan Pro — centralisez tous vos mandats, locataires, loyers et documents en un seul endroit.</p>
    <div class="feature"><div class="feature-icon">□</div><div class="feature-text">Créer un bien → Renseigner loyer, bailleur, DPE</div></div>
    <div class="feature"><div class="feature-icon">◇</div><div class="feature-text">Rattacher un locataire → Score de solvabilité automatique</div></div>
    <div class="feature"><div class="feature-icon">▭</div><div class="feature-text">Générer bail + quittances → Export PDF à votre logo</div></div>
    <a href="${APP_URL}" class="btn" style="margin-top:8px;display:inline-block">Créer mon premier bien →</a>
  </div>` + footerHtml;
}
 
function reminderJ3Html({ prenom }) {
  return headerHtml('Votre essai expire aujourd\'hui — continuez avec BailScan Pro') + `
  <div class="body">
    <h2>Votre essai expire aujourd'hui, ${prenom}</h2>
    <p>Pour continuer à utiliser BailScan Pro et ne pas perdre vos données, choisissez votre formule.</p>
    <div style="background:#0f172a;border-radius:12px;padding:20px;text-align:center;margin:16px 0">
      <div style="font-size:28px;font-weight:800;color:white">150<span style="font-size:16px">€ / mois</span></div>
      <div style="font-size:13px;color:rgba(255,255,255,.5);margin:6px 0 12px">Accès complet · Analyses illimitées · Sans engagement</div>
      <a href="${APP_URL}#tarifs" style="background:#3b6fd4;color:white;padding:11px 24px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px;display:inline-block">S'abonner maintenant →</a>
    </div>
    <p style="font-size:13px;color:#94a3b8;text-align:center">Engagement 6 ou 12 mois disponibles pour des tarifs réduits.</p>
  </div>` + footerHtml;
}
 
// ── Handler ────────────────────────────────────────────────────────────
 
export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
 
  const { action, email, prenom, nom, agence } = req.body || {};
 
  if (!email) return res.status(400).json({ error: 'email requis' });
  const prenomFmt = prenom || email.split('@')[0];
 
  const trialEnd = new Date(Date.now() + 3 * 24 * 3600 * 1000).toLocaleDateString('fr-FR', {
    weekday: 'long', day: 'numeric', month: 'long'
  });
 
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  try {
    switch (action) {
 
      // ── Email de bienvenue immédiat (J0) ──
      case 'welcome': {
        await sendEmail({
          to: email,
          subject: `Bienvenue sur BailScan Pro — votre essai gratuit est activé`,
          html: welcomeHtml({ prenom: prenomFmt, email, trialEnd }),
        });
 
        // Programmer les relances en stockant en DB
        const trialEndDate = new Date(Date.now() + 3 * 24 * 3600 * 1000).toISOString();
        await sb.from('email_sequences').insert([
          { email, type: 'trial_j1', send_at: new Date(Date.now() + 1*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
          { email, type: 'trial_j2', send_at: new Date(Date.now() + 2*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
          { email, type: 'trial_j3', send_at: new Date(Date.now() + 3*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: trialEndDate },
        ]);
 
        return res.status(200).json({ ok: true, sent: 'welcome' });
      }
 
      // ── Relances manuelles (appelées par le cron) ──
      case 'trial_j1': {
        await sendEmail({ to: email, subject: `[BailScan Pro] Il vous reste 2 jours d'essai`, html: reminderJ1Html({ prenom: prenomFmt, trialEnd }) });
        return res.status(200).json({ ok: true, sent: 'trial_j1' });
      }
      case 'trial_j2': {
        await sendEmail({ to: email, subject: `[BailScan Pro] Plus qu'un jour d'essai gratuit`, html: reminderJ2Html({ prenom: prenomFmt, trialEnd }) });
        return res.status(200).json({ ok: true, sent: 'trial_j2' });
      }
      case 'trial_j3': {
        await sendEmail({ to: email, subject: `[BailScan Pro] Votre essai expire aujourd'hui`, html: reminderJ3Html({ prenom: prenomFmt }) });
        return res.status(200).json({ ok: true, sent: 'trial_j3' });
      }
 
      default:
        return res.status(400).json({ error: `action inconnue: ${action}` });
    }
  } catch (err) {
    console.error('[send-welcome] error:', err.message);
    return res.status(500).json({ error: err.message });
  }
}
 
