/**
 * COGNIZANCE ARTS FEST — SUPABASE CLIENT & API SERVICE
 */
(() => {
  'use strict';

  let client = null;

  function isSupabaseConfigured() {
    const config = window.COGNIZANCE_CONFIG;
    return !!(
      window.supabase &&
      config &&
      typeof config.supabaseUrl === 'string' &&
      config.supabaseUrl.startsWith('https://') &&
      !config.supabaseUrl.includes('YOUR_PROJECT') &&
      typeof config.supabaseAnonKey === 'string' &&
      config.supabaseAnonKey.length > 20
    );
  }

  function getClient() {
    if (!client && isSupabaseConfigured()) {
      const config = window.COGNIZANCE_CONFIG;
      client = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);
    }
    return client;
  }

  /**
   * Parse various YouTube URL formats (standard, short, embed, shorts)
   * and generate metadata including video ID and CDN thumbnails.
   */
  function extractYouTubeData(url) {
    if (!url || typeof url !== 'string') return null;
    const trimmed = url.trim();

    // Regex matching standard watch, short youtu.be, embed, and shorts
    const regExp = /(?:youtube\.com\/(?:[^\/]+\/.+\/|(?:v|e(?:mbed)?)\/|.*[?&]v=|shorts\/)|youtu\.be\/)([^"&?\/\s]{11})/i;
    const match = trimmed.match(regExp);

    if (match && match[1]) {
      const videoId = match[1];
      return {
        videoId: videoId,
        cleanUrl: `https://youtu.be/${videoId}`,
        embedUrl: `https://www.youtube.com/embed/${videoId}`,
        thumbnailUrl: `https://img.youtube.com/vi/${videoId}/maxresdefault.jpg`,
        fallbackThumbnailUrl: `https://img.youtube.com/vi/${videoId}/hqdefault.jpg`
      };
    }
    return null;
  }

  /**
   * Fetch all photos sorted by display_order ASC, created_at DESC
   */
  async function fetchGalleryPhotos() {
    const db = getClient();
    if (!db) return null;

    try {
      const { data, error } = await db
        .from('gallery_photos')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Cognizance Supabase] Error fetching gallery photos:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[Cognizance Supabase] Unexpected error fetching photos:', err);
      return null;
    }
  }

  /**
   * Upload an image file to Supabase Storage and record its metadata in gallery_photos table
   */
  async function uploadGalleryPhoto(file, metadata = {}) {
    const db = getClient();
    if (!db) throw new Error('Supabase is not configured yet. Please update assets/js/supabase-config.js');

    const config = window.COGNIZANCE_CONFIG;
    const bucket = config.storageBucket || 'gallery-photos';

    // Unique file name to prevent collision
    const timestamp = Date.now();
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const storagePath = `photos/${timestamp}_${cleanName}`;

    // 1. Upload file to Storage Bucket
    const { data: uploadData, error: uploadError } = await db.storage
      .from(bucket)
      .upload(storagePath, file, {
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      throw new Error(`Storage upload failed: ${uploadError.message}`);
    }

    // 2. Obtain Public URL
    const { data: publicUrlData } = db.storage
      .from(bucket)
      .getPublicUrl(storagePath);

    const imageUrl = publicUrlData.publicUrl;

    // 3. Insert record into database table
    const { data: insertData, error: insertError } = await db
      .from('gallery_photos')
      .insert([{
        image_url: imageUrl,
        storage_path: storagePath,
        alt_text: metadata.altText || file.name.replace(/\.[^/.]+$/, ''),
        width: metadata.width || 1024,
        height: metadata.height || 682,
        display_order: metadata.displayOrder || 0
      }])
      .select()
      .single();

    if (insertError) {
      // Cleanup uploaded file if DB insertion failed
      await db.storage.from(bucket).remove([storagePath]);
      throw new Error(`Database record creation failed: ${insertError.message}`);
    }

    return insertData;
  }

  /**
   * Delete a photo record and its corresponding storage file
   */
  async function deleteGalleryPhoto(id, storagePath) {
    const db = getClient();
    if (!db) throw new Error('Supabase is not configured.');

    const config = window.COGNIZANCE_CONFIG;
    const bucket = config.storageBucket || 'gallery-photos';

    // 1. Delete DB record
    const { error: dbError } = await db
      .from('gallery_photos')
      .delete()
      .eq('id', id);

    if (dbError) throw new Error(`Failed to delete record: ${dbError.message}`);

    // 2. Delete storage file if path exists
    if (storagePath) {
      const { error: storageError } = await db.storage
        .from(bucket)
        .remove([storagePath]);

      if (storageError) {
        console.warn('[Cognizance Supabase] Storage file cleanup warning:', storageError.message);
      }
    }

    return true;
  }

  /**
   * Fetch all videos sorted by display_order ASC, created_at DESC
   */
  async function fetchVideos() {
    const db = getClient();
    if (!db) return null;

    try {
      const { data, error } = await db
        .from('videos')
        .select('*')
        .order('display_order', { ascending: true })
        .order('created_at', { ascending: false });

      if (error) {
        console.warn('[Cognizance Supabase] Error fetching videos:', error.message);
        return null;
      }
      return data;
    } catch (err) {
      console.warn('[Cognizance Supabase] Unexpected error fetching videos:', err);
      return null;
    }
  }

  /**
   * Add a new YouTube video
   */
  async function addYouTubeVideo({ url, title, displayOrder = 0 }) {
    const db = getClient();
    if (!db) throw new Error('Supabase is not configured.');

    const ytData = extractYouTubeData(url);
    if (!ytData) {
      throw new Error('Invalid YouTube URL. Please provide a valid YouTube link (e.g. https://youtu.be/... or https://youtube.com/watch?v=...)');
    }

    const videoTitle = title && title.trim() ? title.trim() : `Cognizance Highlight ${ytData.videoId}`;

    const { data, error } = await db
      .from('videos')
      .insert([{
        youtube_url: ytData.cleanUrl,
        video_id: ytData.videoId,
        title: videoTitle,
        thumbnail_url: ytData.thumbnailUrl,
        display_order: displayOrder
      }])
      .select()
      .single();

    if (error) {
      throw new Error(`Failed to save video: ${error.message}`);
    }

    return data;
  }

  /**
   * Delete a video by ID
   */
  async function deleteVideo(id) {
    const db = getClient();
    if (!db) throw new Error('Supabase is not configured.');

    const { error } = await db
      .from('videos')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete video: ${error.message}`);
    return true;
  }

  // Export functions globally
  window.CognizanceAPI = {
    isSupabaseConfigured,
    getClient,
    extractYouTubeData,
    fetchGalleryPhotos,
    uploadGalleryPhoto,
    deleteGalleryPhoto,
    fetchVideos,
    addYouTubeVideo,
    deleteVideo
  };
})();
