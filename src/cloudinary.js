// Simple client-side Cloudinary upload helper (unsigned preset)
// NOTE: Default values are set for local development. Replace with your Cloudinary values for production.

export async function uploadToCloudinary(file, { cloudName = 'ItCertiOD', uploadPreset = 'itcertiod_unsigned' } = {}) {
  if (!file) throw new Error('No file provided for upload');

  const url = `https://api.cloudinary.com/v1_1/${cloudName}/upload`;
  const formData = new FormData();
  formData.append('file', file);
  formData.append('upload_preset', uploadPreset);

  const res = await fetch(url, {
    method: 'POST',
    body: formData,
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error('Cloudinary upload failed: ' + res.status + ' ' + text);
  }

  return res.json();
}
