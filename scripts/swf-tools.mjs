import { deflateSync, inflateSync } from "node:zlib";

const CONTROL_TAGS = new Set([1, 4, 5, 12, 26, 28, 43, 70]);

function signedBits(value, width) {
  const limit = 2 ** width;
  return value < 0 ? limit + value : value;
}

function encodeRect({ xmin, xmax, ymin, ymax }) {
  const values = [xmin, xmax, ymin, ymax];
  const width = Math.max(
    2,
    ...values.map((value) => {
      const magnitude = Math.abs(value);
      return Math.ceil(Math.log2(magnitude + 1)) + 1;
    }),
  );
  const bitCount = 5 + width * 4;
  const output = Buffer.alloc(Math.ceil(bitCount / 8));
  let cursor = 0;

  const write = (value, bits) => {
    for (let index = bits - 1; index >= 0; index -= 1) {
      const bit = (value >> index) & 1;
      output[cursor >> 3] |= bit << (7 - (cursor & 7));
      cursor += 1;
    }
  };

  write(width, 5);
  for (const value of values) write(signedBits(value, width), width);
  return output;
}

function rectByteLength(buffer, offset = 8) {
  let cursor = 0;
  const read = (bits) => {
    let value = 0;
    for (let index = 0; index < bits; index += 1) {
      value =
        (value << 1) |
        ((buffer[offset + (cursor >> 3)] >> (7 - (cursor & 7))) & 1);
      cursor += 1;
    }
    return value;
  };
  const width = read(5);
  cursor += width * 4;
  return Math.ceil(cursor / 8);
}

function uncompress(input) {
  const signature = input.subarray(0, 3).toString("ascii");
  if (signature === "FWS") return Buffer.from(input);
  if (signature !== "CWS") {
    throw new Error(`Unsupported SWF signature: ${signature}`);
  }
  return Buffer.concat([
    Buffer.from("FWS"),
    input.subarray(3, 8),
    inflateSync(input.subarray(8)),
  ]);
}

function encodeTag(code, body = Buffer.alloc(0)) {
  if (body.length < 63) {
    const header = Buffer.alloc(2);
    header.writeUInt16LE((code << 6) | body.length);
    return Buffer.concat([header, body]);
  }
  const header = Buffer.alloc(6);
  header.writeUInt16LE((code << 6) | 63);
  header.writeUInt32LE(body.length, 2);
  return Buffer.concat([header, body]);
}

function parseTags(buffer, offset) {
  const tags = [];
  let cursor = offset;
  while (cursor + 2 <= buffer.length) {
    const shortHeader = buffer.readUInt16LE(cursor);
    const code = shortHeader >> 6;
    let length = shortHeader & 63;
    let headerLength = 2;
    if (length === 63) {
      length = buffer.readUInt32LE(cursor + 2);
      headerLength = 6;
    }
    const end = cursor + headerLength + length;
    if (end > buffer.length) throw new Error(`Truncated SWF tag ${code}`);
    tags.push({ code, bytes: buffer.subarray(cursor, end) });
    cursor = end;
    if (code === 0) break;
  }
  return tags;
}

function freezeRootFrame(tags, targetFrame) {
  if (!targetFrame) return tags;
  let frame = 1;
  const before = [];
  const definitionsAfter = [];
  let reachedTarget = false;

  for (const tag of tags) {
    if (tag.code === 0) continue;
    if (!reachedTarget) {
      if (tag.code === 1) {
        if (frame === targetFrame) reachedTarget = true;
        frame += 1;
      } else {
        before.push(tag);
      }
    } else if (!CONTROL_TAGS.has(tag.code)) {
      definitionsAfter.push(tag);
    }
  }

  if (!reachedTarget) {
    throw new Error(`SWF has fewer than ${targetFrame} root frames`);
  }
  return [
    ...before,
    ...definitionsAfter,
    { code: 1, bytes: encodeTag(1) },
    { code: 0, bytes: encodeTag(0) },
  ];
}

export function transformSwf(input, { bounds, frame } = {}) {
  const source = uncompress(input);
  const originalRectLength = rectByteLength(source);
  const originalMovieHeaderEnd = 8 + originalRectLength + 4;
  const rect = encodeRect(bounds);
  const movieHeader = Buffer.concat([
    rect,
    source.subarray(8 + originalRectLength, originalMovieHeaderEnd),
  ]);
  if (frame) movieHeader.writeUInt16LE(1, rect.length + 2);

  const tags = freezeRootFrame(
    parseTags(source, originalMovieHeaderEnd),
    frame,
  );
  const body = Buffer.concat([movieHeader, ...tags.map((tag) => tag.bytes)]);
  const header = Buffer.alloc(8);
  header.write("CWS", 0, "ascii");
  header[3] = source[3];
  header.writeUInt32LE(8 + body.length, 4);
  return Buffer.concat([header, deflateSync(body)]);
}

export function inspectSwf(input) {
  const source = uncompress(input);
  const rectLength = rectByteLength(source);
  const movieHeaderOffset = 8 + rectLength;
  return {
    signature: input.subarray(0, 3).toString("ascii"),
    frameCount: source.readUInt16LE(movieHeaderOffset + 2),
  };
}
