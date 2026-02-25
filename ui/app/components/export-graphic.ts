import effectionLogoSvg from "../../public/effection-logo.svg?raw";

const SOCIAL_EXPORT_WIDTH = 1600;
const SOCIAL_EXPORT_HEIGHT = 900;
const EFFECTION_LOGO_DATA_URL = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(effectionLogoSvg)}`;

const PRESENTATION_STYLE_PROPERTIES = [
  "fill",
  "fill-opacity",
  "stroke",
  "stroke-opacity",
  "stroke-width",
  "opacity",
  "paint-order",
  "font-family",
  "font-size",
  "font-style",
  "font-weight",
  "letter-spacing",
  "text-anchor",
  "dominant-baseline",
  "visibility",
  "display",
];

async function buildSvgStringForExport(sourceSvg: SVGSVGElement) {
  const clone = sourceSvg.cloneNode(true) as SVGSVGElement;

  inlineComputedStyles(sourceSvg, clone);

  const bounds = computeGraphicBounds(sourceSvg);
  const framedBounds = frameBoundsToAspect(
    bounds,
    SOCIAL_EXPORT_WIDTH / SOCIAL_EXPORT_HEIGHT,
    0.12,
  );

  clone.setAttribute("width", String(SOCIAL_EXPORT_WIDTH));
  clone.setAttribute("height", String(SOCIAL_EXPORT_HEIGHT));
  clone.setAttribute(
    "viewBox",
    `${framedBounds.x} ${framedBounds.y} ${framedBounds.width} ${framedBounds.height}`,
  );
  clone.setAttribute("preserveAspectRatio", "xMidYMid meet");

  const viewport = clone.querySelector("g[data-viewport]");
  if (viewport) viewport.removeAttribute("transform");

  insertBrandBadge(clone, framedBounds, EFFECTION_LOGO_DATA_URL);

  let serialized = new XMLSerializer().serializeToString(clone);
  if (!serialized.includes('xmlns="http://www.w3.org/2000/svg"')) {
    serialized = serialized.replace(
      "<svg",
      '<svg xmlns="http://www.w3.org/2000/svg"',
    );
  }
  if (!serialized.startsWith("<?xml")) {
    serialized = `<?xml version="1.0" encoding="UTF-8"?>\n${serialized}`;
  }

  return {
    svgString: serialized,
    width: SOCIAL_EXPORT_WIDTH,
    height: SOCIAL_EXPORT_HEIGHT,
  };
}

function insertBrandBadge(
  rootSvg: SVGSVGElement,
  framedBounds: { x: number; y: number; width: number; height: number },
  logoDataUrl: string,
) {
  const svgNs = "http://www.w3.org/2000/svg";
  const logoAspect = 156.04 / 24.04;

  const margin = framedBounds.width * 0.018;
  const logoWidth = framedBounds.width * 0.16;
  const logoHeight = logoWidth / logoAspect;
  const padX = logoHeight * 0.45;
  const padY = logoHeight * 0.35;

  const plateWidth = logoWidth + padX * 2;
  const plateHeight = logoHeight + padY * 2;
  const plateX = framedBounds.x + framedBounds.width - margin - plateWidth;
  const plateY = framedBounds.y + framedBounds.height - margin - plateHeight;

  const group = document.createElementNS(svgNs, "g");

  const plate = document.createElementNS(svgNs, "rect");
  plate.setAttribute("x", String(plateX));
  plate.setAttribute("y", String(plateY));
  plate.setAttribute("width", String(plateWidth));
  plate.setAttribute("height", String(plateHeight));
  plate.setAttribute("rx", String(logoHeight * 0.35));
  plate.setAttribute("ry", String(logoHeight * 0.35));
  plate.setAttribute("fill", "rgba(16, 24, 40, 0.82)");
  plate.setAttribute("stroke", "rgba(255, 255, 255, 0.22)");
  plate.setAttribute(
    "stroke-width",
    String(Math.max(1, framedBounds.width * 0.0009)),
  );

  const image = document.createElementNS(svgNs, "image");
  image.setAttribute("href", logoDataUrl);
  image.setAttribute("x", String(plateX + padX));
  image.setAttribute("y", String(plateY + padY));
  image.setAttribute("width", String(logoWidth));
  image.setAttribute("height", String(logoHeight));
  image.setAttribute("preserveAspectRatio", "xMidYMid meet");

  group.append(plate, image);
  rootSvg.append(group);
}

function inlineComputedStyles(source: Element, target: Element) {
  const sourceStyle = window.getComputedStyle(source);
  const targetSvg = target as SVGElement;

  for (const property of PRESENTATION_STYLE_PROPERTIES) {
    const value = sourceStyle.getPropertyValue(property);
    if (value) targetSvg.style.setProperty(property, value);
  }

  const sourceChildren = Array.from(source.children);
  const targetChildren = Array.from(target.children);
  for (let index = 0; index < sourceChildren.length; index++) {
    const sourceChild = sourceChildren[index];
    const targetChild = targetChildren[index];
    if (sourceChild && targetChild) {
      inlineComputedStyles(sourceChild, targetChild);
    }
  }
}

function computeGraphicBounds(sourceSvg: SVGSVGElement) {
  const links = sourceSvg.querySelector("g[data-links]") as SVGGElement | null;
  const nodes = sourceSvg.querySelector("g[data-nodes]") as SVGGElement | null;

  const linkBounds = safeBBox(links);
  const nodeBounds = safeBBox(nodes);
  const union = unionBBox(linkBounds, nodeBounds);
  if (union) return union;

  const viewport = sourceSvg.querySelector(
    "g[data-viewport]",
  ) as SVGGElement | null;
  const viewportBounds = safeBBox(viewport);
  if (viewportBounds) return viewportBounds;

  const viewBox = sourceSvg.viewBox?.baseVal;
  if (viewBox && viewBox.width > 0 && viewBox.height > 0) {
    return {
      x: viewBox.x,
      y: viewBox.y,
      width: viewBox.width,
      height: viewBox.height,
    };
  }

  const rect = sourceSvg.getBoundingClientRect();
  return {
    x: 0,
    y: 0,
    width: Math.max(1, rect.width || SOCIAL_EXPORT_WIDTH),
    height: Math.max(1, rect.height || SOCIAL_EXPORT_HEIGHT),
  };
}

function safeBBox(element: SVGGraphicsElement | null) {
  if (!element) return null;
  try {
    const box = element.getBBox();
    if (box.width <= 0 || box.height <= 0) return null;
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
    };
  } catch {
    return null;
  }
}

function unionBBox(
  a: { x: number; y: number; width: number; height: number } | null,
  b: { x: number; y: number; width: number; height: number } | null,
) {
  if (a && !b) return a;
  if (!a && b) return b;
  if (!a && !b) return null;

  const first = a as { x: number; y: number; width: number; height: number };
  const second = b as { x: number; y: number; width: number; height: number };

  const left = Math.min(first.x, second.x);
  const top = Math.min(first.y, second.y);
  const right = Math.max(first.x + first.width, second.x + second.width);
  const bottom = Math.max(first.y + first.height, second.y + second.height);
  return {
    x: left,
    y: top,
    width: right - left,
    height: bottom - top,
  };
}

function frameBoundsToAspect(
  bounds: { x: number; y: number; width: number; height: number },
  targetAspectRatio: number,
  paddingRatio: number,
) {
  const paddedWidth = Math.max(1, bounds.width * (1 + paddingRatio * 2));
  const paddedHeight = Math.max(1, bounds.height * (1 + paddingRatio * 2));

  let framedWidth = paddedWidth;
  let framedHeight = paddedHeight;
  const paddedAspect = paddedWidth / paddedHeight;

  if (paddedAspect > targetAspectRatio) {
    framedHeight = paddedWidth / targetAspectRatio;
  } else {
    framedWidth = paddedHeight * targetAspectRatio;
  }

  const centerX = bounds.x + bounds.width / 2;
  const centerY = bounds.y + bounds.height / 2;

  return {
    x: centerX - framedWidth / 2,
    y: centerY - framedHeight / 2,
    width: framedWidth,
    height: framedHeight,
  };
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  document.body.append(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function exportSvgElement(
  svgElement: SVGSVGElement,
  fileNamePrefix = "effectionx-graph",
) {
  const { svgString } = await buildSvgStringForExport(svgElement);
  const fileName = `${fileNamePrefix}-${Date.now()}.svg`;
  const blob = new Blob([svgString], {
    type: "image/svg+xml;charset=utf-8",
  });
  downloadBlob(blob, fileName);
  return { success: true, fileName };
}

export async function exportSvgElementToPng(
  svgElement: SVGSVGElement,
  fileNamePrefix = "effectionx-graph",
) {
  const { svgString, width, height } =
    await buildSvgStringForExport(svgElement);
  const scale = Math.max(1, Math.min(2, window.devicePixelRatio || 1));

  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(width * scale);
  canvas.height = Math.ceil(height * scale);

  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Could not acquire canvas context");
  const context = ctx;
  context.setTransform(scale, 0, 0, scale, 0, 0);

  async function drawWithImageTag() {
    const image = new Image();
    const blob = new Blob([svgString], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    try {
      await new Promise<void>((resolve, reject) => {
        image.onload = () => resolve();
        image.onerror = () => reject(new Error("SVG image load failed"));
        image.src = url;
      });
      context.clearRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
    } finally {
      URL.revokeObjectURL(url);
    }
  }

  await drawWithImageTag();

  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((value) => {
      if (!value) {
        reject(new Error("Failed to create PNG blob"));
        return;
      }
      resolve(value);
    }, "image/png");
  });

  const fileName = `${fileNamePrefix}-${Date.now()}.png`;
  downloadBlob(blob, fileName);
  return { success: true, fileName };
}
