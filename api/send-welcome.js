/**
 * BailScan Pro — /api/send-welcome.js
 */
 
const FROM = process.env.RESEND_FROM_EMAIL || 'BailScan Pro <bonjour@bailscan.app>';
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app';
 
async function sendEmail({ to, subject, html }) {
  const r = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: { 'Authorization': `Bearer ${process.env.RESEND_API_KEY}`, 'Content-Type': 'application/json' },
    body: JSON.stringify({ from: FROM, to: [to], subject, html }),
  });
  const data = await r.json();
  if (!r.ok) throw new Error(`Resend error ${r.status}: ${JSON.stringify(data)}`);
  return data;
}
 
function welcomeHtml({ prenom, trialEnd }) { return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-.03em;line-height:1">Bail<span style="color:#f97316">Scan</span><span style="font-size:10px;font-weight:700;background:#3b6fd4;color:#fff;padding:3px 8px;border-radius:4px;margin-left:8px;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle">PRO</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:7px">La plateforme IA pour agences immobili&egrave;res</div>
      </td></tr></table>
    </td>
  </tr>
 
  <tr><td style="background:linear-gradient(180deg,#1e293b 0%,#2d3f55 60%,#e8edf4 100%);padding:36px 40px 32px">
    <p style="font-size:28px;font-weight:800;color:#ffffff;margin:0 0 10px 0;line-height:1.2">Bienvenue, Cl&eacute;olia&nbsp;!</p>
    <p style="font-size:14px;color:rgba(255,255,255,.75);margin:0;line-height:1.75">Votre compte BailScan Pro est activ&eacute;. Acc&egrave;s complet &agrave; toutes les fonctionnalit&eacute;s pendant <strong style="color:#ffffff">3&nbsp;jours</strong>, sans carte bancaire.</p>
  </td></tr>
 
  <tr><td style="padding:28px 40px 0">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:1.5px solid #93c5fd;border-radius:12px"><tr><td style="padding:22px 26px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td style="vertical-align:middle;width:76px">
          <p style="font-size:52px;font-weight:900;color:#1d4ed8;margin:0;line-height:1">3</p>
          <p style="font-size:12px;font-weight:700;color:#1d4ed8;margin:4px 0 0 0;line-height:1.3">jours<br>d'essai gratuit</p>
        </td>
        <td style="padding-left:20px;border-left:1.5px solid #bfdbfe;vertical-align:middle">
          <p style="font-size:13px;font-weight:700;color:#1e40af;margin:0 0 5px 0">Acc&egrave;s complet jusqu'au ${trialEnd}</p>
          <p style="font-size:12px;color:#3b82f6;line-height:1.65;margin:0">Toutes les fonctionnalit&eacute;s Pro d&eacute;bloqu&eacute;es.<br>Aucune carte bancaire requise.</p>
        </td>
      </tr></table>
    </td></tr></table>
  </td></tr>
 
  
  <tr><td style="padding:24px 40px"><div style="height:1px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent)"></div></td></tr>
 
  <tr><td style="padding:24px 40px 8px"><p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Ce que vous pouvez faire d&egrave;s maintenant</p></td></tr>
  <tr><td style="padding:0 40px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#dbeafe;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128196;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Analyse de bail IA</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Score de conformit&eacute; ALUR/ELAN, clauses ill&eacute;gales d&eacute;tect&eacute;es, corrections r&eacute;dig&eacute;es en 30&nbsp;secondes.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#fef9c3;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128100;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Scoring locataire</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Taux d'effort, r&egrave;gle des 3x, d&eacute;tection de fraude. R&eacute;sultat Go / No-Go en 15&nbsp;secondes.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#dcfce7;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#127968;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Gestion des biens et mandats</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Portefeuille centralis&eacute;: mandats loi Hoguet, DPE, loyers, charges et diagnostics.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#fce7f3;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128196;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">G&eacute;n&eacute;ration de documents PDF</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Baux, mandats, quittances et courriers juridiques g&eacute;n&eacute;r&eacute;s &agrave; votre logo en quelques clics.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#ede9fe;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#9993;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Suivi loyers et alertes</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Impay&eacute;s, &eacute;ch&eacute;ances, EDL illustr&eacute;s, courriers de mise en demeure et cong&eacute;s.</p></td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
 
    <tr><td style="padding:0 40px"><div style="height:1px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent)"></div></td></tr>
 
  <tr><td style="padding:24px 40px 8px"><p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Pour bien d&eacute;marrer en 3 &eacute;tapes</p></td></tr>
  <tr><td style="padding:0 40px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding-bottom:14px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" valign="top"><div style="width:28px;height:28px;background:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-size:11px;font-weight:800;color:#fff">1</div></td>
        <td style="padding-left:12px;vertical-align:top"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 3px 0">Configurez votre agence</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Logo, adresse et carte professionnelle dans Param&egrave;tres. Appara&icirc;tront sur tous vos PDF.</p></td>
      </tr></table></td></tr>
      <tr><td style="padding-bottom:14px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" valign="top"><div style="width:28px;height:28px;background:#0f172a;border-radius:50%;text-align:center;line-height:28px;font-size:11px;font-weight:800;color:#fff">2</div></td>
        <td style="padding-left:12px;vertical-align:top"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 3px 0">Cr&eacute;ez votre premier bien</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Ajoutez un mandat, le loyer, le DPE et le bailleur. Rattachez-y un locataire.</p></td>
      </tr></table></td></tr>
      <tr><td><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="34" valign="top"><div style="width:28px;height:28px;background:#3b6fd4;border-radius:50%;text-align:center;line-height:28px;font-size:11px;font-weight:800;color:#fff">3</div></td>
        <td style="padding-left:12px;vertical-align:top"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 3px 0">Analysez un bail existant</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Uploadez un bail PDF. Rapport de conformit&eacute; complet en moins de 30&nbsp;secondes.</p></td>
      </tr></table></td></tr>
    </table>
  </td></tr>
 
    <tr><td style="padding:0 40px 32px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <a href="https://bailscan.app" style="display:inline-block;background:linear-gradient(135deg,#3b6fd4,#2563eb);color:#fff;padding:16px 48px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:800">Acc&eacute;der &agrave; mon dashboard &rarr;</a>
  </td></tr></table></td></tr>
 
    <tr><td style="padding:0 40px"><div style="height:1px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent)"></div></td></tr>
 
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border:1px solid #fde68a;border-radius:10px"><tr><td style="padding:16px 18px">
      <p style="font-size:13px;color:#92400e;line-height:1.7;margin:0"><strong style="color:#78350f">Conseil :</strong> commencez par renseigner les informations de votre agence dans <strong style="color:#78350f">Param&egrave;tres</strong>. Votre logo appara&icirc;tra automatiquement sur tous vos documents g&eacute;n&eacute;r&eacute;s.</p>
    </td></tr></table>
  </td></tr>
 
  <tr>
    <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
        <p style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 6px 0">Bail<span style="color:#f97316">Scan</span> Pro</p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 10px 0;line-height:1.6">Solution IA pour agences immobili&egrave;res fran&ccedil;aises</p>
        <p style="font-size:12px;margin:0"><a href="https://bailscan.app" style="color:#3b6fd4;text-decoration:none;font-weight:600">bailscan.app</a> <span style="color:#cbd5e1">&middot;</span> <a href="mailto:bonjour@bailscan.app" style="color:#94a3b8;text-decoration:none">bonjour@bailscan.app</a></p>
      </td></tr></table>
    </td>
  </tr>
</table></td></tr></table></body></html>`; }
function reminderJ1Html({ prenom, trialEnd }) { return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-.03em;line-height:1">Bail<span style="color:#f97316">Scan</span><span style="font-size:10px;font-weight:700;background:#3b6fd4;color:#fff;padding:3px 8px;border-radius:4px;margin-left:8px;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle">PRO</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:7px">La plateforme IA pour agences immobili&egrave;res</div>
      </td></tr></table>
    </td>
  </tr>
 
  <tr><td style="background:linear-gradient(180deg,#1e293b 0%,#2d3f55 60%,#e8edf4 100%);padding:36px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef9c3,#fef08a);border:1.5px solid #fde047;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:20px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;width:76px">
              <p style="font-size:52px;font-weight:900;color:#854d0e;margin:0;line-height:1">2</p>
              <p style="font-size:12px;font-weight:700;color:#854d0e;margin:4px 0 0 0;line-height:1.3">jours<br>restants</p>
            </td>
            <td style="padding-left:20px;border-left:1.5px solid #fde047;vertical-align:middle">
              <p style="font-size:13px;font-weight:700;color:#854d0e;margin:0 0 5px 0">Essai gratuit</p>
              <p style="font-size:12px;color:#854d0e;line-height:1.65;margin:0;opacity:.8">Valable jusqu'au <strong>${trialEnd}</strong><br>Aucune carte requise.</p>
            </td>
          </tr></table>
        </td></tr>
      </table>
    <p style="font-size:24px;font-weight:800;color:#ffffff;margin:0 0 10px 0;line-height:1.25">Avez-vous scor&eacute; un candidat, Cl&eacute;olia&nbsp;?</p>
    <p style="font-size:14px;color:rgba(255,255,255,.75);margin:0;line-height:1.75">C'est la fonctionnalit&eacute; qui fait gagner le plus de temps. En 15&nbsp;secondes, vous savez si un dossier est solide, sans tableur ni calcul manuel.</p>
  </td></tr>
 
  <tr><td style="padding:28px 40px 8px">
    <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Scoring dossier locataire</p>
    <p style="font-size:15px;font-weight:700;color:#0f172a;margin:0 0 10px 0">L'IA lit le dossier &agrave; votre place</p>
    <p style="font-size:13px;color:#475569;line-height:1.7;margin:0 0 20px 0">Uploadez les pi&egrave;ces du candidat. BailScan Pro calcule le <strong style="color:#0f172a">taux d'effort</strong>, v&eacute;rifie la coh&eacute;rence des justificatifs et d&eacute;tecte les documents falsifi&eacute;s.</p>
  </td></tr>
 
  <tr><td style="padding:0 40px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0">
      <tr><td style="padding-bottom:6px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f0fdf4;border-left:4px solid #16a34a;border-radius:0 8px 8px 0"><tr><td style="padding:12px 14px">
          <p style="margin:0 0 4px 0"><span style="font-size:11px;font-weight:800;color:#ffffff;background:#16a34a;padding:2px 9px;border-radius:4px">GO</span>&nbsp; <span style="font-size:11px;color:#166534;font-weight:600">Dossier solide</span></p>
          <p style="font-size:12px;color:#334155;margin:0;line-height:1.5">Taux d'effort inf&eacute;rieur &agrave; 33%. Documents coh&eacute;rents.</p>
        </td></tr></table>
      </td></tr>
      <tr><td style="padding-bottom:6px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fffbeb;border-left:4px solid #d97706;border-radius:0 8px 8px 0"><tr><td style="padding:12px 14px">
          <p style="margin:0 0 4px 0"><span style="font-size:11px;font-weight:800;color:#ffffff;background:#d97706;padding:2px 9px;border-radius:4px">MITIG&Eacute;</span>&nbsp; <span style="font-size:11px;color:#92400e;font-weight:600">&Agrave; &eacute;tudier</span></p>
          <p style="font-size:12px;color:#334155;margin:0;line-height:1.5">Taux d'effort entre 33 et 40%. Garant recommand&eacute;.</p>
        </td></tr></table>
      </td></tr>
      <tr><td>
        <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#fef2f2;border-left:4px solid #dc2626;border-radius:0 8px 8px 0"><tr><td style="padding:12px 14px">
          <p style="margin:0 0 4px 0"><span style="font-size:11px;font-weight:800;color:#ffffff;background:#dc2626;padding:2px 9px;border-radius:4px">NON</span>&nbsp; <span style="font-size:11px;color:#991b1b;font-weight:600">Dossier risqu&eacute;</span></p>
          <p style="font-size:12px;color:#334155;margin:0;line-height:1.5">Taux d'effort sup&eacute;rieur &agrave; 40%. Risque d'impay&eacute;.</p>
        </td></tr></table>
      </td></tr>
    </table>
  </td></tr>
 
  <tr><td style="padding:0 40px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px"><tr><td style="padding:18px 20px">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Ce que l'IA analyse automatiquement</p>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr>
        <td width="22" valign="top" style="padding-top:2px"><div style="width:16px;height:16px;background:#dbeafe;border-radius:50%;text-align:center;line-height:16px;font-size:9px;color:#2563eb;font-weight:800">&#10003;</div></td>
        <td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Revenus nets vs loyer : taux d'effort calcul&eacute; en temps r&eacute;el</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr>
        <td width="22" valign="top" style="padding-top:2px"><div style="width:16px;height:16px;background:#dbeafe;border-radius:50%;text-align:center;line-height:16px;font-size:9px;color:#2563eb;font-weight:800">&#10003;</div></td>
        <td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Stabilit&eacute; de l'emploi : type de contrat, anciennet&eacute;, employeur</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr>
        <td width="22" valign="top" style="padding-top:2px"><div style="width:16px;height:16px;background:#dbeafe;border-radius:50%;text-align:center;line-height:16px;font-size:9px;color:#2563eb;font-weight:800">&#10003;</div></td>
        <td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Coh&eacute;rence des pi&egrave;ces : bulletins, avis d'imposition, justificatif de domicile</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
        <td width="22" valign="top" style="padding-top:2px"><div style="width:16px;height:16px;background:#fecdd3;border-radius:50%;text-align:center;line-height:16px;font-size:9px;color:#dc2626;font-weight:800">!</div></td>
        <td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">D&eacute;tection de documents falsifi&eacute;s ou modifi&eacute;s</p></td></tr></table>
    </td></tr></table>
  </td></tr>
    <tr><td style="padding:0 40px 32px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <a href="https://bailscan.app" style="display:inline-block;background:linear-gradient(135deg,#3b6fd4,#2563eb);color:#fff;padding:16px 48px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:800">Scorer mon premier dossier &rarr;</a>
  </td></tr></table></td></tr>
 
  <tr>
    <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
        <p style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 6px 0">Bail<span style="color:#f97316">Scan</span> Pro</p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 10px 0;line-height:1.6">Solution IA pour agences immobili&egrave;res fran&ccedil;aises</p>
        <p style="font-size:12px;margin:0"><a href="https://bailscan.app" style="color:#3b6fd4;text-decoration:none;font-weight:600">bailscan.app</a> <span style="color:#cbd5e1">&middot;</span> <a href="mailto:bonjour@bailscan.app" style="color:#94a3b8;text-decoration:none">bonjour@bailscan.app</a></p>
      </td></tr></table>
    </td>
  </tr>
</table></td></tr></table></body></html>`; }
function reminderJ2Html({ prenom, trialEnd }) { return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-.03em;line-height:1">Bail<span style="color:#f97316">Scan</span><span style="font-size:10px;font-weight:700;background:#3b6fd4;color:#fff;padding:3px 8px;border-radius:4px;margin-left:8px;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle">PRO</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:7px">La plateforme IA pour agences immobili&egrave;res</div>
      </td></tr></table>
    </td>
  </tr>
 
  <tr><td style="background:linear-gradient(180deg,#1e293b 0%,#2d3f55 60%,#e8edf4 100%);padding:36px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fff7ed,#fed7aa);border:1.5px solid #fb923c;border-radius:12px;margin-bottom:24px">
        <tr><td style="padding:20px 24px">
          <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
            <td style="vertical-align:middle;width:76px">
              <p style="font-size:52px;font-weight:900;color:#c2410c;margin:0;line-height:1">1</p>
              <p style="font-size:12px;font-weight:700;color:#c2410c;margin:4px 0 0 0;line-height:1.3">jour<br>restant</p>
            </td>
            <td style="padding-left:20px;border-left:1.5px solid #fb923c;vertical-align:middle">
              <p style="font-size:13px;font-weight:700;color:#c2410c;margin:0 0 5px 0">Essai gratuit</p>
              <p style="font-size:12px;color:#c2410c;line-height:1.65;margin:0;opacity:.8">Expire demain <strong>${trialEnd}</strong><br>Choisissez votre formule avant minuit.</p>
            </td>
          </tr></table>
        </td></tr>
      </table>
    <p style="font-size:24px;font-weight:800;color:#ffffff;margin:0 0 10px 0;line-height:1.25">Vos documents &agrave; votre logo en quelques clics</p>
    <p style="font-size:14px;color:rgba(255,255,255,.75);margin:0;line-height:1.75">Bail, mandat de gestion, quittances, courriers juridiques. Tout g&eacute;n&eacute;r&eacute; automatiquement, conforme &agrave; la loi 1989 / ALUR.</p>
  </td></tr>
 
  <tr><td style="padding:28px 40px 8px"><p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Ce que vous pouvez g&eacute;n&eacute;rer en un clic</p></td></tr>
  <tr><td style="padding:0 40px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px;overflow:hidden">
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#dbeafe;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128196;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Bail d'habitation</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Clauses obligatoires ALUR / ELAN, surfaces Carrez, encadrement des loyers v&eacute;rifi&eacute;.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#dcfce7;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128203;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Mandat de gestion</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Loi Hoguet conforme, 9 articles g&eacute;n&eacute;r&eacute;s avec vos informations agence et vos honoraires.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px;border-bottom:1px solid #f1f5f9">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#fef9c3;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#128179;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Quittances de loyer</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">G&eacute;n&eacute;r&eacute;es et envoy&eacute;es automatiquement chaque mois. Z&eacute;ro saisie, z&eacute;ro oubli.</p></td>
        </tr></table>
      </td></tr>
      <tr><td style="padding:14px 18px">
        <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr>
          <td width="30" style="vertical-align:top;padding-top:1px"><div style="width:24px;height:24px;background:#ede9fe;border-radius:6px;text-align:center;line-height:24px;font-size:13px">&#9993;</div></td>
          <td style="padding-left:11px"><p style="font-size:13px;font-weight:700;color:#0f172a;margin:0 0 2px 0">Courriers juridiques</p><p style="font-size:12px;color:#64748b;line-height:1.6;margin:0">Mise en demeure, cong&eacute; pour vente, r&eacute;vision IRL. R&eacute;dig&eacute;s en un clic, conformes au Code civil.</p></td>
        </tr></table>
      </td></tr>
    </table>
  </td></tr>
 
  <tr><td style="padding:0 40px 28px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#0f172a,#1e293b);border-radius:12px"><tr><td style="padding:20px 22px">
      <p style="font-size:13px;font-weight:700;color:#ffffff;margin:0 0 7px 0">Tous vos documents &agrave; votre image</p>
      <p style="font-size:13px;color:rgba(255,255,255,.6);line-height:1.7;margin:0 0 10px 0">Configurez votre logo et votre n&#176; de carte professionnelle dans Param&egrave;tres. Ils appara&icirc;tront sur chaque PDF g&eacute;n&eacute;r&eacute;.</p>
      <p style="font-size:12px;color:#7fa8e8;margin:0">Bail &middot; Mandat &middot; Quittances &middot; EDL &middot; Courriers</p>
    </td></tr></table>
  </td></tr>
    <tr><td style="padding:0 40px 32px"><table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
    <a href="https://bailscan.app" style="display:inline-block;background:linear-gradient(135deg,#3b6fd4,#2563eb);color:#fff;padding:16px 48px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:800">G&eacute;n&eacute;rer mon premier document &rarr;</a>
  </td></tr></table></td></tr>
    <tr><td style="padding:0 40px"><div style="height:1px;background:linear-gradient(90deg,transparent,#e2e8f0,transparent)"></div></td></tr>
  <tr><td style="padding:24px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px"><tr><td style="padding:18px 20px">
      <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Vous n'avez pas encore scor&eacute; de dossier ?</p>
      <p style="font-size:13px;color:#475569;line-height:1.7;margin:0 0 14px 0">Le scoring locataire IA analyse le taux d'effort, la stabilit&eacute; d'emploi et d&eacute;tecte les pi&egrave;ces falsifi&eacute;es. R&eacute;sultat <strong style="color:#0f172a">Go / No-Go en 15 secondes</strong>.</p>
      <a href="https://bailscan.app" style="display:inline-block;background:#0f172a;color:#ffffff;padding:11px 22px;border-radius:8px;text-decoration:none;font-size:13px;font-weight:700">Scorer un dossier locataire</a>
    </td></tr></table>
  </td></tr>
 
  <tr>
    <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
        <p style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 6px 0">Bail<span style="color:#f97316">Scan</span> Pro</p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 10px 0;line-height:1.6">Solution IA pour agences immobili&egrave;res fran&ccedil;aises</p>
        <p style="font-size:12px;margin:0"><a href="https://bailscan.app" style="color:#3b6fd4;text-decoration:none;font-weight:600">bailscan.app</a> <span style="color:#cbd5e1">&middot;</span> <a href="mailto:bonjour@bailscan.app" style="color:#94a3b8;text-decoration:none">bonjour@bailscan.app</a></p>
      </td></tr></table>
    </td>
  </tr>
</table></td></tr></table></body></html>`; }
function reminderJ3Html({ prenom }) { return `<!DOCTYPE html><html lang="fr"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background:#eef2f7;font-family:Arial,Helvetica,sans-serif;color:#0f172a">
<table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#eef2f7"><tr><td align="center" style="padding:40px 16px">
<table width="600" cellpadding="0" cellspacing="0" border="0" style="max-width:600px;width:100%;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 4px 32px rgba(15,23,42,.12)">
  <tr>
    <td style="background:linear-gradient(135deg,#0f172a 0%,#1e293b 100%);padding:32px 40px 28px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td>
        <div style="font-size:26px;font-weight:800;color:#ffffff;letter-spacing:-.03em;line-height:1">Bail<span style="color:#f97316">Scan</span><span style="font-size:10px;font-weight:700;background:#3b6fd4;color:#fff;padding:3px 8px;border-radius:4px;margin-left:8px;letter-spacing:.08em;text-transform:uppercase;vertical-align:middle">PRO</span></div>
        <div style="font-size:12px;color:rgba(255,255,255,.4);margin-top:7px">La plateforme IA pour agences immobili&egrave;res</div>
      </td></tr></table>
    </td>
  </tr>
 
  <tr><td style="background:linear-gradient(180deg,#1e293b 0%,#2d3f55 60%,#e8edf4 100%);padding:36px 40px 32px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#fef2f2,#fecaca);border:1.5px solid #f87171;border-radius:12px;margin-bottom:24px"><tr><td style="padding:18px 22px">
      <p style="font-size:14px;font-weight:800;color:#991b1b;margin:0 0 4px 0">Votre essai expire aujourd'hui</p>
      <p style="font-size:13px;color:#b91c1c;margin:0;line-height:1.6">Passez &agrave; Pro maintenant pour ne pas perdre l'acc&egrave;s &agrave; vos donn&eacute;es.</p>
    </td></tr></table>
    <p style="font-size:24px;font-weight:800;color:#ffffff;margin:0 0 10px 0;line-height:1.25">Ne perdez pas votre avance, Cl&eacute;olia</p>
    <p style="font-size:14px;color:rgba(255,255,255,.75);margin:0 0 10px 0;line-height:1.75">Vos biens, locataires, baux et analyses sont conserv&eacute;s. Mais sans abonnement, vous perdez l'acc&egrave;s d&egrave;s ce soir.</p>
    <p style="font-size:14px;font-weight:700;color:rgba(255,255,255,.9);margin:0;line-height:1.7">Chaque jour sans BailScan Pro, c'est du temps perdu en ressaisie, des clauses non v&eacute;rifi&eacute;es et des impay&eacute;s non suivis.</p>
  </td></tr>
 
  <tr><td style="padding:28px 40px 24px">
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-left:3px solid #3b6fd4;border-radius:0 10px 10px 0"><tr><td style="padding:18px 20px">
      <p style="font-size:14px;color:#334155;line-height:1.75;font-style:italic;margin:0 0 10px 0">&ldquo;BailScan Pro m'a permis de g&eacute;rer 40 mandats sans assistant. L'analyse de bail m'&eacute;conomise 2h par semaine. Le scoring locataire a &eacute;vit&eacute; 3 mauvais dossiers en 6 mois.&rdquo;</p>
      <p style="font-size:12px;font-weight:600;color:#64748b;margin:0">Agent immobilier, Bordeaux</p>
    </td></tr></table>
  </td></tr>
 
  <tr><td style="padding:0 40px 24px">
    <p style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.1em;color:#94a3b8;margin:0 0 12px 0">Ce que vous gardez avec Pro</p>
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border-radius:12px"><tr><td style="padding:18px 20px">
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr><td width="24" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;background:#dcfce7;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#16a34a;font-weight:700">&#10003;</div></td><td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Analyses de baux illimit&eacute;es avec score et corrections r&eacute;dig&eacute;es</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr><td width="24" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;background:#dcfce7;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#16a34a;font-weight:700">&#10003;</div></td><td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Scoring locataire IA : Go / No-Go en 15 secondes</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr><td width="24" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;background:#dcfce7;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#16a34a;font-weight:700">&#10003;</div></td><td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">G&eacute;n&eacute;ration de baux, mandats et quittances &agrave; votre logo</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0" style="margin-bottom:8px"><tr><td width="24" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;background:#dcfce7;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#16a34a;font-weight:700">&#10003;</div></td><td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Suivi des loyers, impay&eacute;s et alertes d'&eacute;ch&eacute;ances automatiques</p></td></tr></table>
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td width="24" valign="top" style="padding-top:2px"><div style="width:18px;height:18px;background:#dcfce7;border-radius:50%;text-align:center;line-height:18px;font-size:10px;color:#16a34a;font-weight:700">&#10003;</div></td><td style="padding-left:10px"><p style="font-size:13px;color:#334155;line-height:1.6;margin:0">Support prioritaire : r&eacute;ponse sous 24h</p></td></tr></table>
    </td></tr></table>
  </td></tr>
 
  <tr><td style="padding:0 40px 24px">
    <!-- Mensuel -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:#f8fafc;border:1.5px solid #e2e8f0;border-radius:10px;margin-bottom:8px">
      <tr>
        <td style="padding:14px 18px;vertical-align:middle">
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#94a3b8;margin:0 0 2px 0">Mensuel</p>
          <p style="font-size:22px;font-weight:900;color:#0f172a;margin:0;line-height:1">150&euro; <span style="font-size:13px;font-weight:400;color:#94a3b8">/mois</span></p>
        </td>
        <td style="padding:14px 18px;text-align:right;vertical-align:middle">
          <a href="https://bailscan.app#tarifs" style="display:inline-block;background:#0f172a;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:700">Choisir</a>
        </td>
      </tr>
    </table>
    <!-- 6 mois -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#f0fdf4,#dcfce7);border:2px solid #22c55e;border-radius:10px;margin-bottom:8px">
      <tr>
        <td style="padding:14px 18px;vertical-align:middle">
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#16a34a;margin:0 0 2px 0">6 mois &minus;10%</p>
          <p style="font-size:22px;font-weight:900;color:#0f172a;margin:0;line-height:1">135&euro; <span style="font-size:13px;font-weight:400;color:#94a3b8">/mois</span></p>
        </td>
        <td style="padding:14px 18px;text-align:right;vertical-align:middle">
          <a href="https://bailscan.app#tarifs" style="display:inline-block;background:#16a34a;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:700">Choisir</a>
        </td>
      </tr>
    </table>
    <!-- 12 mois -->
    <table width="100%" cellpadding="0" cellspacing="0" border="0" style="background:linear-gradient(135deg,#eff6ff,#dbeafe);border:2px solid #3b82f6;border-radius:10px">
      <tr>
        <td style="padding:14px 18px;vertical-align:middle">
          <p style="font-size:11px;font-weight:700;text-transform:uppercase;letter-spacing:.08em;color:#2563eb;margin:0 0 2px 0">12 mois &minus;20%</p>
          <p style="font-size:22px;font-weight:900;color:#0f172a;margin:0;line-height:1">120&euro; <span style="font-size:13px;font-weight:400;color:#94a3b8">/mois</span></p>
        </td>
        <td style="padding:14px 18px;text-align:right;vertical-align:middle">
          <a href="https://bailscan.app#tarifs" style="display:inline-block;background:#3b6fd4;color:#fff;padding:10px 22px;border-radius:7px;text-decoration:none;font-size:13px;font-weight:700">Choisir</a>
        </td>
      </tr>
    </table>
  </td></tr>
 
  <tr><td style="padding:0 40px 32px"><table width="100%" cellpadding="0" cellspacing="0" border="0">
    <tr><td align="center"><a href="https://bailscan.app#tarifs" style="display:inline-block;background:linear-gradient(135deg,#3b6fd4,#2563eb);color:#fff;padding:16px 48px;border-radius:10px;text-decoration:none;font-size:15px;font-weight:800">S'abonner maintenant &rarr;</a></td></tr>
    <tr><td align="center" style="padding-top:12px"><a href="https://bailscan.app" style="font-size:12px;color:#94a3b8;text-decoration:none">Acc&eacute;der au dashboard d'abord</a></td></tr>
  </table></td></tr>
 
  <tr>
    <td style="background:#f8fafc;padding:28px 40px;border-top:1px solid #e2e8f0">
      <table width="100%" cellpadding="0" cellspacing="0" border="0"><tr><td align="center">
        <p style="font-size:16px;font-weight:800;color:#0f172a;margin:0 0 6px 0">Bail<span style="color:#f97316">Scan</span> Pro</p>
        <p style="font-size:12px;color:#94a3b8;margin:0 0 10px 0;line-height:1.6">Solution IA pour agences immobili&egrave;res fran&ccedil;aises</p>
        <p style="font-size:12px;margin:0"><a href="https://bailscan.app" style="color:#3b6fd4;text-decoration:none;font-weight:600">bailscan.app</a> <span style="color:#cbd5e1">&middot;</span> <a href="mailto:bonjour@bailscan.app" style="color:#94a3b8;text-decoration:none">bonjour@bailscan.app</a></p>
      </td></tr></table>
    </td>
  </tr>
</table></td></tr></table></body></html>`; }
 
module.exports = async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).end();
 
  const { action, email, prenom } = req.body || {};
  if (!email) return res.status(400).json({ error: 'email requis' });
 
  const prenomFmt = prenom || email.split('@')[0];
  const _d = new Date(Date.now() + 3*24*3600*1000);
  const _days = ['dimanche','lundi','mardi','mercredi','jeudi','vendredi','samedi'];
  const trialEnd = _days[_d.getDay()] + ' ' + String(_d.getDate()).padStart(2,'0') + '/' + String(_d.getMonth()+1).padStart(2,'0');
 
  console.log('[send-welcome] action:', action, 'email:', email);
 
  try {
    switch (action) {
      case 'welcome': {
        const result = await sendEmail({ to: email, subject: 'Bienvenue sur BailScan Pro \u2014 votre acc\u00e8s est activ\u00e9', html: welcomeHtml({ prenom: prenomFmt, trialEnd }) });
        console.log('[send-welcome] OK:', result.id);
        try {
          const { createClient } = require('@supabase/supabase-js');
          const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
          const te = new Date(Date.now() + 3*24*3600*1000).toISOString();
          await sb.from('email_sequences').insert([
            { email, type: 'trial_j1', send_at: new Date(Date.now()+1*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: te },
            { email, type: 'trial_j2', send_at: new Date(Date.now()+2*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: te },
            { email, type: 'trial_j3', send_at: new Date(Date.now()+3*24*3600*1000).toISOString(), prenom: prenomFmt, status: 'pending', trial_end: te },
          ]);
        } catch(e) { console.warn('[send-welcome] Supabase:', e.message); }
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
 
