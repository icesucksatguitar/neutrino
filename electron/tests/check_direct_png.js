const { nativeImage } = require('electron');
const img = nativeImage.createFromPath('C:/Users/simpl/.gemini/antigravity/brain/5ab3cecc-0f9a-4067-a03a-0ad1710d3f7c/youtube_direct_webview.png');
console.log('direct webview image size:', img.getSize());
