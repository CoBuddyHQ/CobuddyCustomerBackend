import { validateUpload } from './upload-content.util';

describe('upload content contract', () => {
  const image = (name = 'test.png', mime = 'image/png', hex = '89504e470d0a1a0a') =>
    ({ originalname: name, mimetype: mime, buffer: Buffer.from(hex, 'hex') } as Express.Multer.File);
  it('accepts matching PNG headers', () => expect(() => validateUpload(image(), true)).not.toThrow());
  it('rejects missing files', () => expect(() => validateUpload(undefined)).toThrow());
  it('rejects extension mismatch', () => expect(() => validateUpload(image('test.html'))).toThrow());
  it('rejects spoofed media contents', () => expect(() => validateUpload(image('test.png', 'image/png', '3c68746d6c3e'))).toThrow());
  it('rejects RIFF that is not WEBP', () => expect(() => validateUpload(image('test.webp', 'image/webp', '524946460000000057415645'))).toThrow());
  it('rejects non-image profile media', () => expect(() => validateUpload(image('test.pdf', 'application/pdf', '255044462d'), true)).toThrow());
});
