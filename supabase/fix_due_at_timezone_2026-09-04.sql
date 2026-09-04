-- Correction ponctuelle des données — appliquée le 2026-09-04. NE PAS
-- REJOUER (chaque exécution décale à nouveau les échéances).
--
-- Contexte : jusqu'au 2026-09-04, l'appli ne gérait pas les fuseaux. Une
-- échéance saisie « 18:00 » (heure de Paris, dans l'esprit de la famille)
-- était stockée telle quelle comme 18:00 UTC — soit 20:00 à Paris l'été.
-- L'affichage étant lui aussi fait en UTC, l'erreur ne se voyait pas dans
-- l'appli, mais le lien « Ajouter à Google Agenda » (voir doc §6.13), qui
-- traite due_at comme un vrai instant UTC, tombait 1 à 2 h trop tard.
--
-- Le correctif applicatif (src/lib/timezone.ts) interprète désormais la
-- saisie comme une heure de Paris et affiche tout en heure de Paris. Ce
-- script réaligne les échéances DÉJÀ en base sur la même convention :
-- « la valeur mur-horloge (lue en UTC) était en fait une heure de Paris ».
--
--   ex. 2026-09-06 18:00:00+00  ->  2026-09-06 16:00:00+00
--       (affiché « 20:00 » avant, « 18:00 » après — CEST, été)
--       2026-11-02 10:00:00+00  ->  2026-11-02 09:00:00+00
--       (CET, hiver : -1 h ; PostgreSQL applique le bon décalage par date)
--
-- 12 lignes concernées au moment de l'exécution. Deux à re-vérifier
-- ensuite dans l'appli (heure d'origine incertaine) : « Boucler le chantier
-- Reno 2024 » et « Créer une application de gestion de bdtheque ».

update public.tasks
set due_at = (due_at at time zone 'UTC') at time zone 'Europe/Paris'
where due_at is not null;
