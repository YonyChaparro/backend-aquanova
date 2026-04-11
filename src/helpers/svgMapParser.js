const fs = require('fs');
const cheerio = require('cheerio');

const DEFAULT_SCALE_FACTOR = 0.8;
const NUMBER_REGEX = /-?\d*\.?\d+(?:e[-+]?\d+)?/gi;

const toFiniteNumber = (value, fallback = 0) => {
    const num = Number.parseFloat(value);
    return Number.isFinite(num) ? num : fallback;
};

const toFixedNumber = (value, decimals = 2) => Number(Number(value).toFixed(decimals));

const pointsToPath = (points, closeShape = true) => {
    const numbers = (points || '').match(NUMBER_REGEX);
    if (!numbers || numbers.length < 4) return null;

    const coords = numbers.map((value) => toFiniteNumber(value, NaN));
    const pairs = [];

    for (let i = 0; i + 1 < coords.length; i += 2) {
        const x = coords[i];
        const y = coords[i + 1];
        if (Number.isFinite(x) && Number.isFinite(y)) {
            pairs.push(`${x},${y}`);
        }
    }

    if (pairs.length < 2) return null;

    return `M ${pairs.join(' L ')}${closeShape ? ' Z' : ''}`;
};

const rectToPath = ($element) => {
    const x = toFiniteNumber($element.attr('x'));
    const y = toFiniteNumber($element.attr('y'));
    const width = toFiniteNumber($element.attr('width'));
    const height = toFiniteNumber($element.attr('height'));

    if (width <= 0 || height <= 0) return null;

    const x2 = x + width;
    const y2 = y + height;

    return `M ${x},${y} L ${x2},${y} L ${x2},${y2} L ${x},${y2} Z`;
};

const getSvgPathFromElement = ($element) => {
    const tagName = ($element[0] && $element[0].tagName || '').toLowerCase();

    if (tagName === 'path') {
        return $element.attr('d') || null;
    }

    if (tagName === 'polygon') {
        return pointsToPath($element.attr('points'), true);
    }

    if (tagName === 'polyline') {
        return pointsToPath($element.attr('points'), false);
    }

    if (tagName === 'rect') {
        return rectToPath($element);
    }

    return null;
};

const extractGeometryData = (pathData, scaleFactor = DEFAULT_SCALE_FACTOR) => {
    const rawNumbers = (pathData || '').match(NUMBER_REGEX);
    if (!rawNumbers || rawNumbers.length < 4) return null;

    const values = rawNumbers
        .map((value) => toFiniteNumber(value, NaN))
        .filter(Number.isFinite);

    const xs = [];
    const ys = [];

    for (let i = 0; i + 1 < values.length; i += 2) {
        xs.push(values[i]);
        ys.push(values[i + 1]);
    }

    if (xs.length < 2 || ys.length < 2) return null;

    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    const centroid = {
        x: Number(((minX + maxX) / 2).toFixed(2)),
        y: Number(((minY + maxY) / 2).toFixed(2))
    };

    const area_m2 = Number(((maxX - minX) * (maxY - minY) * scaleFactor).toFixed(2));

    return {
        svg_path: pathData,
        centroid,
        area_m2,
        bounds: { minX, minY, maxX, maxY }
    };
};

const extractNumericId = (elementId) => {
    if (!elementId) return null;

    const loteMatch = elementId.match(/^lote_(\d+)$/i);
    if (loteMatch) {
        return Number.parseInt(loteMatch[1], 10);
    }

    const genericMatch = elementId.match(/(\d+)$/);
    if (!genericMatch) return null;

    return Number.parseInt(genericMatch[1], 10);
};

const buildLotNumber = (elementId, usedNumbers, nextSequentialRef) => {
    const candidate = extractNumericId(elementId);

    if (Number.isInteger(candidate) && candidate > 0 && !usedNumbers.has(candidate)) {
        usedNumbers.add(candidate);
        return `Lote-${String(candidate).padStart(3, '0')}`;
    }

    while (usedNumbers.has(nextSequentialRef.value)) {
        nextSequentialRef.value += 1;
    }

    const assigned = nextSequentialRef.value;
    usedNumbers.add(assigned);
    nextSequentialRef.value += 1;

    return `Lote-${String(assigned).padStart(3, '0')}`;
};

const getViewBox = ($, geometryBounds) => {
    const svgEl = $('svg').first();
    const viewBox = svgEl.attr('viewBox');

    if (viewBox && viewBox.trim()) {
        return viewBox.trim().replace(/\s+/g, ' ');
    }

    if (geometryBounds) {
        const padding = 5;
        const minX = toFixedNumber(geometryBounds.minX - padding);
        const minY = toFixedNumber(geometryBounds.minY - padding);
        const width = toFixedNumber((geometryBounds.maxX - geometryBounds.minX) + (padding * 2));
        const height = toFixedNumber((geometryBounds.maxY - geometryBounds.minY) + (padding * 2));

        if (width > 0 && height > 0) {
            return `${minX} ${minY} ${width} ${height}`;
        }
    }

    const width = toFiniteNumber(svgEl.attr('width') || 1103, 1103);
    const height = toFiniteNumber(svgEl.attr('height') || 667, 667);

    return `0 0 ${width} ${height}`;
};

const parseInteractiveLotsFromSvg = (svgData, options = {}) => {
    const selector = options.selector || '.lote-interactivo';
    const scaleFactor = Number.isFinite(options.scaleFactor) ? options.scaleFactor : DEFAULT_SCALE_FACTOR;

    const $ = cheerio.load(svgData, { xmlMode: true });
    const elements = $(selector).toArray();

    const lots = [];
    const usedNumbers = new Set();
    const nextSequentialRef = { value: 1 };
    let geometryBounds = null;

    for (const element of elements) {
        const $element = $(element);
        const pathData = getSvgPathFromElement($element);
        if (!pathData) continue;

        const geometry = extractGeometryData(pathData, scaleFactor);
        if (!geometry) continue;

        const elementId = $element.attr('id') || '';
        lots.push({
            number: buildLotNumber(elementId, usedNumbers, nextSequentialRef),
            status: 'sin_informacion',
            area_m2: geometry.area_m2,
            svg_path: geometry.svg_path,
            centroid: geometry.centroid
        });

        if (!geometryBounds) {
            geometryBounds = { ...geometry.bounds };
        } else {
            geometryBounds.minX = Math.min(geometryBounds.minX, geometry.bounds.minX);
            geometryBounds.minY = Math.min(geometryBounds.minY, geometry.bounds.minY);
            geometryBounds.maxX = Math.max(geometryBounds.maxX, geometry.bounds.maxX);
            geometryBounds.maxY = Math.max(geometryBounds.maxY, geometry.bounds.maxY);
        }
    }

    lots.sort((a, b) => {
        const aNum = Number.parseInt((a.number.match(/\d+/) || [0])[0], 10);
        const bNum = Number.parseInt((b.number.match(/\d+/) || [0])[0], 10);
        return aNum - bNum;
    });

    return {
        viewBox: getViewBox($, geometryBounds),
        lots
    };
};

const parseInteractiveLotsFromSvgFile = (svgFilePath, options = {}) => {
    if (!fs.existsSync(svgFilePath)) {
        throw new Error(`No se encontró el archivo SVG: ${svgFilePath}`);
    }

    const svgData = fs.readFileSync(svgFilePath, 'utf-8');
    return parseInteractiveLotsFromSvg(svgData, options);
};

module.exports = {
    parseInteractiveLotsFromSvg,
    parseInteractiveLotsFromSvgFile
};
