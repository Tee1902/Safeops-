import { BadRequestException } from '@nestjs/common';
import { MAX_ATTACHMENT_SIZE, validateEvidence } from './file-validation.js';
const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Wl6hAAAAABJRU5ErkJggg==',
  'base64',
);
describe('Evidence upload validation', () => {
  it('accepts PNG and strips client paths from the displayed name', () => {
    expect(
      validateEvidence({
        originalname: '../../evidence.png',
        mimetype: 'image/png',
        buffer: png,
        size: png.length,
      }),
    ).toEqual({
      mime: 'image/png',
      ext: 'png',
      name: 'evidence.png',
      size: png.length,
    });
  });
  it('rejects a forged MIME header', () => {
    expect(() =>
      validateEvidence({
        originalname: 'evidence.png',
        mimetype: 'image/png',
        buffer: Buffer.from('<script>alert(1)</script>'),
        size: 25,
      }),
    ).toThrow(BadRequestException);
  });
  it('rejects valid image bytes with a mismatched MIME', () => {
    expect(() =>
      validateEvidence({
        originalname: 'evidence.pdf',
        mimetype: 'application/pdf',
        buffer: png,
        size: png.length,
      }),
    ).toThrow(BadRequestException);
  });
  it('measures the real bytes instead of trusting the submitted size', () => {
    expect(() =>
      validateEvidence({
        originalname: 'huge.png',
        mimetype: 'image/png',
        buffer: Buffer.alloc(MAX_ATTACHMENT_SIZE + 1),
        size: 1,
      }),
    ).toThrow(BadRequestException);
  });
  it('rejects an empty upload', () => {
    expect(() => validateEvidence()).toThrow(BadRequestException);
  });
});
