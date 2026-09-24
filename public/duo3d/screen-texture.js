// The website pixels come from ScreenshotOne. This module only draws the
// browser controls around those pixels in the visitor's own browser.
import { GLYPHS, svg, tabsIcon, wifiIcon } from './bar-icons.js';

const DPR = 3;
const SIZES = { inner: { w: 951, h: 669 }, outer: { w: 466, h: 678 } };
const iconImages = new Map();

export function siteArea(kind) {
  const { w, h } = SIZES[kind];
  return kind === 'inner'
    ? { x: 0, y: Math.round(h * 81 / 669), w, h: h - Math.round(h * 81 / 669) }
    : { x: 0, y: 0, w: Math.round(w * 382 / 466), h };
}

function themeFor(image) {
  const sample = document.createElement('canvas');
  sample.width = 24;
  sample.height = 24;
  const ctx = sample.getContext('2d', { willReadFrequently: true });
  ctx.drawImage(image, 0, 0, 24, 24);
  const pixels = ctx.getImageData(0, 0, 24, 24).data;
  const buckets = new Map();
  for (let i = 1; i < 23; i++) {
    for (const [x, y] of [[i, 1], [i, 22], [1, i], [22, i]]) {
      const p = (y * 24 + x) * 4;
      const key = `${pixels[p] >> 4},${pixels[p + 1] >> 4},${pixels[p + 2] >> 4}`;
      const item = buckets.get(key) || { count: 0, r: 0, g: 0, b: 0 };
      item.count++;
      item.r += pixels[p]; item.g += pixels[p + 1]; item.b += pixels[p + 2];
      buckets.set(key, item);
    }
  }
  const best = [...buckets.values()].sort((a, b) => b.count - a.count)[0];
  const r = Math.round(best.r / best.count);
  const g = Math.round(best.g / best.count);
  const b = Math.round(best.b / best.count);
  const dark = 0.2126 * r + 0.7152 * g + 0.0722 * b < 140;
  return {
    bg: `rgb(${r},${g},${b})`,
    ink: dark ? '#fff' : '#060606',
    card: dark ? 'rgba(54,54,56,.94)' : 'rgba(255,255,255,.94)',
    cardSolid: dark ? '#2e2e2f' : '#fdfdfd',
    line: dark ? 'rgba(255,255,255,.14)' : 'rgba(0,0,0,.12)',
    dots: dark ? 'rgba(255,255,255,.38)' : 'rgba(0,0,0,.38)',
  };
}

function rounded(ctx, x, y, w, h, radius, fill, stroke) {
  ctx.beginPath();
  ctx.roundRect(x, y, w, h, radius);
  ctx.fillStyle = fill;
  ctx.fill();
  if (stroke) { ctx.strokeStyle = stroke; ctx.lineWidth = .5; ctx.stroke(); }
}

