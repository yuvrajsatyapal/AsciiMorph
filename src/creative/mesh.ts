import { createDocument } from "@/core/document";
export type Vec3 = [number, number, number];
export interface Mesh {
  vertices: Vec3[];
  faces: [number, number, number][];
}
const MAX_VERTICES = 50000,
  MAX_FACES = 50000;
function validate(mesh: Mesh): Mesh {
  if (
    !mesh.vertices.length ||
    !mesh.faces.length ||
    mesh.vertices.length > MAX_VERTICES ||
    mesh.faces.length > MAX_FACES ||
    mesh.vertices.some((v) =>
      v.some((n) => !Number.isFinite(n) || Math.abs(n) > 1e12),
    ) ||
    mesh.faces.some((f) =>
      f.some((n) => !Number.isInteger(n) || n < 0 || n >= mesh.vertices.length),
    )
  )
    throw new Error(
      "Invalid or oversized mesh (50,000 vertices/triangles maximum)",
    );
  return mesh;
}
export function parseObj(text: string): Mesh {
  if (text.length > 12 * 1024 * 1024) throw new Error("OBJ exceeds 12 MiB");
  const vertices: Vec3[] = [],
    faces: Mesh["faces"] = [];
  let lineCount = 0;
  for (let i = 0; i < text.length; i++)
    if (text.charCodeAt(i) === 10 && ++lineCount > 200000)
      throw new Error("OBJ line count exceeds resource limits");
  for (const line of text.split(/\r?\n/)) {
    if (line.length > 16000)
      throw new Error("OBJ line exceeds resource limits");
    const [kind, ...parts] = line.trim().split(/\s+/);
    if (kind === "v") {
      vertices.push(parts.slice(0, 3).map(Number) as Vec3);
      if (parts.length < 3 || vertices.length > MAX_VERTICES)
        throw new Error("Invalid or oversized OBJ");
    }
    if (kind === "f") {
      if (parts.length < 3 || parts.length > 1000)
        throw new Error("Invalid OBJ polygon");
      const ids = parts.map((p) => {
        const n = Number(p.split("/")[0]);
        return n < 0 ? vertices.length + n : n - 1;
      });
      for (let i = 1; i < ids.length - 1; i++)
        faces.push([ids[0], ids[i], ids[i + 1]]);
      if (faces.length > MAX_FACES) throw new Error("Too many triangles");
    }
  }
  return normalize(validate({ vertices, faces }));
}
interface Accessor {
  bufferView?: number;
  byteOffset?: number;
  componentType: number;
  count: number;
  type: string;
  sparse?: unknown;
}
interface Gltf {
  asset?: { version: string };
  buffers?: { uri?: string; byteLength: number }[];
  bufferViews?: {
    buffer: number;
    byteOffset?: number;
    byteLength: number;
    byteStride?: number;
  }[];
  accessors?: Accessor[];
  meshes?: {
    primitives: {
      attributes: { POSITION?: number };
      indices?: number;
      mode?: number;
    }[];
  }[];
  nodes?: {
    mesh?: number;
    children?: number[];
    matrix?: number[];
    translation?: number[];
    rotation?: number[];
    scale?: number[];
  }[];
  scenes?: { nodes?: number[] }[];
  scene?: number;
}
const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
function multiply(a: number[], b: number[]) {
  return Array.from({ length: 16 }, (_, i) => {
    const row = i % 4,
      col = Math.floor(i / 4);
    return (
      a[row] * b[col * 4] +
      a[4 + row] * b[col * 4 + 1] +
      a[8 + row] * b[col * 4 + 2] +
      a[12 + row] * b[col * 4 + 3]
    );
  });
}
function nodeMatrix(n: NonNullable<Gltf["nodes"]>[number]) {
  if (n.matrix) {
    if (n.matrix.length !== 16 || n.matrix.some((x) => !Number.isFinite(x)))
      throw new Error("Invalid node matrix");
    return n.matrix;
  }
  const [x, y, z, w] = n.rotation || [0, 0, 0, 1],
    [sx, sy, sz] = n.scale || [1, 1, 1],
    [tx, ty, tz] = n.translation || [0, 0, 0];
  return [
    (1 - 2 * y * y - 2 * z * z) * sx,
    (2 * x * y + 2 * z * w) * sx,
    (2 * x * z - 2 * y * w) * sx,
    0,
    (2 * x * y - 2 * z * w) * sy,
    (1 - 2 * x * x - 2 * z * z) * sy,
    (2 * y * z + 2 * x * w) * sy,
    0,
    (2 * x * z + 2 * y * w) * sz,
    (2 * y * z - 2 * x * w) * sz,
    (1 - 2 * x * x - 2 * y * y) * sz,
    0,
    tx,
    ty,
    tz,
    1,
  ];
}
export function parseGlb(buffer: ArrayBuffer): Mesh {
  if (buffer.byteLength > 20 * 1024 * 1024 || buffer.byteLength < 20)
    throw new Error("Invalid GLB size (20 MiB maximum)");
  const view = new DataView(buffer);
  if (
    view.getUint32(0, true) !== 0x46546c67 ||
    view.getUint32(4, true) !== 2 ||
    view.getUint32(8, true) !== buffer.byteLength
  )
    throw new Error("Expected GLB version 2");
  let json: Gltf | undefined, bin: ArrayBuffer | undefined;
  for (let p = 12; p + 8 <= buffer.byteLength; ) {
    const size = view.getUint32(p, true),
      type = view.getUint32(p + 4, true);
    p += 8;
    if (size % 4 || p + size > buffer.byteLength)
      throw new Error("Invalid GLB chunk");
    if (type === 0x4e4f534a)
      json = JSON.parse(
        new TextDecoder().decode(buffer.slice(p, p + size)).trim(),
      );
    if (type === 0x004e4942) bin = buffer.slice(p, p + size);
    p += size;
  }
  if (
    !json ||
    !bin ||
    json.asset?.version !== "2.0" ||
    json.buffers?.some((b) => b.uri) ||
    !json.meshes?.length
  )
    throw new Error(
      "GLB must contain embedded mesh data without external resources",
    );
  const g = json,
    bytes = new DataView(bin),
    mesh: Mesh = { vertices: [], faces: [] };
  function read(index: number, components: number) {
    const a = g.accessors?.[index];
    if (
      !a ||
      a.sparse ||
      a.bufferView === undefined ||
      !Number.isInteger(a.count) ||
      a.count < 1 ||
      a.count > MAX_FACES * 3 ||
      a.type !== (components === 3 ? "VEC3" : "SCALAR")
    )
      throw new Error("Unsupported GLB accessor");
    const b = g.bufferViews?.[a.bufferView];
    const size =
      a.componentType === 5126 || a.componentType === 5125
        ? 4
        : a.componentType === 5123
          ? 2
          : a.componentType === 5121
            ? 1
            : 0;
    if (
      !b ||
      b.buffer !== 0 ||
      !size ||
      (components === 3 && a.componentType !== 5126)
    )
      throw new Error("Unsupported GLB vertex/index format");
    const stride = b.byteStride || size * components,
      start = (b.byteOffset || 0) + (a.byteOffset || 0),
      end = start + (a.count - 1) * stride + components * size;
    if (
      stride < components * size ||
      start < 0 ||
      end > bytes.byteLength ||
      end > (b.byteOffset || 0) + b.byteLength
    )
      throw new Error("GLB accessor out of bounds");
    return Array.from({ length: a.count }, (_, i) =>
      Array.from({ length: components }, (_, j) => {
        const p = start + i * stride + j * size;
        return a.componentType === 5126
          ? bytes.getFloat32(p, true)
          : a.componentType === 5125
            ? bytes.getUint32(p, true)
            : a.componentType === 5123
              ? bytes.getUint16(p, true)
              : bytes.getUint8(p);
      }),
    );
  }
  function addMesh(index: number, m: number[]) {
    const source = g.meshes?.[index];
    if (!source) throw new Error("Missing GLB mesh");
    for (const p of source.primitives) {
      if ((p.mode ?? 4) !== 4 || p.attributes.POSITION === undefined)
        throw new Error("Only triangle GLB meshes are supported");
      const positions = read(p.attributes.POSITION, 3),
        offset = mesh.vertices.length;
      for (const [x, y, z] of positions)
        mesh.vertices.push([
          m[0] * x + m[4] * y + m[8] * z + m[12],
          m[1] * x + m[5] * y + m[9] * z + m[13],
          m[2] * x + m[6] * y + m[10] * z + m[14],
        ]);
      const ids =
        p.indices === undefined
          ? positions.map((_, i) => i)
          : read(p.indices, 1).map((v) => v[0]);
      if (ids.length % 3 || ids.some((i) => i < 0 || i >= positions.length))
        throw new Error("Invalid GLB triangles");
      for (let i = 0; i < ids.length; i += 3)
        mesh.faces.push([
          offset + ids[i],
          offset + ids[i + 1],
          offset + ids[i + 2],
        ]);
      if (mesh.vertices.length > MAX_VERTICES || mesh.faces.length > MAX_FACES)
        throw new Error("GLB resource budget exceeded");
    }
  }
  const visited = new Set<number>();
  function node(index: number, parent: number[], depth = 0) {
    if (depth > 64 || visited.has(index))
      throw new Error("Cyclic or oversized GLB scene");
    const n = g.nodes?.[index];
    if (!n) throw new Error("Invalid GLB node");
    visited.add(index);
    const m = multiply(parent, nodeMatrix(n));
    if (n.mesh !== undefined) addMesh(n.mesh, m);
    for (const child of n.children || []) node(child, m, depth + 1);
  }
  const roots = g.scenes?.[g.scene ?? 0]?.nodes;
  if (roots) for (const i of roots) node(i, identity);
  else if (g.nodes?.length) {
    const children = new Set(g.nodes.flatMap((n) => n.children || []));
    g.nodes.forEach((_, i) => {
      if (!children.has(i)) node(i, identity);
    });
  } else g.meshes!.forEach((_, i) => addMesh(i, identity));
  return normalize(validate(mesh));
}
function normalize(mesh: Mesh): Mesh {
  const lo = [Infinity, Infinity, Infinity],
    hi = [-Infinity, -Infinity, -Infinity];
  for (const v of mesh.vertices)
    for (let j = 0; j < 3; j++) {
      lo[j] = Math.min(lo[j], v[j]);
      hi[j] = Math.max(hi[j], v[j]);
    }
  const span = Math.max(...hi.map((v, j) => v - lo[j]));
  if (!span) throw new Error("Mesh has zero extent");
  return {
    ...mesh,
    vertices: mesh.vertices.map(
      (v) => v.map((x, j) => ((x - (lo[j] + hi[j]) / 2) * 2) / span) as Vec3,
    ),
  };
}
export const CUBE: Mesh = {
  vertices: [
    [-1, -1, -1],
    [1, -1, -1],
    [1, 1, -1],
    [-1, 1, -1],
    [-1, -1, 1],
    [1, -1, 1],
    [1, 1, 1],
    [-1, 1, 1],
  ],
  faces: [
    [0, 2, 1],
    [0, 3, 2],
    [4, 5, 6],
    [4, 6, 7],
    [0, 1, 5],
    [0, 5, 4],
    [2, 3, 7],
    [2, 7, 6],
    [0, 4, 7],
    [0, 7, 3],
    [1, 2, 6],
    [1, 6, 5],
  ],
};
export function renderMesh(
  mesh: Mesh,
  yaw: number,
  pitch: number,
  zoom: number,
  light: number,
  color = "#e9b86e",
) {
  if (
    ![yaw, pitch, zoom, light].every(Number.isFinite) ||
    zoom < 0.2 ||
    zoom > 3
  )
    throw new Error("Invalid view");
  const width = 80,
    height = 40,
    doc = createDocument(width, height, "3D snapshot"),
    depth = new Float64Array(width * height).fill(-Infinity),
    ramp = " .:-=+*#%@";
  doc.background = "#0c0d10";
  const transformed = mesh.vertices.map(([x, y, z]) => {
    const xx = x * Math.cos(yaw) + z * Math.sin(yaw),
      zz = -x * Math.sin(yaw) + z * Math.cos(yaw);
    return [
      xx,
      y * Math.cos(pitch) - zz * Math.sin(pitch),
      y * Math.sin(pitch) + zz * Math.cos(pitch),
    ] as Vec3;
  });
  const points = transformed.map(
    ([x, y, z]) =>
      [width / 2 + x * 17 * zoom, height / 2 - y * 17 * zoom, z] as Vec3,
  );
  let work = 0;
  for (const [a, b, c] of mesh.faces) {
    const u = transformed[b].map((v, i) => v - transformed[a][i]),
      v = transformed[c].map((v, i) => v - transformed[a][i]),
      normal = [
        u[1] * v[2] - u[2] * v[1],
        u[2] * v[0] - u[0] * v[2],
        u[0] * v[1] - u[1] * v[0],
      ],
      len = Math.hypot(...normal);
    if (!len) continue;
    const intensity = Math.min(
      1,
      0.2 +
        Math.max(
          0,
          (normal[0] * -0.3 + normal[1] * 0.5 + normal[2] * 0.8) / len,
        ) *
          light,
    );
    const p = points[a],
      q = points[b],
      r = points[c],
      den = (q[1] - r[1]) * (p[0] - r[0]) + (r[0] - q[0]) * (p[1] - r[1]);
    if (Math.abs(den) < 1e-9) continue;
    const rasterWidth = Math.max(
      0,
      Math.min(width - 1, Math.ceil(Math.max(p[0], q[0], r[0]))) -
        Math.max(0, Math.floor(Math.min(p[0], q[0], r[0]))) +
        1,
    );
    const rasterHeight = Math.max(
      0,
      Math.min(height - 1, Math.ceil(Math.max(p[1], q[1], r[1]))) -
        Math.max(0, Math.floor(Math.min(p[1], q[1], r[1]))) +
        1,
    );
    work += rasterWidth * rasterHeight;
    if (work > 1_000_000)
      throw new Error(
        "Model exceeds the projected triangle budget. Simplify the mesh or zoom out.",
      );
    for (
      let y = Math.max(0, Math.floor(Math.min(p[1], q[1], r[1])));
      y <= Math.min(height - 1, Math.ceil(Math.max(p[1], q[1], r[1])));
      y++
    )
      for (
        let x = Math.max(0, Math.floor(Math.min(p[0], q[0], r[0])));
        x <= Math.min(width - 1, Math.ceil(Math.max(p[0], q[0], r[0])));
        x++
      ) {
        const aa =
            ((q[1] - r[1]) * (x + 0.5 - r[0]) +
              (r[0] - q[0]) * (y + 0.5 - r[1])) /
            den,
          bb =
            ((r[1] - p[1]) * (x + 0.5 - r[0]) +
              (p[0] - r[0]) * (y + 0.5 - r[1])) /
            den,
          cc = 1 - aa - bb;
        if (aa < 0 || bb < 0 || cc < 0) continue;
        const z = aa * p[2] + bb * q[2] + cc * r[2],
          i = y * width + x;
        if (z > depth[i]) {
          depth[i] = z;
          doc.layers[0].cells[i] = {
            char: ramp[Math.max(1, Math.round(intensity * 9))],
            fg: color,
            bg: null,
            alpha: 1,
          };
        }
      }
  }
  return doc;
}
