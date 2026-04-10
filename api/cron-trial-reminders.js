/**
 * BailScan Pro — /api/cron-trial-reminders.js
 * Cron Vercel — tourne toutes les heures
 * Envoie les emails de relance J+1, J+2, J+3 programmés dans `email_sequences`
 *
 * Configurer dans vercel.json :
 * {
 *   "crons": [{ "path": "/api/cron-trial-reminders", "schedule": "0 * * * *" }]
 * }
 *
 * Variables Vercel :
 *   SUPABASE_URL
 *   SUPABASE_SERVICE_KEY
 *   CRON_SECRET   → string aléatoire pour sécuriser l'endpoint
 *   NEXT_PUBLIC_APP_URL
 */
 
import { createClient } from '@supabase/supabase-js';
 
const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://bailscan.app';
 
export default async function handler(req, res) {
  // Vérification sécurité (Vercel appelle avec Authorization header)
  const authHeader = req.headers['authorization'];
  if (process.env.CRON_SECRET && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
 
  const sb = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);
 
  // Récupérer tous les emails à envoyer maintenant
  const now = new Date().toISOString();
  const { data: pending, error } = await sb
    .from('email_sequences')
    .select('*')
    .eq('status', 'pending')
    .lte('send_at', now)
    .limit(50);
 
  if (error) {
    console.error('[cron] DB error:', error.message);
    return res.status(500).json({ error: error.message });
  }
 
  if (!pending || pending.length === 0) {
    return res.status(200).json({ sent: 0, message: 'Aucun email à envoyer' });
  }
 
  let sent = 0, failed = 0;
 
  for (const seq of pending) {
    try {
      // Appeler send-welcome avec l'action correspondante
      const r = await fetch(`${APP_URL}/api/send-welcome`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: seq.type,
          email: seq.email,
          prenom: seq.prenom,
        }),
      });
 
      const d = await r.json();
 
      if (d.ok) {
        // Marquer comme envoyé
        await sb.from('email_sequences').update({
          status: 'sent',
          sent_at: new Date().toISOString(),
        }).eq('id', seq.id);
        sent++;
      } else {
        await sb.from('email_sequences').update({
          status: 'failed',
          error: d.error || 'unknown',
        }).eq('id', seq.id);
        failed++;
      }
    } catch (err) {
      console.error(`[cron] Failed for ${seq.email} (${seq.type}):`, err.message);
      await sb.from('email_sequences').update({
        status: 'failed',
        error: err.message,
      }).eq('id', seq.id).catch(() => {});
      failed++;
    }
  }
 
  console.log(`[cron] Processed ${pending.length}: ${sent} sent, ${failed} failed`);
  return res.status(200).json({ processed: pending.length, sent, failed });
}
 
