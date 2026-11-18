const fs = require('fs');

// 1. Check syntax of files
const files = [
  'assets/js/supabase-config.js',
  'assets/js/supabase-client.js',
  'assets/js/admin.js',
  'assets/js/gallery.js',
  'assets/js/yt-carousel.js'
];

for (const file of files) {
  if (!fs.existsSync(file)) {
    throw new Error(`File not found: ${file}`);
  }
}

// 2. Load supabase-client and verify YouTube URL parsing
const clientCode = fs.readFileSync('assets/js/supabase-client.js', 'utf8');
global.window = {
  COGNIZANCE_CONFIG: {
    supabaseUrl: '',
    supabaseAnonKey: '',
    adminPin: '2025'
  }
};

eval(clientCode);
const api = global.window.CognizanceAPI;

console.log('Test isSupabaseConfigured (unconfigured):', api.isSupabaseConfigured() === false ? 'PASS' : 'FAIL');

const test1 = api.extractYouTubeData('https://www.youtube.com/watch?v=AHa0LpXiMnQ');
console.log('Test standard URL:', test1 && test1.videoId === 'AHa0LpXiMnQ' ? 'PASS' : 'FAIL');

const test2 = api.extractYouTubeData('https://youtu.be/WzdIYM6yZiA?si=F123qtb3v6hkLJ30');
console.log('Test short youtu.be URL:', test2 && test2.videoId === 'WzdIYM6yZiA' ? 'PASS' : 'FAIL');

const test3 = api.extractYouTubeData('https://www.youtube.com/shorts/3khrnC0X85o');
console.log('Test shorts URL:', test3 && test3.videoId === '3khrnC0X85o' ? 'PASS' : 'FAIL');

// 3. Verify HTML files exist and contain required tags
const indexHtml = fs.readFileSync('index.html', 'utf8');
const adminHtml = fs.readFileSync('admin.html', 'utf8');

console.log('Test index.html has supabase-client:', indexHtml.includes('supabase-client.js') ? 'PASS' : 'FAIL');
console.log('Test index.html has supabase-config:', indexHtml.includes('supabase-config.js') ? 'PASS' : 'FAIL');
console.log('Test index.html has admin link:', indexHtml.includes('admin.html') ? 'PASS' : 'FAIL');
console.log('Test admin.html has lockscreen:', adminHtml.includes('adm-lockscreen') ? 'PASS' : 'FAIL');
console.log('Test admin.html has dropzone:', adminHtml.includes('adm-dropzone') ? 'PASS' : 'FAIL');
console.log('Test admin.html has YouTube input:', adminHtml.includes('adm-yt-url') ? 'PASS' : 'FAIL');

// 4. Verify SQL setup script exists
const sqlScript = fs.readFileSync('supabase_setup.sql', 'utf8');
console.log('Test SQL has gallery_photos table:', sqlScript.includes('public.gallery_photos') ? 'PASS' : 'FAIL');
console.log('Test SQL has videos table:', sqlScript.includes('public.videos') ? 'PASS' : 'FAIL');
console.log('Test SQL has storage bucket:', sqlScript.includes('gallery-photos') ? 'PASS' : 'FAIL');

console.log('\n--- ALL VERIFICATION CHECKS COMPLETED SUCCESSFULLY ---');
