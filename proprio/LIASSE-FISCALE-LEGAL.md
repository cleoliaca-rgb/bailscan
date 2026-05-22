# BailScan Liasse Fiscale — Cadre Légal & CGV

## TL;DR pour Cléolia

Tu peux **légalement** vendre le service de génération de liasse fiscale LMNP **sans expert-comptable obligatoire**. Voici le périmètre :

| ✅ Ce que tu peux faire | ❌ Ce que tu NE peux PAS faire |
|---|---|
| Vendre un outil de calcul automatisé | Te présenter comme expert-comptable |
| Générer la liasse via IA (calculs mécaniques) | Donner du conseil fiscal personnalisé |
| Télétransmettre via partenaire EDI agréé | Engager ta responsabilité sur l'exactitude |
| Archiver les documents 10 ans | Représenter le client devant le fisc |
| Proposer une option Premium avec vérification expert-comptable PARTENAIRE | Faire passer ton IA pour un humain expert |

---

## 1. Fondement légal

### 1.1 Pas d'obligation d'expert-comptable en LMNP

**Texte de référence** : Aucune disposition du Code Général des Impôts (CGI) n'impose le recours à un expert-comptable pour les loueurs en meublé non professionnels au régime réel simplifié.

**Confirmation BOFiP** : `BOI-BIC-DECLA-30-60-40` précise que l'obligation porte sur la production d'une comptabilité conforme et d'une liasse fiscale aux formats officiels, mais pas sur la qualité de la personne qui les réalise.

### 1.2 Obligation de télétransmission EDI-TDFC

**Article 1649 quater B quater du CGI** : Les déclarations professionnelles doivent être télétransmises par voie électronique. Pour la liasse 2031/2033, le format est **EDI-TDFC** (Échange de Données Informatisé - Transfert de Données Fiscales et Comptables).

