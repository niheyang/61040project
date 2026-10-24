import { FontLibrary } from '/Users/heyangni/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/@oai/artifact-tool/node_modules/skia-canvas/lib/index.mjs';
import { GlobalFonts } from '@napi-rs/canvas';
const font = '/Users/heyangni/Desktop/6.1040/61040project/node_modules/@fontsource-variable/nunito-sans/files/nunito-sans-latin-wght-normal.woff2';
for (const [name, fn] of [['skia', () => FontLibrary.use('Nunito Sans',font)], ['napi',()=>GlobalFonts.registerFromPath(font,'Nunito Sans')]]) {
 try { console.log(name, fn()); } catch(e) { console.log(name,e.message); }
}
console.log('skia families', FontLibrary.families.filter(x=>/Nunito|Arial|Helvetica/.test(x)));
console.log('napi families', GlobalFonts.families.filter(x=>/Nunito|Arial|Helvetica/.test(x.family)));
