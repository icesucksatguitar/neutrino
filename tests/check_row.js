const { nativeImage } = require('electron');
const img = nativeImage.createFromPath('C:/Users/simpl/.gemini/antigravity/brain/5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c/.user_uploaded/media_1793816337858_dc4d8927.png');
const size = img.getSize();
const bmp = img.toBitmap();

function inspectRow(y) {
  let xs = [];
  for (let x = 0; x < size.width; x++) {
    const idx = (y * size.width + x) * 4;
    const b = bmp[idx], g = bmp[idx+1], r = bmp[idx+2];
    // check if it is not pure black or dark void (rgb(7,8,13) or rgb(10,11,14))
    if (r > 20 || g > 20 || b > 20) {
      xs.push(x);
    }
  }
  if (xs.length > 0) {
    console.log(`y=${y}: minX=${Math.min(...xs)}, maxX=${Math.max(...xs)}, count=${xs.length}`);
  } else {
    console.log(`y=${y}: all dark`);
  }
}

for (let y = 50; y < 800; y += 50) {
  inspectRow(y);
}
