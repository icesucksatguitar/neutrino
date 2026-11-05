const { nativeImage } = require('electron');
const img = nativeImage.createFromPath('C:/Users/simpl/.gemini/antigravity/brain/5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c/.user_uploaded/media_1793816337858_dc4d8927.png');
const size = img.getSize();
console.log('Size:', size);
const bmp = img.toBitmap();
const y = 400;
for (let x = 0; x < size.width; x += 50) {
  const idx = (y * size.width + x) * 4;
  console.log(`x=${x}, y=${y}: rgb(${bmp[idx+2]}, ${bmp[idx+1]}, ${bmp[idx]})`);
}
// Also check x=1023
const idxScrollbar = (y * size.width + 1023) * 4;
console.log(`x=1023, y=${y}: rgb(${bmp[idxScrollbar+2]}, ${bmp[idxScrollbar+1]}, ${bmp[idxScrollbar]})`);
