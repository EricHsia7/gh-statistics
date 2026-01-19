function distanceToSegment(point, start, end) {
  var dx = end.x - start.x;
  var dy = end.y - start.y;
  var d = dx * dx + dy * dy;
  var t = ((point.x - start.x) * dx + (point.y - start.y) * dy) / d;

  if (t < 0) {
    dx = point.x - start.x;
    dy = point.y - start.y;
  } else if (t > 1) {
    dx = point.x - end.x;
    dy = point.y - end.y;
  } else {
    var closestPoint = { x: start.x + t * dx, y: start.y + t * dy };
    dx = point.x - closestPoint.x;
    dy = point.y - closestPoint.y;
  }

  return Math.sqrt(dx * dx + dy * dy);
}

function simplifyPath(points, tolerance) {
  if (points.length < 3) {
    return points;
  }

  var dmax = 0;
  var index = 0;

  // Find the point with the maximum distance
  for (var i = 1; i < points.length - 1; i++) {
    var d = distanceToSegment(points[i], points[0], points[points.length - 1]);
    if (d > dmax) {
      index = i;
      dmax = d;
    }
  }

  // If max distance is greater than tolerance, split the curve
  if (dmax > tolerance) {
    var leftPoints = points.slice(0, index + 1);
    var rightPoints = points.slice(index);
    var simplifiedLeft = simplifyPath(leftPoints, tolerance);
    var simplifiedRight = simplifyPath(rightPoints, tolerance);
    return simplifiedLeft.slice(0, simplifiedLeft.length - 1).concat(simplifiedRight);
  } else {
    return [points[0], points[points.length - 1]];
  }
}

function segmentsToPath(segments, firstCommand = 'M', lastCommand = 'M') {
  const len1 = segments.length - 1;
  if (len1 < 0) {
    return [];
  }
  const result = [];
  result.push(`${firstCommand}${segments[0].x},${segments[0].y}`);
  for (let i = 1; i < len1; i++) {
    const current = segments[i];
    const next = segments[i + 1] || current;
    result.push(`Q${current.x},${current.y},${(current.x + next.x) / 2},${(current.y + next.y) / 2}`);
  }
  const lastPoint = segments[len1];
  result.push(`${lastCommand}${lastPoint.x},${lastPoint.y}`);
  return result;
}

module.exports = {
  segmentsToPath,
  distanceToSegment,
  simplifyPath
};
