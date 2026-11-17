/**
 * Configuration Supabase pour Cadence Studio
 * Remplace les valeurs ci-dessous par celles de ton projet Supabase :
 * Dashboard Supabase > Project Settings > API
 */

export const SUPABASE_URL = "https://TON_PROJET.supabase.co";
export const SUPABASE_ANON_KEY = "TON_ANON_KEY";

// Initialisation du client Supabase via la bibliothèque officielle CDN
export const supabase = window.supabase 
  ? window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY)
  : null;

/**
 * Service pour gérer les projets dans Supabase
 */
export const ProjectService = {
  // Récupérer la liste des projets
  async listProjects() {
    if (!supabase) return [];
    const { data, error } = await supabase
      .from('projects')
      .select('id, name, updated_at, data')
      .order('updated_at', { ascending: false });
    
    if (error) {
      console.error('Erreur chargement projets:', error);
      return [];
    }
    return data.map(p => ({
      id: p.id,
      name: p.name,
      updated: new Date(p.updated_at).getTime(),
      thumb: p.data?.main?.url || null
    }));
  },

  // Récupérer un projet spécifique
  async getProject(id) {
    if (!supabase) return null;
    const { data, error } = await supabase
      .from('projects')
      .select('data')
      .eq('id', id)
      .single();
    
    if (error) {
      console.error('Erreur projet:', error);
      return null;
    }
    return data?.data || null;
  },

  // Sauvegarder un projet
  async saveProject(id, projectData) {
    if (!supabase) return false;
    const { error } = await supabase
      .from('projects')
      .upsert({
        id: id,
        name: projectData.name || 'Projet sans titre',
        data: projectData,
        updated_at: new Date().toISOString()
      });
    
    if (error) {
      console.error('Erreur sauvegarde projet:', error);
      return false;
    }
    return true;
  },

  // Uploader une vidéo vers Supabase Storage
  async uploadVideo(file) {
    if (!supabase) return null;
    const fileExt = file.name.split('.').pop();
    const fileName = `${Date.now()}_${Math.random().toString(36).substring(2, 9)}.${fileExt}`;
    const filePath = `uploads/${fileName}`;

    const { data, error } = await supabase.storage
      .from('videos')
      .upload(filePath, file);

    if (error) {
      console.error('Erreur upload vidéo:', error);
      throw error;
    }

    // Récupérer l'URL publique
    const { data: urlData } = supabase.storage
      .from('videos')
      .getPublicUrl(filePath);

    return {
      file: fileName,
      url: urlData.publicUrl,
      name: file.name
    };
  }
};
