-- Create a table for saving monument sessions
CREATE TABLE IF NOT EXISTS public.sessions (
    id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
    user_id UUID REFERENCES auth.users(id) ON DELETE CASCADE NOT NULL,
    monument_name TEXT NOT NULL,
    location_city TEXT,
    location_country TEXT,
    coordinates JSONB,
    photo_url TEXT,
    history_text TEXT,
    details JSONB,
    qa_thread JSONB DEFAULT '[]'::jsonb,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT timezone('utc'::text, now()) NOT NULL
);

-- Enable RLS
ALTER TABLE public.sessions ENABLE ROW LEVEL SECURITY;

-- Create policies
CREATE POLICY "Users can only view their own sessions" 
ON public.sessions FOR SELECT 
USING (auth.uid() = user_id);

CREATE POLICY "Users can only insert their own sessions" 
ON public.sessions FOR INSERT 
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only update their own sessions" 
ON public.sessions FOR UPDATE 
USING (auth.uid() = user_id)
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can only delete their own sessions" 
ON public.sessions FOR DELETE 
USING (auth.uid() = user_id);

-- Storage Setup (Execute these in Supabase Storage dashboard manually if needed)
-- 1. Create a bucket named 'monument-photos'
-- 2. Make it public if you want public access to images, or use signed URLs
-- 3. Set policies to allow authenticated users to upload to 'monument-photos' bucket
