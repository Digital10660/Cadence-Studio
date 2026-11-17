-- ==============================================================================
-- SCHEMA SUPABASE POUR CADENCE STUDIO
-- (Optionnel, pour la future synchro en ligne — Cadence fonctionne déjà hors ligne avec data/cadence.db)
-- Exécute ce script dans l'éditeur SQL de ton tableau de bord Supabase :
-- Dashboard Supabase > SQL Editor > New query > Coller et cliquer sur "Run"
-- ==============================================================================

-- 1. Table des projets vidéo
CREATE TABLE IF NOT EXISTS public.projects (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL DEFAULT 'Nouveau projet',
    data JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Index pour charger les projets rapidement
CREATE INDEX IF NOT EXISTS idx_projects_user_id ON public.projects(user_id);
CREATE INDEX IF NOT EXISTS idx_projects_updated_at ON public.projects(updated_at DESC);

-- 2. Table des kits de marque (Brands)
CREATE TABLE IF NOT EXISTS public.brands (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    primary_color TEXT DEFAULT '#FF5A1F',
    accent_color TEXT DEFAULT '#FFD83D',
    ink_color TEXT DEFAULT '#0E0E10',
    light_color TEXT DEFAULT '#F6F4F0',
    font TEXT DEFAULT 'Inter Tight',
    display_font TEXT DEFAULT 'Inter Tight',
    serif_font TEXT DEFAULT 'Instrument Serif',
    caps_font TEXT DEFAULT 'Barlow Condensed',
    logo_url TEXT,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Table des styles personnalisés de l'utilisateur
CREATE TABLE IF NOT EXISTS public.user_styles (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id UUID NOT NULL DEFAULT auth.uid() REFERENCES auth.users(id) ON DELETE CASCADE,
    name TEXT NOT NULL,
    settings JSONB NOT NULL DEFAULT '{}'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 4. Configuration de la sécurité (Row Level Security - RLS)
-- Chaque utilisateur ne voit et ne modifie que ses propres projets
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.brands ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_styles ENABLE ROW LEVEL SECURITY;

-- Politiques de sécurité pour les projets
CREATE POLICY "Les utilisateurs peuvent voir leurs propres projets"
    ON public.projects FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent créer leurs projets"
    ON public.projects FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent modifier leurs projets"
    ON public.projects FOR UPDATE
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Les utilisateurs peuvent supprimer leurs projets"
    ON public.projects FOR DELETE
    USING (auth.uid() = user_id);

-- Politiques de sécurité pour les marques
CREATE POLICY "Gestion des marques par utilisateur"
    ON public.brands FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- Politiques de sécurité pour les styles
CREATE POLICY "Gestion des styles par utilisateur"
    ON public.user_styles FOR ALL
    USING (auth.uid() = user_id) WITH CHECK (auth.uid() = user_id);

-- 5. Stockage des vidéos : buckets PRIVÉS, chaque utilisateur n'accède qu'à son dossier <user_id>/...
INSERT INTO storage.buckets (id, name, public)
VALUES
    ('videos', 'videos', false),
    ('exports', 'exports', false)
ON CONFLICT (id) DO UPDATE SET public = false;

CREATE POLICY "Lecture de ses propres fichiers"
    ON storage.objects FOR SELECT TO authenticated
    USING (bucket_id IN ('videos', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Envoi dans son propre dossier"
    ON storage.objects FOR INSERT TO authenticated
    WITH CHECK (bucket_id IN ('videos', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Mise à jour de ses propres fichiers"
    ON storage.objects FOR UPDATE TO authenticated
    USING (bucket_id IN ('videos', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);

CREATE POLICY "Suppression de ses propres fichiers"
    ON storage.objects FOR DELETE TO authenticated
    USING (bucket_id IN ('videos', 'exports') AND (storage.foldername(name))[1] = auth.uid()::text);
