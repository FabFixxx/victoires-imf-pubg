// Changelog embarqué directement dans l'appli (généré depuis les releases GitHub
// le 19/09/2026 - le repo est public, mais l'appel API en direct dépend du réseau
// et de la disponibilité de GitHub à l'ouverture de l'écran). À compléter à chaque
// nouvelle release.
export interface ChangelogEntry {
  version: string;
  date: string;
  notes: string;
}

export const CHANGELOG: ChangelogEntry[] = [
  {
    version: 'v1.5.1',
    date: '19 septembre 2026',
    notes: "🆕 Nouveauté\n" +
      "- La notification \"3 joueurs dispo\" indique maintenant qui manque (ex: \"plus qu'un (Nicotom) pour valider !\")\n\n" +
      "⚡ Corrections\n" +
      "- Grande bande vide en bas de tous les écrans sauf Victoires\n\n" +
      "🧹 Nettoyage\n" +
      "- Le build de l'APK ne dépend plus d'Expo/EAS du tout (compilation et signature locales)\n" +
      "- Le changelog est maintenant embarqué directement dans l'appli (plus de dépendance réseau à l'ouverture de l'écran)",
  },
  {
    version: 'v1.5.0',
    date: '19 septembre 2026',
    notes: "🆕 Nouveauté\n" +
      "- Thème clair, en plus du thème sombre habituel (qui reste celui par défaut) : réglable dans Réglages → Apparence, avec un choix \"Système\" qui suit automatiquement le thème du téléphone",
  },
  {
    version: 'v1.4.7',
    date: '8 septembre 2026',
    notes: "🆕 Nouveauté\n" +
      "- Notification \"Nouvelle possibilité de session\" envoyée dès 3 votes sur une date (au lieu d'attendre le 4e), quand aucune session n'est encore retenue cette semaine-là\n" +
      "\n" +
      "🔒 Sécurité\n" +
      "- Renforcement de la sécurité côté serveur (accès aux données et aux notifications push)\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Le calendrier n'affiche plus les dates passées dans \"Meilleures dates cette semaine\"\n" +
      "- La notif \"3 votes\" pouvait se redéclencher à tort quand un joueur retirait puis remettait son vote sur la même date\n" +
      "- Formulation et emoji ajustés sur la notif \"3 votes\"",
  },
  {
    version: 'v1.4.6',
    date: '30 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- L'arme utilisée pour le dernier kill s'affiche maintenant à côté du finisher (ex: \"FabFix (M416)\"), sur l'accueil, les stats et la page Victoires\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Le total de victoires en haut de la page Victoires pouvait afficher un chiffre faux pendant environ 1 seconde en changeant de saison\n" +
      "- Tableau des joueurs (page Victoires) : colonnes harmonisées, \"Joueurs\" aligné à gauche, Kills/Assists/Dommages alignés à droite avec leurs en-têtes bien positionnés au-dessus\n" +
      "- Icône du dernier kill mal positionnée dans \"Matchs récents IMF\"\n" +
      "- Renommage \"Joueur\" vers \"Joueurs\"",
  },
  {
    version: 'v1.4.5',
    date: '25 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Page Victoires : total de victoires de la saison affiché en haut, nouveau bloc Matchs/Frags moy./Dmg moy./% Vict., et la liste des cartes gagnées n'est plus limitée à 5\n" +
      "- Accueil : \"TOP CARTES GAGNÉES\" devient \"TOP 5 CARTES GAGNÉES\"\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- \"Win Rate\" renommé en \"% Vict.\" partout ; les victoires manuelles ne faussent plus le calcul du % de victoires (elles ne comptaient déjà pas dans les frags/dmg moyens)\n" +
      "- Tri des cartes gagnées corrigé : nombre de victoires en priorité, ordre alphabétique en cas d'égalité\n" +
      "- \"Jamais synchronisé\" ne s'affiche plus à tort sur un appareil qui n'a jamais lui-même déclenché de sync manuelle (on lit maintenant la vraie dernière synchro côté serveur)",
  },
  {
    version: 'v1.4.4',
    date: '24 août 2026',
    notes: "⚡ Corrections\n" +
      "- Scroll enfin corrigé dans les fenêtres notifications / historique des versions / victoires manuelles / logs de synchronisation (le fix de la 1.4.3 était insuffisant — cause racine identifiée cette fois : conflit de gestion tactile Android propre aux fenêtres modales)\n" +
      "- Les boutons \"Supprimer\" et \"Fermer\" ne chevauchent plus la barre de navigation Android en bas de l'écran",
  },
  {
    version: 'v1.4.3',
    date: '24 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Boutons \"Supprimer\" et \"Fermer\" dans la fenêtre des notifications, pour vider son historique personnel\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Le scroll ne fonctionnait pas de façon fiable dans certaines fenêtres (notifications, historique des versions, victoires manuelles, logs de synchronisation)\n" +
      "- Diverses corrections de fiabilité : synchronisation PUBG, dates de saison, notifications de disponibilité",
  },
  {
    version: 'v1.4.2',
    date: '20 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Navigation par mois sur la page d'accueil : flèches ‹ › autour du titre du mois pour consulter les statistiques des mois précédents",
  },
  {
    version: 'v1.4.1',
    date: '20 août 2026',
    notes: "⚡ Corrections\n" +
      "- Scroll bloqué dans 4 fenêtres : victoires manuelles, historique des versions, notifications, logs de synchro\n" +
      "- Les syncs automatiques (cron 3h) apparaissent maintenant correctement comme \"Auto\" dans les logs (et non \"Manuel\")",
  },
  {
    version: 'v1.4.0',
    date: '20 août 2026',
    notes: "🔄 Synchronisation\n" +
      "- La sync PUBG tourne désormais côté serveur chaque nuit à 3h — la clé API n'est plus dans l'app\n" +
      "- Historique des synchronisations accessible depuis Réglages (date, durée, statut Auto/Manuel)\n" +
      "- Sync manuelle toujours disponible via les boutons de l'app\n" +
      "- Temps de sync réduit de ~13s à ~2s quand tout est déjà à jour\n" +
      "\n" +
      "🧹 Nettoyage\n" +
      "- Suppression de \"Tester la connexion\" et de la sync automatique au démarrage\n" +
      "- Suppression du code PUBG API côté client (devenu inutile)",
  },
  {
    version: 'v1.3.2',
    date: '19 août 2026',
    notes: "⚡ Corrections\n" +
      "- Victoires manuelles invisibles sur l'APK : la liste se repliait à hauteur zéro sur Android (les données étaient bien là, juste cachées)\n" +
      "- Sélecteur de joueur : chaque joueur affiche maintenant son avatar dans sa propre couleur (jaune, orange, bleu, vert)",
  },
  {
    version: 'v1.3.1',
    date: '19 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Toutes les fenêtres de l'app (victoires, saisons, changement de joueur, logs, diagnostic connexion, etc.) se ferment maintenant en tapant en dehors, comme la fenêtre des notifications\n" +
      "- Dans les tableaux \"meilleures dates\" du calendrier, seules les dates avec au moins 3 votes apparaissent désormais\n" +
      "\n" +
      "🧹 Nettoyage\n" +
      "- Renommé \"Logs de sync\" en \"Logs de synchronisation\"\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Impossible de retenir ou désélectionner une date déjà passée dans le calendrier\n" +
      "- Corrigé un faux-positif d'erreur lors de la synchronisation (course sur le cache des matchs)\n" +
      "- Plusieurs correctifs d'affichage sur le web mobile : bouton \"Fermer\" invisible sur la modale diagnostic, fenêtres tronquées en largeur/hauteur, bouton \"Ajouter une victoire\" mal positionné\n" +
      "- Police de la liste des notifications alignée sur celle des logs de synchronisation",
  },
  {
    version: 'v1.3.0',
    date: '16 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Nouvelle notification \"Session annulée !\" : si une session retenue tombe sous 4 joueurs disponibles, ou si quelqu'un désélectionne manuellement la date retenue, tout le monde est prévenu — le message s'adapte selon le cas (vote retiré ou juste désélectionnée)\n" +
      "- Nouvelle page \"Notifications\" (icône cloche sur l'accueil) : consulte tes dernières notifications reçues, avec une pastille rouge sur la cloche et un badge sur l'icône de l'app tant qu'il y a du non-lu\n" +
      "- Taper sur une notification reçue ouvre directement l'app sur cette nouvelle page\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Corrigé un bug qui empêchait parfois la notif \"Session annulée\" de partir (l'app et le serveur essayaient tous les deux de nettoyer la même donnée, et l'app était plus rapide — le serveur ne détectait alors plus rien à signaler)\n" +
      "- Le statut lu/non-lu des notifications est maintenant fiable et suivi par joueur — il survit à une réinstallation de l'app (avant, tout redevenait \"non lu\" à chaque réinstall)\n" +
      "- Diverses corrections de fiabilité sur le système de notifications (ordre de traitement, badge qui se vidait trop tôt, comptage du non-lu)",
  },
  {
    version: 'v1.2.0',
    date: '15 août 2026',
    notes: "🆕 Nouveauté\n" +
      "- Possibilité d'avoir 2 sessions de jeu confirmées la même semaine (ex: vendredi ET lundi) — notif \"Nouvelle possibilité de session\" quand une 2e date atteint 4 dispos\n" +
      "- Nouveau système de sessions \"retenues\" : tape sur une date à 4/4 pour la marquer RETENUE (et inversement) — la notif \"Ce soir on joue\" ne part que sur les jours retenus\n" +
      "- Nouveaux badges couleur sur le calendrier : orange (3/4), jaune (4/4), vert (RETENUE)\n" +
      "- Les notifications de dispo attendent désormais un peu (jusqu'à 1h) avant de partir, pour laisser le temps à tout le monde de finir de voter et éviter les notifs contradictoires à la suite\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Plusieurs décalages de date/heure liés au fuseau horaire corrigés (victoires, saisons, dates affichées) — impactait surtout les joueurs à l'étranger\n" +
      "- Une session retenue qui perdait un vote restait affichée comme confirmée sans pouvoir être corrigée — réparé\n" +
      "- Diverses corrections de fiabilité (petits bugs d'affichage liés à des chargements réseau qui revenaient dans le désordre, gestion des erreurs réseau silencieuses)",
  },
  {
    version: 'v1.1.0',
    date: '17 juillet 2026',
    notes: "⚡ Corrections\n" +
      "- 🌍 Corrige un décalage d'un jour dans le calcul de \"cette semaine\" pour les joueurs dans un fuseau horaire éloigné de la France (ex: Amérique du Nord) — les disponibilités étaient rangées sous une semaine différente de celle des autres joueurs, les rendant invisibles mutuellement",
  },
  {
    version: 'v1.0.9',
    date: '6 juillet 2026',
    notes: "🆕 Nouveauté\n" +
      "- 🏆 Top cartes gagnées et top finisher ajoutés en haut de l'onglet Victoires (comme sur l'accueil), pour la saison sélectionnée\n" +
      "- 🎯 Zone bleue masquée du classement des finishers tant qu'elle n'a aucun kill à son actif\n" +
      "- 🔔 Textes de notifications simplifiés (la carte jouée est toujours connue désormais)\n" +
      "- 📅 Le rappel de dispo du dimanche vérifie aussi la semaine suivante (comme le samedi après 18h)\n" +
      "\n" +
      "🧹 Nettoyage\n" +
      "- Suppression d'anciens rappels de dispo en double (crons Vercel obsolètes)",
  },
  {
    version: 'v1.0.8',
    date: '2 juillet 2026',
    notes: "🆕 Nouveauté\n" +
      "- **Swipe calendrier** : le swipe gauche/droite change maintenant l'onglet sans modifier le mois affiché. La navigation par flèches fonctionne toujours normalement.\n" +
      "- **Notifications push iOS** : correction de la gestion des clés VAPID (re-souscription automatique si la clé change).\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- **Swipe page Victoires** : le swipe était cassé sur cet onglet, c'est corrigé.\n" +
      "- Swipe désactivé sur navigateur web classique, actif uniquement sur APK et PWA installée.\n" +
      "- Correction d'une régression sur la page Victoires qui ne répondait plus au swipe.",
  },
  {
    version: 'v1.0.7',
    date: '2 juillet 2026',
    notes: "🆕 Nouveauté\n" +
      "### 🔵 Zone bleue\n" +
      "- Détection automatique quand le dernier ennemi est tué par la zone bleue\n" +
      "- Le finisher affiché est \"Zone bleue\" (en bleu) au lieu d'un joueur\n" +
      "- Ajout d'une 5ème ligne dans le Top Finisher avec une icône éclair ⚡ bleue\n" +
      "\n" +
      "### 📊 Page Statistiques\n" +
      "- Dates de début et fin de saison affichées sous le sélecteur de saison\n" +
      "- Harmonisation de la taille des boutons saison entre les onglets Stats et Victoires\n" +
      "\n" +
      "### 🌐 Notifications web (PWA iOS)\n" +
      "- Support des notifications push pour les utilisateurs iOS via le site web\n" +
      "- Logs de diagnostic pour faciliter le débogage des souscriptions\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- Icône de notification Android corrigée (silhouette blanche sur fond transparent), couleur de badge orange IMF conservée",
  },
  {
    version: 'v1.0.6',
    date: '1 juillet 2026',
    notes: "🆕 Nouveauté\n" +
      "- 📲 Token push enregistré automatiquement à l'ouverture de l'app\n" +
      "- 🍎 Support des notifications push pour iOS (site web ajouté à l'écran d'accueil)\n" +
      "- ❌ Rappel dispo : \"Tu n'as pas encore renseigné tes dispos pour la semaine prochaine !\"\n" +
      "- ✅ Notif quand les 4 ont répondu avec la ou les meilleures dates\n" +
      "- 🎮 Notif le jour de la session : \"N'oublies pas que ce soir on gagne ! 🏆\"\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- 🔔 Correction des notifications push Android : le token n'était jamais enregistré au démarrage",
  },
  {
    version: 'v1.0.5',
    date: '1 juillet 2026',
    notes: "🆕 Nouveauté\n" +
      "### Interface\n" +
      "- 🏠 Réorganisation page d'accueil : Saison IMF → Top cartes → Mois en cours → Dernier match → Dernière victoire → Top finisher → Matchs récents\n" +
      "- 📅 Bouton \"Je ne suis pas dispo\" ajouté pour la semaine en cours (onglet Session)\n" +
      "- 👆 Navigation par swipe gauche/droite entre les onglets\n" +
      "- 🗓️ Tableau récapitulatif des dispos de la semaine en cours (onglet Session)\n" +
      "- 📆 Format des dates : mois complets, sans abréviation ni répétition si même mois\n" +
      "- 🌐 Titre de page \"Victoires IMF PUBG\" dans le navigateur\n" +
      "\n" +
      "### Notifications\n" +
      "- 🔔 Enregistrement automatique du token push au démarrage\n" +
      "- 🌙 Notification récap victoires de la nuit (heure aléatoire 10h–16h)\n" +
      "- 🎮 Notification le jour de la session : \"Ce soir on gagne !\"\n" +
      "- ⏰ Rappel de disponibilités hebdomadaire (cron automatique)\n" +
      "- 🍎 Support des notifications push web sur iOS (PWA)\n" +
      "\n" +
      "### Réglages\n" +
      "- 📋 Logs de synchronisation visibles dans les réglages\n" +
      "- 🗑️ Bouton pour effacer les logs (avec confirmation)\n" +
      "\n" +
      "🔄 Synchronisation\n" +
      "- 🌐 Appels API PUBG directs sur APK, proxy Vercel uniquement sur web (évite CORS)\n" +
      "- ⛔ Arrêt automatique de la sync en cas de rate limit consécutifs\n" +
      "- 💬 Messages de sync plus précis (échec vs données à jour)\n" +
      "\n" +
      "🧹 Nettoyage\n" +
      "- 🧹 Normalisation des comptes PUBG (UUID → nom canonique)\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- 🛡️ Détection des erreurs Supabase silencieuses",
  },
  {
    version: 'v1.0.4',
    date: '17 juin 2026',
    notes: "🆕 Nouveauté\n" +
      "- 🎨 Nouvelles couleurs pour les pastilles joueurs\n" +
      "- ✏️ Bouton pour modifier une victoire manuelle\n" +
      "- 🌐 Tous les popups fonctionnent désormais sur le site web\n" +
      "- 🚫 Bouton \"Je ne suis pas dispo\" : affiche les dates exactes de la semaine\n" +
      "- 🔟 Matchs récents limités à 10 (accueil + stats)\n" +
      "- 📅 Format de date JJ/MM/AAAA dans les saisies\n" +
      "- 🔡 Mois en minuscule et suppression du \"à\" dans les dates de matchs\n" +
      "\n" +
      "🔒 Sécurité\n" +
      "- 🗑️ Suppression du bouton supprimer une saison (sécurité)\n" +
      "\n" +
      "⚡ Corrections\n" +
      "- ✅ Le statut passe bien à \"A répondu\" après avoir cliqué \"Aucune dispo\"\n" +
      "- 📋 Cliquer un jour de la semaine prochaine retire automatiquement \"Aucune dispo\"",
  },
  {
    version: 'v1.0.3',
    date: '16 juin 2026',
    notes: "🆕 Nouveauté\n" +
      "- 📅 Page Sessions entièrement refaite : meilleures dates cette semaine et semaine prochaine\n" +
      "- ✅ Statut \"A répondu / En attente\" par joueur pour la semaine prochaine\n" +
      "- 🚫 Bouton \"Je ne suis pas dispo\" pour signaler une semaine sans disponibilité\n" +
      "- ⭐ Date retenue : sélectionnable manuellement quand plusieurs dates ont 4 votes\n" +
      "- 🔔 Rappel quotidien (dim–ven 17h) uniquement aux joueurs n'ayant pas encore répondu\n" +
      "- 🎮 Notification le soir de la session à 18h sur la date retenue\n" +
      "- ⚙️ Réglages notifications dans les paramètres (heure rappel + heure soir de session)",
  },
  {
    version: 'v1.0.2',
    date: '15 juin 2026',
    notes: "🆕 Nouveauté\n" +
      "- 🔔 Notifications serveur : fonctionne aussi depuis le site web iOS\n" +
      "- 📅 Rappel dimanche 19h pour les utilisateurs iOS (PWA)\n" +
      "- 📋 Historique des versions dans les paramètres (appuie sur le numéro de version)\n" +
      "\n" +
      "🔄 Synchronisation\n" +
      "- ⚡ Synchronisation 3x plus rapide (un seul appel API au lieu de 4)",
  },
  {
    version: 'v1.0.1',
    date: '15 juin 2026',
    notes: "🆕 Nouveauté\n" +
      "- 🗓️ Calendrier : meilleures dates toujours visibles, déplacées au-dessus de la légende\n" +
      "- 🎮 Fiche de match : total kills / assists / dégâts de toute l'équipe\n" +
      "- ⚙️ Paramètres : modifier la date de début de saison\n" +
      "- 🆙 Mise à jour : popup au lancement si une nouvelle version est disponible\n" +
      "- 🏗️ Build APK automatique via GitHub Actions\n" +
      "\n" +
      "🔄 Synchronisation\n" +
      "- Sync auto : ignorée si dernière sync < 24h",
  },
  {
    version: 'v1.0.0',
    date: '15 juin 2026',
    notes: "🆕 Nouveauté\n" +
      "- 🏆 Suivi des victoires IMF en FPP\n" +
      "- 📊 Stats par joueur (K/D, dégâts, assists)\n" +
      "- 🗓️ Calendrier de disponibilités\n" +
      "- 🔔 Notifications push (rappel dimanche + session confirmée)\n" +
      "\n" +
      "🔄 Synchronisation\n" +
      "- Synchronisation avec l'API PUBG officielle",
  },
];
