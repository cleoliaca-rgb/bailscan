// supabase/functions/stripe-webhook/index.ts
//
// Webhook Stripe qui synchronise l'état des abonnements vers Supabase.
// Ce webhook DOIT être sécurisé via STRIPE_WEBHOOK_SECRET.
//
// Déploiement :
//   supabase functions deploy stripe-webhook --no-verify-jwt
//   supabase secrets set STRIPE_WEBHOOK_SECRET=whsec_XXX
//
// Configurer sur Stripe Dashboard :
//   URL : https://<projet>.supabase.co/functions/v1/stripe-webhook
//   Events à écouter :
//     - checkout.session.completed
//     - customer.subscription.created
//     - customer.subscription.updated
//     - customer.subscription.deleted
//     - invoice.payment_failed
//     - invoice.payment_succeeded

import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import Stripe from 'https://esm.sh/stripe@13.11.0?target=deno';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.39.0';

const stripe = new Stripe(Deno.env.get('STRIPE_SECRET_KEY')!, {
  apiVersion: '2023-10-16',
  httpClient: Stripe.createFetchHttpClient(),
});

const cryptoProvider = Stripe.createSubtleCryptoProvider();

// Mapping Stripe price ID → plan BailScan
// À adapter avec tes vrais price IDs Stripe
const PRICE_TO_PLAN: Record<string, string> = {
  'price_essentiel_monthly': 'essentiel',
  'price_essentiel_yearly': 'essentiel',
  'price_premium_monthly': 'premium',
  'price_premium_yearly': 'premium',
};

serve(async (req) => {
  // Supabase service role pour bypasser RLS
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const signature = req.headers.get('Stripe-Signature');
  const body = await req.text();
  const webhookSecret = Deno.env.get('STRIPE_WEBHOOK_SECRET')!;

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(
      body, signature!, webhookSecret, undefined, cryptoProvider
    );
  } catch (err) {
    return new Response(`Webhook signature failed: ${err.message}`, { status: 400 });
  }

  // Idempotence : skip si déjà traité
  const { data: existing } = await supabase
    .from('stripe_events')
    .select('id')
    .eq('id', event.id)
    .maybeSingle();
  if (existing) return new Response('Already processed', { status: 200 });

  try {
    switch (event.type) {

      // ─── Activation immédiate après paiement (one-shot et subscription) ──
      case 'checkout.session.completed': {
        const session = event.data.object as Stripe.Checkout.Session;
        const userId = session.metadata?.user_id;
        if (!userId) break;

        // Bail one-shot : marquer le bail comme payé
        if (session.mode === 'payment') {
          // Le price_id du bail one-shot
          const priceId = session.metadata?.price_id;
          if (priceId === Deno.env.get('STRIPE_PRICE_BAIL_ONESHOT')) {
            // Crédite l'utilisateur d'un bail générable
            // À adapter selon votre logique métier
            await supabase.from('user_credits').upsert({
              user_id: userId,
              bail_credits: 1,
            }, { onConflict: 'user_id' });
          }
        }

        // Abonnement : sync le profil
        if (session.mode === 'subscription' && session.subscription) {
          const subscription = await stripe.subscriptions.retrieve(session.subscription as string);
          const priceId = subscription.items.data[0].price.id;
          const plan = PRICE_TO_PLAN[priceId] || 'gratuit';

          await supabase.from('profiles').update({
            plan,
            stripe_subscription_id: subscription.id,
            plan_started_at: new Date(subscription.current_period_start * 1000).toISOString(),
            plan_renew_at: new Date(subscription.current_period_end * 1000).toISOString(),
            plan_cancelled_at: null,
          }).eq('id', userId);
        }
        break;
      }

      // ─── Changement de plan, renouvellement ─────────────────────
      case 'customer.subscription.created':
      case 'customer.subscription.updated': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        if (!userId) break;

        const priceId = subscription.items.data[0].price.id;
        const plan = subscription.status === 'active'
          ? (PRICE_TO_PLAN[priceId] || 'gratuit')
          : 'gratuit';

        await supabase.from('profiles').update({
          plan,
          stripe_subscription_id: subscription.id,
          plan_renew_at: new Date(subscription.current_period_end * 1000).toISOString(),
          plan_cancelled_at: subscription.cancel_at
            ? new Date(subscription.cancel_at * 1000).toISOString()
            : null,
        }).eq('id', userId);
        break;
      }

      // ─── Résiliation effective ──────────────────────────────────
      case 'customer.subscription.deleted': {
        const subscription = event.data.object as Stripe.Subscription;
        const userId = subscription.metadata?.user_id;
        if (!userId) break;

        await supabase.from('profiles').update({
          plan: 'gratuit',
          stripe_subscription_id: null,
          plan_cancelled_at: new Date().toISOString(),
        }).eq('id', userId);
        break;
      }

      // ─── Paiement échoué ────────────────────────────────────────
      case 'invoice.payment_failed': {
        const invoice = event.data.object as Stripe.Invoice;
        // Récupérer le user via stripe_customer_id et envoyer un email d'alerte
        const { data: profile } = await supabase
          .from('profiles')
          .select('id, email')
          .eq('stripe_customer_id', invoice.customer)
          .single();
        if (profile) {
          // TODO : envoyer email "Paiement échoué, mettez à jour votre CB"
          console.log(`Payment failed for user ${profile.id}`);
        }
        break;
      }
    }

    // Marque l'événement comme traité
    await supabase.from('stripe_events').insert({
      id: event.id,
      type: event.type,
      data: event.data.object,
    });

    return new Response('OK', { status: 200 });
  } catch (err) {
    console.error('Webhook error:', err);
    return new Response(`Webhook handler error: ${err.message}`, { status: 500 });
  }
});
