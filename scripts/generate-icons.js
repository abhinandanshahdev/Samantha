/**
 * Generate mobile app icons from SVG logo
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const svgContent = `<svg xmlns="http://www.w3.org/2000/svg" width="512" height="512" viewBox="0 0 512 512" role="img">
  <rect width="512" height="512" fill="#6366F1" rx="64"/>
  <defs>
    <path id="roundedTriangle"
      d="M256 120
         Q275 150 320 210
         Q335 240 320 270
         Q305 300 256 340
         Q207 300 192 270
         Q177 240 192 210
         Q237 150 256 120Z" />
  </defs>
  <g transform="translate(0, 30)">
    <use
      href="#roundedTriangle"
      fill="none"
      stroke="#FFFFFF"
      stroke-width="24"
      stroke-linejoin="round"
    />
    <use
      href="#roundedTriangle"
      fill="none"
      stroke="#E0E7FF"
      stroke-width="24"
      stroke-linejoin="round"
      transform="rotate(120 256 256)"
    />
    <use
      href="#roundedTriangle"
      fill="none"
      stroke="#C7D2FE"
      stroke-width="24"
      stroke-linejoin="round"
      transform="rotate(240 256 256)"
    />
  </g>
</svg>`;

async function generateIcons() {
  const publicDir = path.join(__dirname, '..', 'public');

  // Generate 192x192 icon
  await sharp(Buffer.from(svgContent))
    .resize(192, 192)
    .png()
    .toFile(path.join(publicDir, 'logo192.png'));
  console.log('Generated logo192.png');

  // Generate 512x512 icon
  await sharp(Buffer.from(svgContent))
    .resize(512, 512)
    .png()
    .toFile(path.join(publicDir, 'logo512.png'));
  console.log('Generated logo512.png');

  // Generate favicon.ico (32x32 PNG, browsers accept PNG as favicon)
  await sharp(Buffer.from(svgContent))
    .resize(32, 32)
    .png()
    .toFile(path.join(publicDir, 'favicon-32.png'));
  console.log('Generated favicon-32.png');

  console.log('All icons generated successfully!');
}

generateIcons().catch(console.error);
