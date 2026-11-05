const { nativeImage } = require('electron');
const img = nativeImage.createFromPath('C:/Users/simpl/.gemini/antigravity/brain/5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c/.user_uploaded/media_1793816337858_dc4d8927.png');
const size = img.getSize();
const bmp = img.toBitmap();

// Look at top header: y between 10 and 40
console.log('Image width:', size.width, 'height:', size.height);
for (let y = 10; y <= 35; y += 5) {
  let nonBlackXs = [];
  for (let x = 0; x < size.width; x++) {
    const idx = (y * size.width + x) * 4;
    const b = bmp[idx], g = bmp[idx+1], r = bmp[idx+2];
    if (r > 30 || g > 30 || b > 30) {
      nonBlackXs.push(x);
    }
  }
  console.log(`y=${y}: non-black pixels from x=${Math.min(...nonBlackXs)} to x=${Math.max(...nonBlackXs)} (count: ${nonBlackXs.length})`);
}
