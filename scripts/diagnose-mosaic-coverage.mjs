// Diagnostic sweep of the native rounded-path coverage against independent Canvas.
// This reports mismatches; canonical acceptance remains in reference-comparison.spec.ts.
import { chromium } from "@playwright/test";
import { spawnSync } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
const directory = await mkdtemp(join(tmpdir(), "asciimorph-mosaic-sweep-"));
const rawPath = join(directory, "native.alpha");
const sourcePath = join(directory, "sweep.rs");
await writeFile(
  sourcePath,
  `
#[path=${JSON.stringify(resolve("rust/src/styles/mosaic_raster.rs"))}] mod raster;
fn main() {
 let mut all=vec![];
 for font in [3.,4.,5.,11.,40.,80.] { for scale in [1.,2.,3.,4.] { for shape in 0..3 {
  let (mx,my)=if shape==1 {(2,1)}else if shape==2{(1,2)}else{(1,1)};
  let (px,py)=(3.*font*scale/5.,font*scale);
  let mut alpha=vec![0;256*128];
  for row in (0..(128_f64/py).ceil() as usize).step_by(my) {
   for col in (0..(256_f64/px).ceil() as usize).step_by(mx) {
    let full=[col as f64*px,row as f64*py,(col+mx) as f64*px,(row+my) as f64*py];
    let mut b=[full[0]+1.,full[1]+1.,full[2]-1.,full[3]-1.];
    if b[0]>b[2]{b.swap(0,2)} if b[1]>b[3]{b.swap(1,3)}
    let radius=0.2*(full[2]-full[0]).min(full[3]-full[1]);
    for y in b[1].floor().max(0.) as usize..(b[3].ceil() as usize).min(128) {
     for x in b[0].floor().max(0.) as usize..(b[2].ceil() as usize).min(256) {
      alpha[y*256+x]=(255.*raster::coverage(b,radius,x,y,[256,128])).round() as u8;
     }
    }
   }
  }
  all.extend(alpha);
 }}}
 std::fs::write(${JSON.stringify(rawPath)},all).unwrap();
}
`,
);
const executable = join(directory, "sweep");
for (const [command, args] of [
  ["rustc", ["--edition=2021", "-O", sourcePath, "-o", executable]],
  [executable, []],
]) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) throw new Error(`${command}: ${result.stderr}`);
}
const native = await readFile(rawPath);
const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  const captures = await page.evaluate(() => {
    const captures = [];
    for (const font of [3, 4, 5, 11, 40, 80])
      for (const scale of [1, 2, 3, 4])
        for (let shape = 0; shape < 3; shape++) {
          const canvas = document.createElement("canvas");
          canvas.width = 256;
          canvas.height = 128;
          const ctx = canvas.getContext("2d");
          ctx.fillStyle = "white";
          const mx = shape === 1 ? 2 : 1,
            my = shape === 2 ? 2 : 1,
            px = 0.6 * font * scale,
            py = font * scale;
          for (let row = 0; row < Math.ceil(128 / py); row += my)
            for (let col = 0; col < Math.ceil(256 / px); col += mx) {
              const width = px * mx,
                height = py * my;
              ctx.beginPath();
              ctx.roundRect(
                col * px + 1,
                row * py + 1,
                width - 2,
                height - 2,
                0.2 * Math.min(width, height),
              );
              ctx.fill();
            }
          captures.push({
            font,
            scale,
            shape,
            alpha: Array.from(ctx.getImageData(0, 0, 256, 128).data).filter(
              (_, i) => i % 4 === 3,
            ),
          });
        }
    return captures;
  });
  const results = captures.map(({ alpha, ...settings }, caseIndex) => {
    let differingPixels = 0,
      maxAlphaError = 0,
      firstDifference = null;
    alpha.forEach((expected, i) => {
      const actual = native[caseIndex * alpha.length + i];
      const error = Math.abs(actual - expected);
      if (error) {
        differingPixels++;
        maxAlphaError = Math.max(maxAlphaError, error);
        firstDifference ??= {
          x: i % 256,
          y: Math.floor(i / 256),
          actual,
          expected,
        };
      }
    });
    return { ...settings, differingPixels, maxAlphaError, firstDifference };
  });
  const report = {
    browser: browser.version(),
    width: 256,
    height: 128,
    method:
      "White Canvas roundRect masks versus native coverage at the family paint bounds",
    cases: results,
  };
  if (process.argv[2])
    await writeFile(
      resolve(process.argv[2]),
      JSON.stringify(report, null, 2) + "\n",
    );
  console.log(
    JSON.stringify(
      {
        cases: results.length,
        exact: results.filter((r) => r.differingPixels === 0).length,
        remaining: results.filter((r) => r.differingPixels !== 0),
      },
      null,
      2,
    ),
  );
} finally {
  await browser.close();
}
