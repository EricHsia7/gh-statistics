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

function pathCommandToCoordinates(str, precision) {
  var points = [];
  var regex = /((m|M)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(l|L)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(h|H)\s{0,1}([0-9\.\-]*)|(v|V)\s{0,1}([0-9\.\-]*)|(c|C)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(s|S)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(q|Q)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)[\,\s]{1,2}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(t|T)\s{0,1}([0-9\.\-]*)(\s|\,)([0-9\.\-]*)|(Z|z))/gm;
  var m = regex.exec(str);
  while ((m = regex.exec(str)) !== null) {
    // This is necessary to avoid infinite loops with zero-width matches
    if (m.index === regex.lastIndex) {
      regex.lastIndex++;
    }
    // The result can be accessed through the `m`-variable.
    m.forEach((match, groupIndex) => {
      if (match === 'M') {
        var x = parseFloat(m[groupIndex + 1]);
        var y = parseFloat(m[groupIndex + 3]);
        points.push({ x, y });
      }
      if (match === 'L') {
        var x = parseFloat(m[groupIndex + 1]);
        var y = parseFloat(m[groupIndex + 3]);
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var a = pX + (x - pX) * (h / (distance / precision));
            var b = pY + (y - pY) * (h / (distance / precision));
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'H') {
        var x = m[groupIndex + 1];
        var y = 0;
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.abs(x - pX);
          for (var h = 0; h < distance / precision; h++) {
            var a = pX + (x - pX) * (h / (distance / precision));
            points.push({ x: a, y: pY });
          }
        }
      }
      if (match === 'V') {
        var x = 0;
        var y = m[groupIndex + 1];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.abs(y - pY);
          for (var h = 0; h < distance / precision; h++) {
            var a = pY + (y - pY) * (h / (distance / precision));
            points.push({ x: pX, y: a });
          }
        }
      }
      if (match === 'C') {
        var x1 = m[groupIndex + 1];
        var y1 = m[groupIndex + 3];
        var x2 = m[groupIndex + 4];
        var y2 = m[groupIndex + 6];
        var x = m[groupIndex + 7];
        var y = m[groupIndex + 9];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 3) * pX + 3 * Math.pow(1 - t, 2) * t * x1 + 3 * (1 - t) * Math.pow(t, 2) * x2 + Math.pow(t, 3) * x;
            var b = Math.pow(1 - t, 3) * pY + 3 * Math.pow(1 - t, 2) * t * y1 + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3) * y;

            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'S') {
        var x2 = m[groupIndex + 1];
        var y2 = m[groupIndex + 3];
        var x = m[groupIndex + 4];
        var y = m[groupIndex + 6];
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;

        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 3) * pX + 3 * Math.pow(1 - t, 2) * t * (2 * pX - x2) + 3 * (1 - t) * Math.pow(t, 2) * x2 + Math.pow(t, 3) * x;
            var b = Math.pow(1 - t, 3) * pY + 3 * Math.pow(1 - t, 2) * t * (2 * pY - y2) + 3 * (1 - t) * Math.pow(t, 2) * y2 + Math.pow(t, 3) * y;
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'Q') {
        var x1 = parseFloat(m[groupIndex + 1]);
        var y1 = parseFloat(m[groupIndex + 3]);
        var x = parseFloat(m[groupIndex + 4]);
        var y = parseFloat(m[groupIndex + 6]);
        var p = points[points.length - 1] || { x: null, y: null };
        var pX = p.x;
        var pY = p.y;
        if (pX === null || pY === null) {
          points.push({ x, y });
        } else {
          var distance = Math.sqrt(Math.pow(x - pX, 2) + Math.pow(y - pY, 2));
          for (var h = 0; h < distance / precision; h++) {
            var t = Math.min(Math.max(h / (distance / precision), 0), 1);
            var a = Math.pow(1 - t, 2) * pX + 2 * (1 - t) * t * x1 + Math.pow(t, 2) * x;
            var b = Math.pow(1 - t, 2) * pY + 2 * (1 - t) * t * y1 + Math.pow(t, 2) * y;
            points.push({ x: a, y: b });
          }
        }
      }
      if (match === 'T') {
        var x = m[groupIndex + 1];
        var y = m[groupIndex + 3];
      }
      if (!(match === undefined)) {
        // console.log(`Found match, group ${groupIndex}: ${match}`);
      }
    });
  }
  return points;
}

module.exports = {
  segmentsToPath,
  distanceToSegment,
  simplifyPath,
  pathCommandToCoordinates
};
