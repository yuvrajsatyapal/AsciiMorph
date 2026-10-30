//! Rounded path coverage using quadratic edges and byte scanline accumulation.
//! Fixed-point edge and trapezoid arithmetic is derived from Skia's
//! SkAnalyticEdge.cpp and SkScan_AAAPath.cpp (BSD, see third-party/skia-LICENSE).
const ONE: i64 = 65536;
type Point = [f32; 2];
#[derive(Clone, Copy, Default)]
struct Curve {
    p: [Point; 3],
    line: bool,
}
#[derive(Clone, Copy, Default)]
struct Segment {
    x: i64,
    y: i64,
    end: i64,
    dx: i64,
    dy: i64,
    smooth: bool,
    remaining: bool,
    next_edge_y: i64,
}
fn mul(a: i64, b: i64) -> i64 {
    (a * b) >> 16
}
fn snap_y(v: i64) -> i64 {
    (v + 8192) & !16383
}
fn ceil(v: i64) -> i64 {
    (v + 65535) & !65535
}
fn inverse(v: i64) -> i64 {
    if v == 0 {
        i32::MAX as i64
    } else {
        (1i64 << 22) / v
    }
}
fn div(a: i64, b: i64) -> i64 {
    if b.abs() >= 8 && b.abs() < 1024 && a.abs() < 4096 {
        (a * inverse(b)) >> 6
    } else {
        (a << 16) / b
    }
}
fn segment(x: i64, y: i64, nx: i64, ny: i64) -> Option<Segment> {
    segment_with_slope(x, y, nx, ny, None)
}
fn segment_with_slope(x: i64, y: i64, nx: i64, ny: i64, slope: Option<i64>) -> Option<Segment> {
    let (dx, dy) = ((nx - x) >> 10, (ny - y) >> 10);
    if dy == 0 {
        return None;
    }
    let slope = slope.unwrap_or_else(|| div(dx, dy));
    let a = (slope >> 10).abs();
    Some(Segment {
        x,
        y,
        end: ny,
        dx: slope,
        dy: if dx == 0 || slope == 0 {
            i32::MAX as i64
        } else if a < 1024 {
            inverse(a)
        } else {
            div(dy, dx).abs()
        },
        smooth: false,
        remaining: false,
        next_edge_y: i64::MAX,
    })
}
#[derive(Clone, Copy, Default)]
struct Quadratic {
    x: i64,
    y: i64,
    dx: i64,
    dy: i64,
    ddx: i64,
    ddy: i64,
    last_x: i64,
    last_y: i64,
    sx: i64,
    sy: i64,
    shift: u32,
    count: u32,
}
impl Quadratic {
    fn new(p: [Point; 3]) -> Self {
        let mut p = p.map(|p| p.map(|v| (v * 256.) as i64));
        if p[0][1] > p[2][1] {
            p.swap(0, 2)
        }
        let [a, b, c] = p;
        let dx = ((2 * b[0] - a[0] - c[0]) >> 2).abs();
        let dy = ((2 * b[1] - a[1] - c[1]) >> 2).abs();
        let dist = (dx.max(dy) + (dx.min(dy) >> 1) + 16) >> 5;
        let shift = ((64 - dist.leading_zeros()) / 2).clamp(1, 6);
        let coeff = |k: usize| {
            let aa = (a[k] - 2 * b[k] + c[k]) * 512;
            let bb = (b[k] - a[k]) * 1024;
            ((bb + (aa >> shift)) >> 2, (aa >> (shift - 1)) >> 2)
        };
        let (dx, ddx) = coeff(0);
        let (dy, ddy) = coeff(1);
        let x = a[0] * 256;
        let y = snap_y(a[1] * 256);
        Self {
            x,
            y,
            dx,
            dy,
            ddx,
            ddy,
            last_x: c[0] * 256,
            last_y: snap_y(c[1] * 256),
            sx: x,
            sy: y,
            shift: shift - 1,
            count: 1 << shift,
        }
    }
    fn next(&mut self) -> Option<Segment> {
        while self.count > 0 {
            self.count -= 1;
            let mut slope = None;
            let (nx, ny, sx, sy) = if self.count == 0 {
                (self.last_x, self.last_y, self.last_x, self.last_y)
            } else {
                let nx = self.x + (self.dx >> self.shift);
                let ny = self.y + (self.dy >> self.shift);
                let (sx, sy) = if (self.dy >> self.shift).abs() >= 2 * ONE
                    && (self.dy.abs() << 6) > self.dx.abs()
                {
                    let dy = (ny - self.sy) >> 10;
                    let original_slope = if dy == 0 {
                        0
                    } else {
                        div((nx - self.sx) >> 10, dy)
                    };
                    // Skia carries the pre-snap slope into updateLine; deriving
                    // it again from the snapped endpoint changes corner bytes.
                    slope = Some(original_slope);
                    let sy = ((ny + 32768) & !65535).min(self.last_y);
                    (nx - mul(original_slope, ny - sy), sy)
                } else {
                    (nx, snap_y(ny).min(self.last_y))
                };
                self.dx += self.ddx;
                self.dy += self.ddy;
                (nx, ny, sx, sy)
            };
            let mut s = segment_with_slope(self.sx, self.sy, sx, sy, slope);
            self.x = nx;
            self.y = ny;
            if let Some(s) = s.as_mut() {
                // A flat subdivision advances the polynomial, but not the
                // snapped origin used to calculate the next nonempty segment.
                self.sx = sx;
                self.sy = sy;
                s.remaining = self.count > 0;
                s.smooth = self.count > 0
                    && self.dx.abs() >> 1 >= self.ddx.abs()
                    && self.dy.abs() >> 1 >= self.ddy.abs()
                    && (self.dy - self.ddy) >> self.shift >= ONE;
            }
            if s.is_some() {
                return s;
            }
        }
        None
    }
}
const MAX_CURVES: usize = 129;
struct Side {
    curves: [Curve; MAX_CURVES],
    len: usize,
    index: usize,
    quad: Quadratic,
    clip: [f32; 2],
    clipped: bool,
}
impl Side {
    fn new(
        left: f32,
        top: f32,
        right: f32,
        bottom: f32,
        r: f32,
        is_left: bool,
        clip: [f32; 2],
    ) -> Self {
        let mut s = Self {
            curves: [Curve::default(); MAX_CURVES],
            len: 0,
            index: 0,
            quad: Quadratic::default(),
            clip,
            clipped: left < 0. || top < 0. || right > clip[0] || bottom > clip[1],
        };
        let x = if is_left { left } else { right };
        let inner = if is_left { left + r } else { right - r };
        let w = std::f32::consts::FRAC_1_SQRT_2;
        let mut error = (r * r * 2.).sqrt() * ((w - 1.) / (4. * (1. + w))).abs();
        let mut depth = 0;
        while error > 0.25 && depth < 5 {
            error *= 0.25;
            depth += 1;
        }
        s.conic([[inner, top], [x, top], [x, top + r]], w, depth);
        s.push(Curve {
            p: [[x, top + r], [x, bottom - r], [x, bottom - r]],
            line: true,
        });
        s.conic([[x, bottom - r], [x, bottom], [inner, bottom]], w, depth);
        s
    }
    fn append(&mut self, c: Curve) {
        self.curves[self.len] = c;
        self.len += 1;
    }
    fn push(&mut self, c: Curve) {
        if !c.line && self.clipped {
            self.chop_extrema(c.p, 1);
        } else {
            self.push_monotonic(c);
        }
    }
    // The clipping edge builder normalizes extrema before clipping even when
    // only a distant corner of the overall path intersects the clip.
    fn chop_extrema(&mut self, mut p: [Point; 3], axis: usize) {
        let [a, b, c] = p.map(|p| p[axis]);
        if b < a.min(c) || b > a.max(c) {
            let t = (a - b) / (a - b - b + c);
            if t > 0. && t < 1. {
                let (mut first, mut second) = split(p, t);
                first[1][axis] = first[2][axis];
                second[1][axis] = second[0][axis];
                if axis == 1 {
                    self.chop_extrema(first, 0);
                    self.chop_extrema(second, 0);
                } else {
                    self.push_monotonic(Curve {
                        p: first,
                        line: false,
                    });
                    self.push_monotonic(Curve {
                        p: second,
                        line: false,
                    });
                }
                return;
            }
            p[1][axis] = if (a - b).abs() < (b - c).abs() { a } else { c };
        }
        if axis == 1 {
            self.chop_extrema(p, 0);
        } else {
            self.push_monotonic(Curve { p, line: false });
        }
    }
    fn push_monotonic(&mut self, mut c: Curve) {
        let bottom = self.clip[1];
        let right = self.clip[0];
        if c.p[0][1] >= bottom || c.p[2][1] <= 0. {
            return;
        }
        if c.line {
            c.p[0][1] = c.p[0][1].max(0.);
            c.p[1][1] = c.p[1][1].min(bottom);
            c.p[2] = c.p[1];
            for p in &mut c.p {
                p[0] = p[0].clamp(0., right);
            }
            self.append(c);
            return;
        }
        if c.p[2][1] > bottom {
            let (mut a, _) = split(c.p, root(c.p, 1, bottom));
            a[1][1] = a[1][1].min(bottom);
            a[2][1] = bottom;
            c.p = a;
        }
        if c.p[0][1] < 0. {
            let (_, mut a) = split(c.p, root(c.p, 1, 0.));
            a[0][1] = 0.;
            a[1][1] = a[1][1].max(0.);
            c.p = a;
        }
        for boundary in [0., right] {
            let outside = |x: f32| if boundary == 0. { x < 0. } else { x > right };
            if outside(c.p[0][0]) && outside(c.p[2][0]) {
                for p in &mut c.p {
                    p[0] = boundary;
                }
                c.line = true;
                c.p[1] = c.p[2];
                self.append(c);
                return;
            }
            if outside(c.p[0][0]) != outside(c.p[2][0]) {
                let (mut a, mut b) = split(c.p, root(c.p, 0, boundary));
                a[2][0] = boundary;
                b[0][0] = boundary;
                if outside(c.p[0][0]) {
                    self.append(Curve {
                        p: [
                            [boundary, a[0][1]],
                            [boundary, a[2][1]],
                            [boundary, a[2][1]],
                        ],
                        line: true,
                    });
                    b[1][0] = b[1][0].clamp(0., right);
                    c.p = b;
                } else {
                    a[1][0] = a[1][0].clamp(0., right);
                    self.append(Curve { p: a, line: false });
                    self.append(Curve {
                        p: [
                            [boundary, b[0][1]],
                            [boundary, b[2][1]],
                            [boundary, b[2][1]],
                        ],
                        line: true,
                    });
                    return;
                }
            }
        }
        self.append(c);
    }
    fn conic(&mut self, p: [Point; 3], w: f32, depth: u32) {
        if depth == 0 {
            self.push(Curve { p, line: false });
            return;
        }
        let scale = 1. / (1. + w);
        // Chromium's conic subdivision multiplies the control point by its
        // weight before adding the endpoints. Preserve that float operation order.
        let weighted = p[1].map(|v| v * w);
        let mut p1 = [
            (p[0][0] + weighted[0]) * scale,
            (p[0][1] + weighted[1]) * scale,
        ];
        let mut p3 = [
            (weighted[0] + p[2][0]) * scale,
            (weighted[1] + p[2][1]) * scale,
        ];
        let mut mid = [
            (p[0][0] + 2. * weighted[0] + p[2][0]) * scale * 0.5,
            (p[0][1] + 2. * weighted[1] + p[2][1]) * scale * 0.5,
        ];
        // Preserve SkConic subdivision Y monotonicity before extrema chopping.
        let between = |a: f32, b: f32, c: f32| b >= a.min(c) && b <= a.max(c);
        if between(p[0][1], p[1][1], p[2][1]) {
            if !between(p[0][1], mid[1], p[2][1]) {
                mid[1] = if (mid[1] - p[0][1]).abs() < (mid[1] - p[2][1]).abs() {
                    p[0][1]
                } else {
                    p[2][1]
                };
            }
            if !between(p[0][1], p1[1], mid[1]) {
                p1[1] = p[0][1];
            }
            if !between(mid[1], p3[1], p[2][1]) {
                p3[1] = p[2][1];
            }
        }
        let w = (0.5 + 0.5 * w).sqrt();
        self.conic([p[0], p1, mid], w, depth - 1);
        self.conic([mid, p3, p[2]], w, depth - 1);
    }
    fn next(&mut self) -> Option<Segment> {
        loop {
            if let Some(mut s) = self.quad.next() {
                s.next_edge_y = self
                    .curves
                    .get(self.index)
                    .filter(|_| self.index < self.len)
                    .map_or(i64::MAX, |c| snap_y((c.p[0][1] * 256.) as i64 * 256));
                return Some(s);
            }
            if self.index == self.len {
                return None;
            }
            let c = self.curves[self.index];
            self.index += 1;
            if c.line {
                let [a, b, _] = c.p.map(|p| p.map(|v| (v * 256.) as i64 * 256));
                if let Some(mut s) = segment(a[0], snap_y(a[1]), b[0], snap_y(b[1])) {
                    s.next_edge_y = self
                        .curves
                        .get(self.index)
                        .filter(|_| self.index < self.len)
                        .map_or(i64::MAX, |c| snap_y((c.p[0][1] * 256.) as i64 * 256));
                    return Some(s);
                }
            } else {
                self.quad = Quadratic::new(c.p);
            }
        }
    }
}
fn root(p: [Point; 3], axis: usize, value: f32) -> f32 {
    let a = (p[0][axis] - 2. * p[1][axis] + p[2][axis]) as f64;
    let b = (2. * (p[1][axis] - p[0][axis])) as f64;
    let c = (p[0][axis] - value) as f64;
    if a == 0. {
        return (-c / b) as f32;
    }
    let d = (b * b - 4. * a * c).max(0.).sqrt();
    let t = (-b + d) / (2. * a);
    if (0.0..=1.0).contains(&t) {
        t as f32
    } else {
        ((-b - d) / (2. * a)) as f32
    }
}
fn split(p: [Point; 3], t: f32) -> ([Point; 3], [Point; 3]) {
    let lerp = |a: Point, b: Point| [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
    let a = lerp(p[0], p[1]);
    let b = lerp(p[1], p[2]);
    let m = lerp(a, b);
    ([p[0], a, m], [m, b, p[2]])
}
fn triangle(a: i64, b: i64) -> u8 {
    ((((a >> 11) * (a >> 11) * (b >> 11)) >> 8) & 255) as u8
}
fn trapezoid(a: i64, b: i64) -> u8 {
    (((a + b) / 2) >> 8) as u8
}
fn partial(a: u8, h: u8) -> u8 {
    ((a as u32 * h as u32) >> 8) as u8
}
fn full_alpha(h: i64) -> u8 {
    ((255 * h + 32768) >> 16).clamp(0, 255) as u8
}
// Excluded byte area below/above a segment, at a single destination column.
fn excluded(l: i64, r: i64, dy: i64, full: u8, column: i64, above: bool) -> u8 {
    let start = l >> 16;
    let len = (ceil(r) >> 16) - start;
    let i = column - start;
    if i < 0 || i >= len {
        return 0;
    }
    let l = l - start * ONE;
    let r = r - start * ONE;
    if len == 1 {
        return partial(
            if above {
                (((2 * ONE - l - r) >> 9) & 255) as u8
            } else {
                trapezoid(l, r)
            },
            full,
        );
    }
    let first = ONE - l;
    let last = r - (len - 1) * ONE;
    if above {
        if i == 0 {
            (mul(first, mul(first, dy)) >> 9) as u8
        } else if i == len - 1 {
            full.wrapping_sub(triangle(last, dy))
        } else {
            ((mul(first, dy) + (dy >> 1) + (i - 1) * dy) >> 8) as u8
        }
    } else if i == len - 1 {
        (mul(last, mul(last, dy)) >> 9) as u8
    } else if i == 0 {
        full.wrapping_sub(triangle(first, dy))
    } else {
        ((mul(last, dy) + (dy >> 1) + (len - 2 - i) * dy) >> 8) as u8
    }
}
fn direct_two(a: u8, full: u8, generic_blit: bool) -> u8 {
    if !generic_blit && full == 255 && a > 0 && a < 128 {
        a - 1
    } else {
        a
    }
}
fn trap(
    ul: i64,
    ur: i64,
    ll: i64,
    lr: i64,
    ldy: i64,
    rdy: i64,
    full: u8,
    column: i64,
    generic_blit: bool,
) -> (u8, bool) {
    if ul > ur {
        return (0, false);
    }
    let (ll, lr) = if ll > lr {
        let intersection = (ul.min(ll).max(ur.min(lr)) + ul.max(ll).min(ur.max(lr))) / 2;
        (intersection, intersection)
    } else {
        (ll, lr)
    };
    if ul == ur && ll == lr {
        return (0, false);
    }
    let (ul, ll) = (ul.min(ll), ul.max(ll));
    let (ur, lr) = (ur.min(lr), ur.max(lr));
    let jl = ceil(ll);
    let jr = ur & !65535;
    if jl <= jr {
        if column >= jl / ONE && column < jr / ONE {
            return (full, full != 255);
        }
        if column < jl / ONE && ul < jl {
            let start = ul >> 16;
            let len = (ceil(jl - ul) >> 16) as i32;
            if len == 1 && column == start {
                return (
                    if full == 255 {
                        trapezoid(jl - ul, jl - ll)
                    } else {
                        partial(trapezoid(jl - ul, jl - ll), full)
                    },
                    full != 255,
                );
            }
            if len == 2 {
                let first = jl - ONE - ul;
                let second = ll - ul - first;
                return (
                    direct_two(
                        if column == start {
                            triangle(first, ldy)
                        } else if column == start + 1 {
                            full.wrapping_sub(triangle(second, ldy))
                        } else {
                            0
                        },
                        full,
                        generic_blit,
                    ),
                    full != 255,
                );
            }
        }
        if column >= jr / ONE && lr > jr {
            let start = jr >> 16;
            let len = ceil(lr - jr) >> 16;
            if len == 1 && column == start {
                return (
                    if full == 255 {
                        trapezoid(ur - jr, lr - jr)
                    } else {
                        partial(trapezoid(ur - jr, lr - jr), full)
                    },
                    full != 255,
                );
            }
            if len == 2 {
                let first = jr + ONE - ur;
                let second = lr - ur - first;
                return (
                    direct_two(
                        if column == start {
                            full.wrapping_sub(triangle(first, rdy))
                        } else if column == start + 1 {
                            triangle(second, rdy)
                        } else {
                            0
                        },
                        full,
                        generic_blit,
                    ),
                    full != 255,
                );
            }
        }
    }
    let start = ul >> 16;
    let end = ceil(lr) >> 16;
    if column < start || column >= end {
        return (0, false);
    }
    if end - start == 1 {
        let a = trapezoid(ur - ul, lr - ll);
        return (if full == 255 { a } else { partial(a, full) }, full != 255);
    }
    let mut alpha = full;
    for (a, b, dy, above) in [(ul, ll, ldy, false), (ur, lr, rdy, true)] {
        let u = a >> 16;
        let l = ceil(b) >> 16;
        let exclusion = if u + 2 == l {
            let first = (u + 1) * ONE - a;
            let second = b - a - first;
            if column == u {
                if above {
                    triangle(first, dy)
                } else {
                    full.wrapping_sub(triangle(first, dy))
                }
            } else if column == u + 1 {
                if above {
                    full.wrapping_sub(triangle(second, dy))
                } else {
                    triangle(second, dy)
                }
            } else {
                0
            }
        } else {
            excluded(a, b, dy, full, column, above)
        };
        alpha = alpha.saturating_sub(exclusion);
    }
    (alpha, full != 255)
}
pub(super) fn coverage(bounds: [f64; 4], radius: f64, x: usize, y: usize, clip: [usize; 2]) -> f64 {
    let [l, t, r, b] = bounds.map(|v| v as f32);
    let rad = (radius as f32).min((r - l) / 2.).min((b - t) / 2.);
    if rad <= 0. {
        return ((r.min(x as f32 + 1.) - l.max(x as f32)).max(0.)
            * (b.min(y as f32 + 1.) - t.max(y as f32)).max(0.)) as f64;
    }
    // Full rows between the corners use unsnapped vertical edges. Avoid building
    // quadratic state for these pixels, which make up most large tiles.
    if y as i64 * ONE >= ceil(snap_y(((t + rad) * 256.) as i64 * 256))
        && (y as i64 + 1) * ONE <= snap_y(((b - rad) * 256.) as i64 * 256) & !65535
    {
        let left = (l * 256.) as i64 * 256;
        let right = (r * 256.) as i64 * 256;
        let width = (right.min((x as i64 + 1) * ONE) - left.max(x as i64 * ONE)).max(0);
        return full_alpha(width) as f64 / 255.;
    }
    let mut left = Side::new(l, t, r, b, rad, true, clip.map(|v| v as f32));
    let mut right = Side::new(l, t, r, b, rad, false, clip.map(|v| v as f32));
    let Some(mut ls) = left.next() else { return 0. };
    let Some(mut rs) = right.next() else {
        return 0.;
    };
    let mut ln = left.next();
    let mut rn = right.next();
    let mut scan = ls.y.max(rs.y);
    let target = y as i64;
    let column = x as i64;
    let mut alpha = 0u8;
    let mut queued = false;
    let mut carried_left = None;
    let mut carried_right = None;
    // Mask storage is selected from the original path bounds, before clipping.
    let width = (r.ceil() - l.floor()).max(0.) as usize;
    let height = (b.ceil() - t.floor()).max(0.) as usize;
    let using_mask = width <= 32 && ((width + 3) & !3) * height <= 1024;
    // Run-based edges may drift beyond the path box, but never the clip.
    let left_bound = if using_mask {
        (l.floor().max(0.) as i64) * ONE
    } else {
        0
    };
    let right_bound = if using_mask {
        (r.ceil().min(clip[0] as f32) as i64) * ONE
    } else {
        clip[0] as i64 * ONE
    };
    while scan < (target + 1) * ONE {
        while ls.end <= scan {
            let Some(next) = ln else {
                return finish(alpha, queued && !using_mask);
            };
            ls = next;
            carried_left = None;
            ln = left.next();
        }
        while rs.end <= scan {
            let Some(next) = rn else {
                return finish(alpha, queued && !using_mask);
            };
            rs = next;
            carried_right = None;
            rn = right.next();
        }
        let smooth = |s: Segment, n: Option<Segment>| {
            if s.remaining {
                s.smooth
            } else {
                n.is_some_and(|n| (n.dx - s.dx).abs() <= ONE && n.end - n.y >= ONE)
            }
        };
        let mut end = ls.end.min(rs.end);
        let stop = (b.ceil() as i64).min(clip[1] as i64) * ONE;
        let smooth_jump = if ls.next_edge_y.min(rs.next_edge_y) >= stop {
            false
        } else if ls.end + ONE < rs.end {
            smooth(ls, ln)
        } else if rs.end + ONE < ls.end {
            smooth(rs, rn)
        } else {
            ls.next_edge_y.max(rs.next_edge_y) < stop && smooth(ls, ln) && smooth(rs, rn)
        };
        if smooth_jump {
            end = ceil(end)
        }
        end = end.min((b.ceil() as i64).min(clip[1] as i64) * ONE);
        let mut lx = carried_left
            .unwrap_or_else(|| ls.x + mul(ls.dx, scan - ls.y))
            .max(left_bound);
        let mut rx = carried_right
            .unwrap_or_else(|| rs.x + mul(rs.dx, scan - rs.y))
            .min(right_bound);
        while scan < end {
            let next = ceil(scan + 1).min(end);
            let height = next - scan;
            let nx = (lx + mul(ls.dx, height)).max(left_bound);
            let nr = (rx + mul(rs.dx, height)).min(right_bound);
            if scan >> 16 == target {
                let (a, pending) = if ls.dx == 0 && rs.dx == 0 {
                    let width = (rx.min((column + 1) * ONE) - lx.max(column * ONE)).max(0);
                    (full_alpha(mul(width, height)), height != ONE)
                } else {
                    trap(
                        (lx + 2048) & !4095,
                        (rx + 2048) & !4095,
                        (nx + 2048) & !4095,
                        (nr + 2048) & !4095,
                        ls.dy,
                        rs.dy,
                        full_alpha(height),
                        column,
                        // Horizontal clip wrappers dispatch pairs through the
                        // general blitter, bypassing its direct-pair interpolation.
                        using_mask || l < 0. || r > clip[0] as f32,
                    )
                };
                alpha = alpha.saturating_add(a);
                queued |= pending;
            }
            scan = next;
            lx = nx;
            rx = nr;
        }
        carried_left = Some(lx);
        carried_right = Some(rx);
    }
    finish(alpha, queued && !using_mask)
}
fn finish(alpha: u8, snap: bool) -> f64 {
    let alpha = if snap && alpha > 247 {
        255
    } else if snap && alpha < 8 {
        0
    } else {
        alpha
    };
    alpha as f64 / 255.
}
