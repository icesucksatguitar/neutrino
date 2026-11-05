const { nativeImage } = require('electron');
const path = require('path');
const img = nativeImage.createFromPath('C:/Users/simpl/.gemini/antigravity/brain/5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c/neutrino_youtube_test.png');
const size = img.getSize();
console.log('Neutrino YouTube capture size:', size);
const bmp = img.toBitmap();

// Sample y=400 across x=0 to size.width
for (let x = 0; x < size.width; x += 100) {
  const idx = (400 * size.width + x) * 4;
  console.log(`x=${x}: rgb(${bmp[idx+2]}, ${bmp[idx+1]}, ${bmp[idx]})`);
}
