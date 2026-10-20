import type { Page } from "@playwright/test";
/** Compare two browser-encoded PNGs: Firefox normalizes translucent RGB while encoding. */
export async function canvasMatchesPng(page: Page, testId: string, base64: string) {
  return page.evaluate(async ({ testId, base64 }) => {
    const preview = document.querySelector(`[data-testid="${testId}"]`) as HTMLCanvasElement;
    const pixels = async (src: string) => {
      const image = new Image(); image.src = src; await image.decode();
      const canvas = document.createElement("canvas"); canvas.width=image.width; canvas.height=image.height;
      const context=canvas.getContext("2d")!; context.drawImage(image,0,0);
      return {width:canvas.width,height:canvas.height,data:context.getImageData(0,0,canvas.width,canvas.height).data};
    };
    const [actual,expected]=await Promise.all([pixels(`data:image/png;base64,${base64}`),pixels(preview.toDataURL("image/png"))]);
    return actual.width===expected.width && actual.height===expected.height && actual.data.every((value,index)=>value===expected.data[index]);
  },{testId,base64});
}
export async function canEncodeWebp(page: Page) {
  return page.evaluate(()=>document.createElement("canvas").toDataURL("image/webp").startsWith("data:image/webp"));
}
