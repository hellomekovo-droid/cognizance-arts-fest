-- ==============================================================================
-- COGNIZANCE ARTS FEST — SUPABASE DATABASE & STORAGE INITIALIZATION SCRIPT
-- ==============================================================================
-- Run this script in your Supabase SQL Editor (Dashboard -> SQL Editor -> New Query)
-- ==============================================================================

-- 1. Create table for festival gallery photos
CREATE TABLE IF NOT EXISTS public.gallery_photos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    image_url TEXT NOT NULL,
    storage_path TEXT NOT NULL DEFAULT '',
    alt_text TEXT DEFAULT '',
    width INTEGER DEFAULT 1024,
    height INTEGER DEFAULT 682,
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 2. Create table for YouTube highlight videos
CREATE TABLE IF NOT EXISTS public.videos (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    youtube_url TEXT NOT NULL,
    video_id TEXT NOT NULL,
    title TEXT NOT NULL DEFAULT '',
    thumbnail_url TEXT NOT NULL DEFAULT '',
    display_order INTEGER DEFAULT 0,
    created_at TIMESTAMPTZ DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- 3. Indexes for fast retrieval in display order
CREATE INDEX IF NOT EXISTS idx_gallery_photos_order ON public.gallery_photos (display_order ASC, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_videos_order ON public.videos (display_order ASC, created_at DESC);

-- 4. Enable Row Level Security (RLS)
ALTER TABLE public.gallery_photos ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.videos ENABLE ROW LEVEL SECURITY;

-- 5. Policies: Allow public read access (Anyone can view photos & videos on the website)
DROP POLICY IF EXISTS "Public can view gallery photos" ON public.gallery_photos;
CREATE POLICY "Public can view gallery photos"
    ON public.gallery_photos FOR SELECT
    USING (true);

DROP POLICY IF EXISTS "Public can view videos" ON public.videos;
CREATE POLICY "Public can view videos"
    ON public.videos FOR SELECT
    USING (true);

-- 6. Policies: Allow insert/update/delete with anon key
-- Note: Admin access is secured via the Admin Passcode in the Admin Portal.
DROP POLICY IF EXISTS "Allow anon insert gallery photos" ON public.gallery_photos;
CREATE POLICY "Allow anon insert gallery photos"
    ON public.gallery_photos FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete gallery photos" ON public.gallery_photos;
CREATE POLICY "Allow anon delete gallery photos"
    ON public.gallery_photos FOR DELETE
    USING (true);

DROP POLICY IF EXISTS "Allow anon update gallery photos" ON public.gallery_photos;
CREATE POLICY "Allow anon update gallery photos"
    ON public.gallery_photos FOR UPDATE
    USING (true);

DROP POLICY IF EXISTS "Allow anon insert videos" ON public.videos;
CREATE POLICY "Allow anon insert videos"
    ON public.videos FOR INSERT
    WITH CHECK (true);

DROP POLICY IF EXISTS "Allow anon delete videos" ON public.videos;
CREATE POLICY "Allow anon delete videos"
    ON public.videos FOR DELETE
    USING (true);

DROP POLICY IF EXISTS "Allow anon update videos" ON public.videos;
CREATE POLICY "Allow anon update videos"
    ON public.videos FOR UPDATE
    USING (true);

-- 7. Create Storage Bucket for Gallery Photos
INSERT INTO storage.buckets (id, name, public)
VALUES ('gallery-photos', 'gallery-photos', true)
ON CONFLICT (id) DO UPDATE SET public = true;

-- Storage Policies for gallery-photos bucket:
DROP POLICY IF EXISTS "Public can view gallery files" ON storage.objects;
CREATE POLICY "Public can view gallery files"
    ON storage.objects FOR SELECT
    USING (bucket_id = 'gallery-photos');

DROP POLICY IF EXISTS "Allow anon uploads to gallery-photos" ON storage.objects;
CREATE POLICY "Allow anon uploads to gallery-photos"
    ON storage.objects FOR INSERT
    WITH CHECK (bucket_id = 'gallery-photos');

DROP POLICY IF EXISTS "Allow anon deletes from gallery-photos" ON storage.objects;
CREATE POLICY "Allow anon deletes from gallery-photos"
    ON storage.objects FOR DELETE
    USING (bucket_id = 'gallery-photos');