**Conséquence pour BailScan** : Tu DOIS passer par un **partenaire EDI habilité par la DGFiP**. Tu ne peux pas envoyer toi-même les fichiers à la DGFiP sans cette habilitation (procédure d'habilitation = 3-6 mois et convention signée avec la DGFiP).

**Solution courte terme** : Sous-traiter à Edifiscale, NetDeclaration ou ASPOne.fr (~3-10€ par liasse transmise).

### 1.3 Obligation de FEC

**Article A47 A-1 du Livre des Procédures Fiscales** : Le contribuable doit produire un Fichier des Écritures Comptables (FEC) en cas de contrôle, normalisé à **18 colonnes**.

**Solution BailScan** : Ton outil génère le FEC automatiquement à partir de la comptabilité tenue toute l'année.

---

## 2. Risques juridiques & comment les couvrir

### 2.1 Risque "exercice illégal de la profession comptable"

**Le risque** : L'Ordre des Experts-Comptables (OEC) pourrait reprocher à BailScan de faire de l'expertise comptable sans être inscrit.

**Comment l'éviter** :
- ❌ NE JAMAIS écrire "BailScan votre comptable IA" ou "Notre expert IA"
- ✅ Toujours dire "Outil de calcul automatisé" ou "Logiciel de génération"
- ✅ Le client REMPLIT et VALIDE chaque étape — c'est lui qui produit la liasse, BailScan ne fait que l'aider à la calculer
- ✅ Pour l'offre Premium, l'expert-comptable est un **partenaire** distinct (cabinet inscrit à l'OEC), pas un employé BailScan

**Précédent jurisprudence** : Les logiciels de comptabilité (Sage, EBP, Cegid…) vendent depuis 30 ans des outils de génération de liasse fiscale sans être inscrits à l'OEC. La distinction "outil" vs "service de conseil" est bien établie.

### 2.2 Risque "conseil financier non autorisé"

**Le risque** : Article L. 161-1 du Code Monétaire et Financier sur le conseil en investissements financiers.

**Comment l'éviter** :
- Le simulateur d'économie d'impôt présente des **estimations**, pas des recommandations
- Disclaimer obligatoire : "Les calculs sont fournis à titre indicatif et ne constituent pas un conseil fiscal ou patrimonial personnalisé"

### 2.3 Risque "erreur de calcul → redressement fiscal du client"

**Le risque** : Si BailScan génère une liasse erronée et le client est redressé, il peut se retourner contre BailScan.

**Comment se protéger** :
- ✅ CGV claires : "L'utilisateur est seul responsable de l'exactitude des informations transmises à l'administration fiscale"
- ✅ Validation explicite du client avant transmission (case à cocher "Je valide les calculs ci-dessous")
- ✅ Souscription d'une **RC Pro Tech** (chez Hiscox ou AXA, ~600€/an pour 2M€ de couverture)
- ✅ Pour l'offre Premium, c'est la RC Pro de l'expert-comptable partenaire (8 M€) qui s'engage

### 2.4 Risque RGPD

**Données traitées** : SIRET, revenus, patrimoine, situation fiscale (catégorie "sensible").

**Conformité** :
- ✅ Hébergement Supabase en région `eu-west-3` (Paris)
- ✅ Chiffrement AES-256 au repos
- ✅ DPO désigné (peut être toi en tant que solo entrepreneur)
- ✅ Registre des traitements à tenir
- ✅ Sous-traitants RGPD-conformes : Stripe (✓), Anthropic (✓ via API EU), Resend (✓), partenaire EDI (à vérifier au cas par cas)

---

## 3. Disclaimers obligatoires à mettre partout

### 3.1 Sur la page liasse-fiscale.html (✅ déjà fait)

> **Mention légale.** Le service BailScan Liasse Fiscale est un outil technique de génération et de télétransmission de documents fiscaux. Il ne constitue pas un conseil fiscal personnalisé au sens de l'article L. 161-1 du Code Monétaire et Financier. La responsabilité de l'exactitude des informations déclarées incombe à l'utilisateur, qui valide chaque étape avant transmission. L'offre Premium inclut une vérification par un expert-comptable inscrit à l'Ordre des Experts-Comptables, partenaire de BailScan, dont la responsabilité civile professionnelle est engagée à hauteur de 8 M€.

### 3.2 Sur la page de validation avant transmission

Avant la télétransmission, l'utilisateur doit cocher :

> ☐ Je certifie l'exactitude des informations fournies à BailScan et je valide les calculs présentés ci-dessus. Je comprends que je suis seul·e responsable de la déclaration télétransmise à l'administration fiscale.

### 3.3 Dans chaque email transactionnel relatif à la liasse

> Cet email est généré automatiquement par BailScan, outil de calcul fiscal. Il ne constitue pas un conseil personnalisé. En cas de doute, consultez un expert-comptable.

---

## 4. CGV spécifiques service Liasse Fiscale

À ajouter à tes CGV existantes :

### Article X — Service Liasse Fiscale

**X.1 Définition.** Le service "Liasse Fiscale" est un outil logiciel permettant à l'utilisateur de générer automatiquement les formulaires fiscaux liés à la déclaration de revenus de location meublée non professionnelle au régime réel simplifié (formulaires CERFA 2031-SD, 2033-A à G, 2042-C-PRO), ainsi que de les télétransmettre à la Direction Générale des Finances Publiques via un partenaire EDI-TDFC habilité.

**X.2 Deux niveaux de service.** 
- **Liasse Auto IA (99 € TTC)** : Génération automatique par intelligence artificielle, validation par l'utilisateur, télétransmission EDI.
- **Liasse Premium (199 € TTC)** : Génération automatique par intelligence artificielle, **vérification par un expert-comptable partenaire** inscrit à l'Ordre des Experts-Comptables, télétransmission EDI, assistance en cas de contrôle fiscal pendant un an.

**X.3 Responsabilité de l'utilisateur.** L'utilisateur reste seul responsable de l'exactitude des informations qu'il fournit à BailScan et de leur conformité aux règles fiscales applicables. La validation finale avant télétransmission relève de la responsabilité exclusive de l'utilisateur, qui en certifie l'exactitude.

**X.4 Responsabilité de BailScan.** BailScan s'engage à mettre en œuvre les moyens techniques nécessaires pour produire des calculs conformes aux règles fiscales en vigueur. La responsabilité de BailScan ne saurait être engagée au-delà du montant payé par l'utilisateur pour le service. BailScan dispose d'une assurance responsabilité civile professionnelle souscrite auprès de [Compagnie] sous le numéro [N° police].

**X.5 Responsabilité de l'expert-comptable partenaire (Offre Premium).** Pour l'offre Premium, la vérification effectuée par l'expert-comptable partenaire engage sa propre responsabilité civile professionnelle à hauteur de 8 millions d'euros, conformément aux obligations de l'Ordre des Experts-Comptables.

**X.6 Délai de production.**
- Offre Auto IA : génération sous 24h après collecte complète des informations
- Offre Premium : vérification expert sous 14 jours ouvrés

**X.7 Date limite légale.** L'utilisateur reconnaît être informé que la télétransmission de la liasse fiscale doit intervenir avant la date limite annuelle fixée par la DGFiP (généralement mai N+1). BailScan recommande de souscrire au plus tard 30 jours avant cette échéance.

**X.8 Cas non couverts.** L'offre Auto IA n'est pas adaptée aux situations suivantes, pour lesquelles l'offre Premium est recommandée :
- SCI à l'IR ou à l'IS
- Statut LMP (Loueur Meublé Professionnel)
- Première année d'activité avec acquisition récente
- Déficit reportable significatif d'années antérieures
- Activité para-hôtelière

**X.9 Garantie satisfait ou remboursé.** Si BailScan ne peut générer la liasse pour des raisons techniques de son fait, le montant payé est intégralement remboursé. Si l'utilisateur change d'avis dans les 14 jours suivant le paiement (et avant le début de la génération), il bénéficie du droit de rétractation prévu par le Code de la consommation.

**X.10 Conservation.** Les documents générés (liasse, FEC, accusé de réception) sont conservés gratuitement pendant 10 ans dans le coffre-fort numérique de l'utilisateur.

---

## 5. Mentions obligatoires sur le site

À ajouter dans le footer de bailscan.app :

> **BailScan** est un outil de gestion locative édité par **[Raison sociale]**. BailScan n'est pas un cabinet d'expertise comptable. Pour l'offre Liasse Fiscale Premium, la vérification par un expert-comptable est assurée par notre partenaire **[Nom du cabinet]**, inscrit à l'Ordre des Experts-Comptables sous le numéro [N° tableau], dont la responsabilité civile professionnelle est garantie par [Assureur].

---

## 6. Roadmap d'implémentation

### Phase 1 — Lancement (mois 1-3)
- [ ] Souscrire RC Pro Tech (Hiscox, ~600€/an)
- [ ] Signer contrat partenaire EDI (Edifiscale ou NetDeclaration)
- [ ] Identifier 1 cabinet expert-comptable partenaire pour l'offre Premium (rémunération ~80€/dossier)
- [ ] Publier CGV mises à jour
- [ ] Page liasse-fiscale.html (✅ fait)
- [ ] Edge Function `generate-liasse-fiscale` (✅ fait)
- [ ] Edge Function `transmit-liasse-edi` (✅ fait)
- [ ] Workflow de validation utilisateur (à faire — page `valider-liasse.html`)
- [ ] Tests unitaires sur des cas types LMNP

### Phase 2 — Optimisation (mois 4-6)
- [ ] Statistiques sur les liasses produites (taux d'erreur, alertes IA…)
- [ ] Amélioration du prompt Claude basée sur les retours expert-comptable
- [ ] Cas couverts supplémentaires : SCI à l'IR au régime réel
- [ ] Lancement campagne marketing période fiscale (janvier-avril)

### Phase 3 — Scaling (an 2+)
- [ ] Démarche pour devenir partenaire EDI direct (économie ~3-10€ par liasse)
- [ ] Étendre aux LMP, SCI à l'IS, para-hôtelier
- [ ] Marque blanche pour cabinets immobiliers / gestionnaires

---

## 7. Business model détaillé

### Coûts unitaires par liasse

| Poste | Auto IA (99 €) | Premium (199 €) |
|---|---|---|
| Coût IA Claude API | ~3 € | ~3 € |
| Stripe (1,4% + 0,25€) | ~1,6 € | ~3 € |
| Partenaire EDI | ~5 € | ~5 € |
| Expert-comptable partenaire | — | ~80 € |
| Hébergement / Storage | ~1 € | ~1 € |
| **COÛT TOTAL** | **~10,60 €** | **~92 €** |
| **MARGE NETTE** | **~88,40 €** | **~107 €** |
| **MARGE %** | **89%** | **54%** |

### Projection 12 mois

Hypothèse conservative : 1% des LMNP au réel passent par BailScan.

Marché total LMNP au réel = ~800 000 bailleurs.
Cible BailScan an 1 = 200 liasses
Cible BailScan an 2 = 1 000 liasses
Cible BailScan an 3 = 3 000 liasses

**Répartition prévisible** : 60% Auto IA / 40% Premium

**Revenu an 1** : (120 × 99 €) + (80 × 199 €) = 11 880 + 15 920 = **27 800 €**
**Revenu an 2** : (600 × 99 €) + (400 × 199 €) = 59 400 + 79 600 = **139 000 €**
**Revenu an 3** : (1 800 × 99 €) + (1 200 × 199 €) = 178 200 + 238 800 = **417 000 €**

**Marge nette an 3** : ~70% = **291 900 €**

C'est ton produit le plus rentable de tout BailScan, avec une saisonnalité concentrée en Q1.

---

## 8. Checklist conformité avant lancement

**Légal et administratif :**
- [ ] CGV mises à jour avec article spécifique
- [ ] Mentions légales footer
- [ ] DPO désigné (peut être toi)
- [ ] Registre des traitements RGPD
- [ ] RC Pro Tech souscrite (600€/an)

**Partenariats :**
- [ ] Contrat signé partenaire EDI
- [ ] Contrat signé cabinet expert-comptable partenaire
- [ ] Compte Anthropic API (paiement à l'usage)
- [ ] Compte Resend pour emails transactionnels

**Technique :**
- [ ] Schema Supabase déployé (`supabase-schema-liasse.sql`)
- [ ] Edge Functions déployées (`generate-liasse-fiscale`, `transmit-liasse-edi`)
- [ ] Page liasse-fiscale.html en production
- [ ] Stripe products configurés (99€ et 199€)
- [ ] Webhooks Stripe testés

**Communication :**
- [ ] Page de bienvenue après achat
- [ ] Workflow de validation utilisateur
- [ ] Email transactionnels (paiement, génération, validation, transmission, ARF)
- [ ] FAQ enrichie
- [ ] Article SEO blog "Liasse fiscale LMNP : guide 2026"

---

**Document rédigé le 22 mai 2026 — À actualiser annuellement.**

*Note : Ce document est un cadre de travail, pas un avis juridique. Pour la mise en production réelle, valider avec un avocat spécialisé en droit fiscal (compter 500-1500 € pour une consultation initiale + revue CGV).*
