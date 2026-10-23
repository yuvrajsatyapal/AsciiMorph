/** Independently authored public catalog identity/order only. No renderer claims,
 * reference bundle imports, presets, or borrowed preview images. */
export const CATEGORIES = [
  ["ascii", "ASCII & Text"],
  ["pixel", "Pixel & Blocks"],
  ["print", "Print & Paper"],
  ["geometric", "Geometric"],
  ["distort", "Distort"],
  ["blur", "Blur & Focus"],
  ["glitch", "Glitch & Signal"],
  ["light", "Light & Color"],
  ["glass", "Glass"],
  ["material", "Material & Texture"],
] as const;
const identities = `characters|Characters|ascii
asciiStudio|ASCII Studio|ascii
dither|Dither|print
block-chars|Block|ascii
dots|Dots|ascii
frostedglass|Frosted Glass|glass
motionblur|Motion Blur|blur
mixed|Mixed|ascii
pixel|Pixel Art|pixel
mosaic|Mosaic|pixel
lego|LEGO|pixel
cross|Cross|geometric
diamond|Diamond|geometric
lines|Lines|geometric
diagonal|Diagonal|geometric
braille|Braille|ascii
3d|Voxel|pixel
disco|Disco|light
stippling|Stippling|print
waves|Waves|material
risograph|Risograph|print
crt|CRT Screen|glitch
specimen|Specimen|geometric
smudge|Smudge|distort
pinch|Pinch|distort
spherize|Spherize|distort
twirl|Twirl|distort
ripple|ZigZag|distort
zigzag|Ripple|distort
polar|Polar|distort
shear|Shear|distort
pixelsort|Pixel Sort|glitch
oilpaint|Oil Paint|material
lowpoly|Low Poly|geometric
comic|Comic|print
sketch|Sketch|print
watercolor|Watercolor|material
chrome|Chrome|material
hexmosaic|Hex Mosaic|pixel
stainedglass|Tinted Glass|glass
anaglyph|Anaglyph 3D|light
droste|Droste|geometric
tiltshift|Tilt-Shift|blur
gaussianblur|Gaussian Blur|blur
radialblur|Radial Blur|blur
thinfilm|Thin-Film|material
truchet|Truchet|geometric
isoextrude|Iso Extrude|geometric
flowfield|Flow Field|geometric
engraving|Engraving|print
gradientmap|Gradient Map|light
warhol|Warhol|print
shatter|Shatter|glass
lattice|Lattice|geometric
blueprint|Blueprint|print
topography|Topography|geometric
prism|Prism|light
marble|Marble|material
dreamdust|Dreamdust|light
forms|Forms|geometric
halftone|Halftone|print
schematic|Schematic|geometric
forensics|Forensics|glitch
glitch|Digital Distortion|glitch
datamosh|Datamosh|glitch
ukiyoe|Woodblock|print
molten|Molten Metal|material
vitrine|Vitrine|glass
lightwind|Light Wind|light
starburst|Kaleidoscope|light
warpbloom|Warpbloom|light
lofi|Lofi|glitch
rgbsplit|RGB Split|glitch
duotone|Duotone|light
edgeglow|Edge Glow|light
posterize|Posterize|print
crystallize|Crystallize|material
mezzotint|Mezzotint|print
pointillize|Pointillize|print
scanline|Scanline|glitch
crosshatch|Crosshatch|print
neongrid|Neon Grid|geometric
ledmatrix|LED Matrix|pixel
thermal|Thermal|glitch
beacon|Beacon|glitch
emboss|Emboss|material
halftonecmyk|CMYK Drops|print
lens|Aberration|light
glassorb|Glass Orb|glass
flutedglass|Fluted Glass|glass
glass-cross|Cross Reeded|glass|liquidglass
glass-hammered|Hammered|glass|liquidglass
glass-diamond|Diamond Glass|glass|liquidglass
glass-hexagon|Hexagon|glass|liquidglass
glass-ripple|Ripple|glass|liquidglass
glass-crackle|Ice Crackle|glass|liquidglass
glass-chevron|Chevron Prism|glass|liquidglass
glass-seedy|Seedy Bubbles|glass|liquidglass
glass-pixel|Glass Pixel|glass|liquidglass
glass-jello|Jello|glass|liquidglass
cyanotype|Cyanotype|print
hexhalftone|Honeycomb Screen|print
paperstock|Crumpled Print|print
oilpool|Petrol Sheen|material
anodized|Heat Tint|material`;
export const CATALOG = identities.split("\n").map((line, order) => {
  const [id, label, category, mode = id] = line.split("|");
  return { id, label, category, mode, order, available: id === "characters" };
});
export type CatalogTile = (typeof CATALOG)[number];