function loadIcon(markup) {
  if (!iconImages.has(markup)) {
    iconImages.set(markup, new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve(image);
      image.onerror = reject;
      image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup.replace('<svg ', '<svg xmlns="http://www.w3.org/2000/svg" '))}`;
    }));
  }
  return iconImages.get(markup);
}

async function drawIcon(ctx, markup, x, y) {
  const image = await loadIcon(markup);
  ctx.drawImage(image, x, y, image.naturalWidth, image.naturalHeight);
}

async function drawCenteredIcon(ctx, markup, x, y) {
  const image = await loadIcon(markup);
  ctx.drawImage(image, x - image.naturalWidth / 2, y - image.naturalHeight / 2);
}

function centeredText(ctx, text, x, y, size, color, maxWidth, weight = 500) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(fitText(ctx, text, maxWidth), x, y);
}

// Long hosts are cut with an ellipsis instead of being squeezed horizontally.
function fitText(ctx, text, maxWidth) {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let end = text.length;
  while (end > 1 && ctx.measureText(`${text.slice(0, end)}…`).width > maxWidth) end--;
  return `${text.slice(0, end)}…`;
}

function drawTime(ctx, x, y, size, theme, align, weight) {
  ctx.fillStyle = theme.ink;
  ctx.font = `${weight} ${size}px -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif`;
  ctx.textAlign = align;
  ctx.textBaseline = 'middle';
  ctx.fillText(new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit', hour12: false }), x, y);
}

function card(ctx, x, y, w, h, theme, radius = h / 2) {
  ctx.save();
  ctx.shadowColor = 'rgba(0,0,0,.10)'; ctx.shadowBlur = 8; ctx.shadowOffsetY = 2;
  rounded(ctx, x, y, w, h, radius, theme.card, theme.line);
  ctx.restore();
}

async function drawInner(ctx, w, h, theme, host) {
  const barH = Math.round(h * 81 / 669);
  rounded(ctx, 0, 0, w, barH, [Math.round(h * .055), Math.round(h * .055), 0, 0], theme.bg);
  ctx.fillStyle = theme.line; ctx.fillRect(0, barH - .5, w, .5);
  const d = Math.round(barH * .558);
  const cy = Math.round(barH * .6);
  const left = Math.round(w * .0161);
  for (const [i, name] of ['chevron', 'book'].entries()) {
    const x = left + i * (d + Math.round(d * .239));
    card(ctx, x, cy - Math.round(d / 2), d, d, theme);
    await drawCenteredIcon(ctx, svg(GLYPHS[name], theme.ink, d * (i ? .55 : .42)), x + d / 2, cy - Math.round(d / 2) + d / 2);
  }
  const addrW = Math.round(w * .38);
  const addrX = Math.round((w - addrW) / 2);
  card(ctx, addrX, cy - Math.round(d / 2), addrW, d, theme);
  await drawCenteredIcon(ctx, svg(GLYPHS.burger, theme.ink, d * .36), addrX + Math.round(d * .343) + Math.round(d * .36) / 2, cy);
  centeredText(ctx, host, w / 2, cy, Math.round(barH * .213), theme.ink, addrW * .58, 400);
  await drawCenteredIcon(ctx, svg(GLYPHS.reload, theme.ink, d * .42), addrX + addrW - Math.round(d * .396) - Math.round(d * .42) / 2, cy);
  const timeSize = Math.round(barH * .213);
  const timeW = Math.round(timeSize * 2.625);
  const wifiW = Math.round(barH * .52);
  const wifiH = Math.round(wifiW * 124 / 123);
  const wifiLeft = w - Math.round(barH * .333) - wifiW;
  const timeRight = wifiLeft - Math.round(barH * .16);
  const actionW = Math.round(w * .0939);
  const actionRight = timeRight - timeW - Math.round(barH * .12);
  const actionX = actionRight - actionW;
  card(ctx, actionX, cy - Math.round(d / 2), actionW, d, theme);
  await drawCenteredIcon(ctx, svg(GLYPHS.plus, theme.ink, d * .4), actionX + actionW * .25, cy);
  await drawCenteredIcon(ctx, tabsIcon(d * .52, theme.ink, theme.cardSolid), actionX + actionW * .746, cy);
  drawTime(ctx, timeRight, cy, timeSize, theme, 'right', 600);
  await drawIcon(ctx, wifiIcon(wifiW, theme.ink, theme.dots), wifiLeft, Math.round(cy - wifiH * .528));
}

async function drawOuter(ctx, w, h, theme, host) {
  const railCx = Math.round(w * .897);
  drawTime(ctx, railCx, Math.round(h * .1362), Math.round(h * .0246), theme, 'center', 700);
  const wifiW = Math.round(w * .088);
  await drawIcon(ctx, wifiIcon(wifiW, theme.ink, theme.dots), railCx - Math.round(wifiW / 2), Math.round(h * .1617));
  const circleD = Math.round(w * .0858);
  for (const [cy, name, scale] of [[Math.round(h * .321), 'chevron', .42], [Math.round(h * .41), 'book', .55]]) {
    card(ctx, railCx - Math.round(circleD / 2), cy - Math.round(circleD / 2), circleD, circleD, theme);
    await drawCenteredIcon(ctx, svg(GLYPHS[name], theme.ink, circleD * scale), railCx, cy);
  }
  const pillW = Math.round(w * .1059);
  const pillH = Math.round(h * .1436);
  const pillY = Math.round(h * .8746) - Math.round(pillH / 2);
  card(ctx, railCx - Math.round(pillW / 2), pillY, pillW, pillH, theme);
  await drawCenteredIcon(ctx, svg(GLYPHS.plus, theme.ink, pillW * .38), railCx, pillY + pillH * .25);
  await drawCenteredIcon(ctx, tabsIcon(pillW * .52, theme.ink, theme.cardSolid), railCx, pillY + pillH * .764);
  const bottomH = Math.round(h * .0703);
  const bottomX = Math.round(w * .0501);
  const bottomW = Math.round(w * .7196);
  const bottomY = h - Math.round(h * .0511) - bottomH;
  card(ctx, bottomX, bottomY, bottomW, bottomH, theme);
  await drawCenteredIcon(ctx, svg(GLYPHS.burger, theme.ink, bottomH * .34), bottomX + Math.round(bottomH * .36) + Math.round(bottomH * .34) / 2, bottomY + bottomH / 2);
  centeredText(ctx, host, bottomX + bottomW / 2, bottomY + bottomH / 2, Math.round(h * .0246), theme.ink, bottomW * .57);
  await drawCenteredIcon(ctx, svg(GLYPHS.reload, theme.ink, bottomH * .32), bottomX + bottomW - Math.round(bottomH * .33) - Math.round(bottomH * .32) / 2, bottomY + bottomH / 2);
}

export async function makeScreenTexture(kind, image, url) {
  const { w, h } = SIZES[kind];
  const area = siteArea(kind);
  const canvas = document.createElement('canvas');
  canvas.width = w * DPR;
  canvas.height = h * DPR;
  const ctx = canvas.getContext('2d');
  ctx.scale(DPR, DPR);
  const theme = themeFor(image);
  ctx.fillStyle = theme.bg;
  ctx.fillRect(0, 0, w, h);
  ctx.drawImage(image, area.x, area.y, area.w, area.h);
  const host = new URL(url).host.replace(/^www\./, '');
  if (kind === 'inner') await drawInner(ctx, w, h, theme, host);
  else await drawOuter(ctx, w, h, theme, host);
  return canvas;
}
