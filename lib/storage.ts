import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';
export async function uploadMonumentPhoto(userId: string, imageUri: string) {
  const fileName = `${userId}/${Date.now()}.jpg`;
  const bucketName = 'monument-photos';
  
  try {
    const formData = new FormData();
    formData.append('file', {
      uri: imageUri,
      name: fileName,
      type: 'image/jpeg',
    } as any);

    const { data, error } = await supabase.storage
      .from(bucketName)
      .upload(fileName, formData, {
        upsert: true
      });

    if (error) {
      if (error.message.includes('Bucket not found')) {
        throw new Error(`Storage bucket '${bucketName}' not found. Please create it in your Supabase dashboard.`);
      }
      throw error;
    }

    // Bypass any bucket-privacy issues by creating a 10-year signed URL rather than assuming public access
    const { data: signedData, error: signedError } = await supabase.storage
      .from(bucketName)
      .createSignedUrl(fileName, 60 * 60 * 24 * 365 * 10);

    if (signedData?.signedUrl) {
      return signedData.signedUrl;
    }

    // Fallback if signed URL generation fails
    const { data: { publicUrl } } = supabase.storage
      .from(bucketName)
      .getPublicUrl(fileName);

    return publicUrl;
  } catch (error: any) {
    console.error('Upload error details:', error);
    throw error;
  }
}
