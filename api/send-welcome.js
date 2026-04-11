/**
 * BailScan Pro — /api/send-welcome.js
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
 
function welcomeHtml({ prenom, trialEnd }) {
  return `<!DOCTYPE html>
<html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Bienvenue sur BailScan Pro</title>
<style>
  *{margin:0;padding:0;box-sizing:border-box}
  body{background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#0f172a}
  .wrap{max-width:600px;margin:32px auto;background:#ffffff;border-radius:12px;overflow:hidden;box-shadow:0 2px 16px rgba(0,0,0,.08)}
  .hdr{background:#0f172a;padding:28px 40px;text-align:left}
  .logo{font-size:24px;font-weight:700;color:white;letter-spacing:-.02em}
  .logo-accent{color:#f97316}
  .logo-badge{font-size:9px;font-weight:800;background:#3b6fd4;color:white;padding:2px 7px;border-radius:3px;margin-left:8px;vertical-align:middle;letter-spacing:.06em;font-style:normal;text-transform:uppercase}
  .hdr-sub{font-size:12px;color:rgba(255,255,255,.45);margin-top:6px;letter-spacing:.02em}
  .body{padding:40px}
  .greeting{font-size:22px;font-weight:700;color:#0f172a;margin-bottom:8px;line-height:1.3}
  .intro{font-size:15px;color:#475569;line-height:1.75;margin-bottom:28px}
  .trial-box{background:#eff6ff;border:1px solid #bfdbfe;border-radius:10px;padding:18px 22px;margin-bottom:28px;display:flex;align-items:center;gap:16px}
  .trial-num{font-size:36px;font-weight:800;color:#3b6fd4;line-height:1;flex-shrink:0}
  .trial-text{font-size:13px;color:#1e40af;line-height:1.6}
  .trial-text strong{font-weight:700}
  .section-title{font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin-bottom:14px}
  .features{display:block;margin-bottom:28px}
  .feat{padding:14px 0;border-bottom:1px solid #f1f5f9;display:flex;align-items:flex-start;gap:14px}
  .feat:last-child{border-bottom:none}
  .feat-dot{width:8px;height:8px;border-radius:50%;background:#3b6fd4;flex-shrink:0;margin-top:6px}
  .feat-body{}
  .feat-title{font-size:14px;font-weight:700;color:#0f172a;margin-bottom:3px}
  .feat-desc{font-size:13px;color:#64748b;line-height:1.6}
  .steps{background:#f8fafc;border-radius:10px;padding:20px 22px;margin-bottom:28px}
  .step{display:flex;gap:14px;margin-bottom:14px;align-items:flex-start}
  .step:last-child{margin-bottom:0}
  .step-num{width:24px;height:24px;border-radius:50%;background:#0f172a;color:white;font-size:11px;font-weight:700;display:flex;align-items:center;justify-content:center;flex-shrink:0}
  .step-body{font-size:13px;color:#334155;line-height:1.6}
  .step-body strong{color:#0f172a;font-weight:700}
  .cta-wrap{text-align:center;margin-bottom:28px}
  .cta{display:inline-block;background:#3b6fd4;color:white;padding:15px 36px;border-radius:8px;text-decoration:none;font-size:15px;font-weight:700;letter-spacing:-.01em}
  .divider{height:1px;background:#f1f5f9;margin:28px 0}
  .tips{font-size:13px;color:#475569;line-height:1.75;margin-bottom:28px}
  .tips strong{color:#0f172a;font-weight:700}
  .footer{background:#f8fafc;padding:24px 40px;text-align:center;border-top:1px solid #e2e8f0}
  .footer-logo{font-size:16px;font-weight:700;color:#0f172a;margin-bottom:6px}
  .footer-logo span{color:#f97316}
  .footer-text{font-size:12px;color:#94a3b8;line-height:1.7}
  .footer-link{color:#3b6fd4;text-decoration:none}
</style>
</head>
<body>
<div class="wrap">
 
  <!-- Header -->
  <div class="hdr">
    <div class="logo">Bail<span class="logo-accent">Scan</span><span class="logo-badge">PRO</span></div>
    <div class="hdr-sub">La plateforme IA pour agences immobilières</div>
  </div>
 
  <!-- Body -->
  <div class="body">
 
    <div class="greeting">Bienvenue ${prenom ? ', ' + prenom : ''} !</div>
    <p class="intro">Votre compte BailScan Pro est activé. Vous avez accès à l'intégralité de la plateforme pendant <strong>3 jours</strong>, sans carte bancaire et sans engagement.</p>
 
    <!-- Trial box -->
    <div class="trial-box">
      <div class="trial-num">3j</div>
      <div class="trial-text">
        <strong>Essai gratuit jusqu'au ${trialEnd}</strong><br>
        Accès complet à toutes les fonctionnalités Pro. Aucune carte requise.
      </div>
    </div>
 
    <!-- Fonctionnalités -->
    <div class="section-title">Ce que vous pouvez faire dès maintenant</div>
    <div class="features">
      <div class="feat"><div class="feat-dot"></div><div class="feat-body"><div class="feat-title">Analyse de bail par l'IA</div><div class="feat-desc">Uploadez un bail PDF — l'IA détecte les clauses illégales, calcule le score de conformité ALUR/ELAN et génère les corrections clause par clause en moins de 30 secondes.</div></div></div>
      <div class="feat"><div class="feat-dot"></div><div class="feat-body"><div class="feat-title">Gestion des biens et mandats</div><div class="feat-desc">Centralisez votre portefeuille : mandats de gestion, fiches biens, DPE, loyers, charges, diagnostics. Tout est consultable et exportable en PDF.</div></div></div>
      <div class="feat"><div class="feat-dot"></div><div class="feat-body"><div class="feat-title">Dossiers locataires et scoring IA</div><div class="feat-desc">Créez des fiches locataires complètes. L'IA calcule automatiquement le taux d'effort, le score Go/No-Go et détecte les documents suspects.</div></div></div>
      <div class="feat"><div class="feat-dot"></div><div class="feat-body"><div class="feat-title">Génération de baux et quittances</div><div class="feat-desc">Rédigez des baux conformes loi 1989 / ALUR en quelques clics. Générez et envoyez les quittances mensuelles automatiquement à vos locataires.</div></div></div>
      <div class="feat"><div class="feat-dot"></div><div class="feat-body"><div class="feat-title">États des lieux, courriers et suivi des loyers</div><div class="feat-desc">EDL illustrés avec photos, courriers juridiques pré-rédigés (mises en demeure, congés), suivi des impayés et alertes d'échéances automatiques.</div></div></div>
    </div>
 
    <!-- Pour bien démarrer -->
    <div class="steps">
      <div class="section-title" style="margin-bottom:16px">Pour bien démarrer en 3 étapes</div>
      <div class="step"><div class="step-num">1</div><div class="step-body"><strong>Configurez votre agence</strong> — Renseignez votre logo, adresse, carte professionnelle et garantie financière dans Paramètres. Ces informations s'intègreront automatiquement à tous vos PDF.</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-body"><strong>Créez votre premier bien</strong> — Ajoutez un mandat, renseignez le loyer, le DPE et le bailleur. Rattachez-y un locataire pour activer le suivi complet.</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-body"><strong>Analysez un bail existant</strong> — Uploadez un bail PDF dans Nouvelle analyse. Vous recevrez le rapport de conformité en moins de 30 secondes.</div></div>
    </div>
 
    <!-- CTA -->
    <div class="cta-wrap">
      <a href="${APP_URL}" class="cta">Accéder à mon dashboard</a>
    </div>
 
    <div class="divider"></div>
 
    <!-- Tips -->
    <p class="tips">
      <strong>Un conseil :</strong> commencez par renseigner les informations de votre agence dans <strong>Paramètres</strong> — votre logo, adresse et n° de carte professionnelle apparaîtront sur tous vos documents générés (baux, mandats, quittances, courriers).<br><br>
    </p>
 
  </div>
 
  <!-- Footer -->
  <div class="footer">
    <div class="footer-logo">Bail<span>Scan</span> Pro</div>
    <p class="footer-text">
      Solution IA pour agences immobilières françaises<br>
      <a href="${APP_URL}" class="footer-link">bailscan.app</a> &nbsp;·&nbsp;
      <a href="mailto:bonjour@bailscan.app" class="footer-link">bonjour@bailscan.app</a>
    </p>
  </div>
 
</div>
</body></html>`;
}
 
function reminderJ1Html({ prenom, trialEnd }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a}.wrap{max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden}.hdr{background:#0f172a;padding:24px 40px}.logo{font-size:20px;font-weight:700;color:white}.logo span{color:#f97316}.body{padding:36px}.title{font-size:20px;font-weight:700;margin-bottom:12px}.text{font-size:14px;color:#475569;line-height:1.75;margin-bottom:20px}.cta{display:inline-block;background:#3b6fd4;color:white;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}.footer{padding:20px 40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9}</style>
</head><body><div class="wrap">
<div class="hdr"><div class="logo">Bail<span>Scan</span> Pro</div></div>
<div class="body">
  <div class="title">Avez-vous testé l'analyse de bail${prenom ? ', ' + prenom : ''} ?</div>
  <p class="text">Il vous reste <strong>2 jours</strong> d'essai (jusqu'au <strong>${trialEnd}</strong>).<br><br>
  L'analyse de bail IA est la fonctionnalité phare de BailScan Pro. Uploadez un bail PDF — en moins de 30 secondes, l'IA détecte les clauses illégales, calcule le score de conformité et propose les corrections rédigées.<br><br>
  Pour tester : <strong>Tableau de bord &rarr; Nouvelle analyse &rarr; Uploader un bail PDF</strong>.</p>
  <a href="${APP_URL}" class="cta">Analyser mon premier bail</a>
</div>
<div class="footer">BailScan Pro &nbsp;·&nbsp; <a href="${APP_URL}" style="color:#3b6fd4;text-decoration:none">bailscan.app</a></div>
</div></body></html>`;
}
 
function reminderJ2Html({ prenom, trialEnd }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a}.wrap{max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden}.hdr{background:#0f172a;padding:24px 40px}.logo{font-size:20px;font-weight:700;color:white}.logo span{color:#f97316}.body{padding:36px}.title{font-size:20px;font-weight:700;margin-bottom:12px}.text{font-size:14px;color:#475569;line-height:1.75;margin-bottom:20px}.cta{display:inline-block;background:#3b6fd4;color:white;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}.footer{padding:20px 40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9}</style>
</head><body><div class="wrap">
<div class="hdr"><div class="logo">Bail<span>Scan</span> Pro</div></div>
<div class="body">
  <div class="title">Plus qu'un jour d'essai${prenom ? ', ' + prenom : ''}</div>
  <p class="text">Votre essai gratuit expire <strong>demain</strong> (${trialEnd}).<br><br>
  Vous n'avez pas encore créé de bien en gestion ? C'est le coeur de BailScan Pro — centralisez tous vos mandats, locataires, loyers et documents en un seul endroit.<br><br>
  Pour continuer à utiliser la plateforme après l'essai, choisissez votre formule depuis le tableau de bord.</p>
  <a href="${APP_URL}" class="cta">Créer mon premier bien</a>
</div>
<div class="footer">BailScan Pro &nbsp;·&nbsp; <a href="${APP_URL}" style="color:#3b6fd4;text-decoration:none">bailscan.app</a></div>
</div></body></html>`;
}
 
function reminderJ3Html({ prenom }) {
  return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8">
<style>body{font-family:Arial,sans-serif;background:#f1f5f9;color:#0f172a}.wrap{max-width:600px;margin:32px auto;background:white;border-radius:12px;overflow:hidden}.hdr{background:#0f172a;padding:24px 40px}.logo{font-size:20px;font-weight:700;color:white}.logo span{color:#f97316}.body{padding:36px}.title{font-size:20px;font-weight:700;margin-bottom:12px}.text{font-size:14px;color:#475569;line-height:1.75;margin-bottom:20px}.price-box{background:#0f172a;border-radius:10px;padding:24px;text-align:center;margin:20px 0}.price-num{font-size:36px;font-weight:800;color:white}.price-sub{font-size:13px;color:rgba(255,255,255,.5);margin:6px 0 16px}.cta{display:inline-block;background:#3b6fd4;color:white;padding:13px 30px;border-radius:8px;text-decoration:none;font-weight:700;font-size:14px}.footer{padding:20px 40px;text-align:center;font-size:12px;color:#94a3b8;border-top:1px solid #f1f5f9}</style>
</head><body><div class="wrap">
<div class="hdr"><div class="logo">Bail<span>Scan</span> Pro</div></div>
<div class="body">
  <div class="title">Votre essai expire aujourd'hui${prenom ? ', ' + prenom : ''}</div>
  <p class="text">Pour continuer à utiliser BailScan Pro et ne pas perdre vos données, choisissez votre formule dès maintenant.</p>
  <div class="price-box">
    <div class="price-num">150<span style="font-size:18px;font-weight:400"> € / mois</span></div>
    <div class="price-sub">Accès complet · Analyses illimitées · Sans engagement</div>
    <a href="${APP_URL}#tarifs" class="cta">S'abonner maintenant</a>
  </div>
  <p class="text" style="font-size:13px;color:#94a3b8;text-align:center">Engagement 6 ou 12 mois disponibles pour des tarifs réduits.</p>
</div>
<div class="footer">BailScan Pro &nbsp;·&nbsp; <a href="${APP_URL}" style="color:#3b6fd4;text-decoration:none">bailscan.app</a></div>
</div></body></html>`;
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
          subject: 'Bienvenue sur BailScan Pro — votre accès est activé',
          html: welcomeHtml({ prenom: prenomFmt, trialEnd }),
        });
        console.log('[send-welcome] welcome sent OK:', result.id);
 
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
 
