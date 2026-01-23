const { Resvg } = require('@resvg/resvg-js');
const { Jimp } = require('jimp');

function distanceToSegment(point, start, end) {
  let dx = end[0] - start[0];
  let dy = end[1] - start[1];
  const d = dx * dx + dy * dy;
  const t = ((point[0] - start[0]) * dx + (point[1] - start[1]) * dy) / d;

  if (t < 0) {
    dx = point[0] - start[0];
    dy = point[1] - start[1];
  } else if (t > 1) {
    dx = point[0] - end[0];
    dy = point[1] - end[1];
  } else {
    const closestPoint = [start[0] + t * dx, start[1] + t * dy];
    dx = point[0] - closestPoint[0];
    dy = point[1] - closestPoint[1];
  }

  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyPath(points, tolerance) {
  const length1 = points.length - 1;
  if (length1 < 2) {
    return points;
  }

  let dmax = 0;
  let index = 0;

  // Find the point with the maximum distance
  for (let i = 1; i < length1; i++) {
    const d = distanceToSegment(points[i], points[0], points[length1]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  // If max distance is greater than tolerance, split the curve
  if (dmax > tolerance) {
    const leftPoints = points.slice(0, index + 1);
    const rightPoints = points.slice(index);
    const simplifiedLeft = simplifyPath(leftPoints, tolerance);
    const simplifiedRight = simplifyPath(rightPoints, tolerance);
    simplifiedLeft.pop();
    return simplifiedLeft.concat(simplifiedRight);
  } else {
    return [points[0], points[length1]];
  }
}

function segmentsToPath(segments) {
  const segmentsLength1 = segments.length - 1;
  if (segmentsLength1 < 0) {
    return '';
  }
  const pathCommand = [`M${segments[0][0]} ${segments[0][1]}`];
  for (let i = 1; i < segmentsLength1; i++) {
    const current = segments[i];
    const next = segments[i + 1] || current;
    pathCommand.push(`Q${current[0]} ${current[1]} ${(current[0] + next[0]) / 2} ${(current[1] + next[1]) / 2}`);
  }
  return pathCommand.join(' ');
}

function processStrokeSamples(samples, state, config) {
  const points = [];
  const pointsLeft = [];
  const pointsRight = [];

  let { lastX, lastY, lastTime, lastDyDxSign, side } = state;

  for (const [x, y, f, time] of samples) {
    const dt = time - lastTime;

    // Prevent division by zero or tiny movements
    if (dt < config.minDt || (Math.abs(x - lastX) < config.minMove && Math.abs(y - lastY) < config.minMove)) {
      continue;
    }

    // 1) Velocity
    const dist = Math.hypot(x - lastX, y - lastY);
    const speed = dist / dt;

    // 2) Radius R (preserving your original expression exactly)
    let R = config.BASE_R * Math.pow(f, 0.4) * (0.5 / (0.5 - 0.2)) * 0.5 + config.BASE_R * Math.max(0.3, Math.log(speed) / Math.log(1.8)) * (-0.2 / (0.5 - 0.2)) * 0.5 || 0;

    if (R > config.MAX_R) R = config.MAX_R;
    if (R < config.MIN_R) R = config.MIN_R;

    // 3) Derivatives and angle t = atan(dy/dx)
    const dx = x - lastX;
    const dy = y - lastY;

    let t = Math.atan(dy / dx);
    if (dx === 0) t = (Math.PI / 2) * Math.sign(dy);

    // 4) Determine side flip by sign change of dy/dx
    const currentDyDxSign = Math.sign(dy / dx);

    let sideFlipped = false;
    if (lastDyDxSign !== 0 && currentDyDxSign !== 0 && currentDyDxSign !== lastDyDxSign) {
      side *= -1;
      sideFlipped = true;
    }
    lastDyDxSign = currentDyDxSign;

    // 5) Compute left/right points
    const x_left = x + R * Math.cos(t + (side * Math.PI) / 2);
    const y_left = y + R * Math.sin(t + (side * Math.PI) / 2);

    const x_right = x + R * Math.cos(t - (side * Math.PI) / 2);
    const y_right = y + R * Math.sin(t - (side * Math.PI) / 2);

    // Store center
    points.push([x, y]);

    // Side flip handling (kept structurally the same as your code)
    if (sideFlipped) {
      const previousPoint = points[points.length - 1] || [x, y];
      const previousLeftPoint = pointsLeft[pointsLeft.length - 1] || [x, y];
      const previousRightPoint = pointsRight[pointsRight.length - 1] || [x, y];

      const v2 = [x_left - previousLeftPoint[0], y_left - previousLeftPoint[1]];
      const v1 = [x_right - previousRightPoint[0], y_right - previousRightPoint[1]];
      const v3 = [x_right - x_left, y_right - y_left];

      const delta = v1[0] * v2[1] - v2[0] * v1[1];
      const deltaT = v2[0] * v3[1] - v3[0] * v2[1];
      const T = deltaT / delta;

      const P = [x_right + v1[0] * T, y_right + v1[1] * T];
      const d = Math.hypot(P[0] - x, P[1] - y);

      const distanceMismatching = Math.hypot(...v1) > Math.hypot(x_left - previousRightPoint[1], y_left - previousRightPoint[1]) || Math.hypot(...v2) > Math.hypot(x_right - previousLeftPoint[0], y_right - previousLeftPoint[1]);

      if (d <= R || distanceMismatching) {
        pointsRight.push([x_left, y_left]);
        pointsLeft.push([x_right, y_right]);
        side *= -1;
      } else {
        pointsLeft.push([x_left, y_left]);
        pointsRight.push([x_right, y_right]);
      }
    } else {
      pointsLeft.push([x_left, y_left]);
      pointsRight.push([x_right, y_right]);
    }

    // Update history for next sample
    lastX = x;
    lastY = y;
    lastTime = time;
  }

  return {
    points,
    pointsLeft,
    pointsRight,
    state: { lastX, lastY, lastTime, lastDyDxSign, side }
  };
}

async function rasterize(svgText, outputPath, width, height, scale) {
  const svg = Buffer.from(svgText, 'utf-8');
  const options = {
    fitTo: {
      mode: 'width',
      value: width * scale
    }
  };
  const resvg = new Resvg(svg, options);
  const pngData = resvg.render();
  const pngBuffer = pngData.asPng();
  const resizedImage = await Jimp.fromBuffer(pngBuffer);
  resizedImage.resize({ w: width, h: height });
  await resizedImage.write(outputPath);
}

module.exports = {
  segmentsToPath,
  distanceToSegment,
  simplifyPath,
  processStrokeSamples,
  rasterize
};
