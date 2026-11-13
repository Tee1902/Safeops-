import { mkdtemp, readdir, unlink, rmdir, readFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { DataSource, Repository } from 'typeorm';
import { UploadsService } from './uploads.service.js';
import { UploadedFile } from '../database/entities/uploaded-file.entity.js';
import { actor, config, otherId, png } from '../../test/fixtures.js';

describe('UploadsService', () => {
  let directory: string;
  let files: Record<string, jest.Mock>;
  let service: UploadsService;
  let query: Record<string, jest.Mock>;
  const file = (buffer: Buffer, originalname = '../../evil.html') =>
    ({
      buffer,
      originalname,
      mimetype: 'text/html',
      size: 1,
    }) as Express.Multer.File;
  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'safeops-be1-'));
    files = {
      create: jest.fn((data) => data),
      save: jest.fn(async (data) => data),
      findOneBy: jest.fn(),
    };
    query = {
      innerJoin: jest.fn().mockReturnThis(),
      where: jest.fn().mockReturnThis(),
      andWhere: jest.fn().mockReturnThis(),
      getExists: jest.fn().mockResolvedValue(false),
    };
    service = new UploadsService(
      files as unknown as Repository<UploadedFile>,
      config({ UPLOAD_DIR: directory }),
      {
        getRepository: () => ({ createQueryBuilder: () => query }),
      } as unknown as DataSource,
    );
  });
  afterEach(async () => {
    for (const name of await readdir(directory))
      await unlink(join(directory, name));
    await rmdir(directory);
  });
  it('uses content signatures, random names and authenticated URLs', async () => {
    const result = await service.upload([file(png)], actor.id);
    expect(result.files[0].filename).toMatch(/^[0-9a-f-]{36}\.png$/);
    expect(result.files[0].mimeType).toBe('image/png');
    expect(result.urls[0]).toBe(`/api/uploads/${result.files[0].filename}`);
    expect(await readFile(join(directory, result.files[0].filename))).toEqual(
      png,
    );
    expect(files.create).toHaveBeenCalledWith(
      expect.objectContaining({ ownerId: actor.id, size: png.length }),
    );
  });
  it.each([
    Buffer.from('<svg onload="alert(1)"></svg>'),
    Buffer.from('not an image'),
    Buffer.alloc(0),
  ])('rejects fake images without writing to disk', async (buffer) => {
    await expect(
      service.upload([file(buffer, 'image.png')], actor.id),
    ).rejects.toMatchObject({ status: 400 });
    expect(await readdir(directory)).toEqual([]);
    expect(files.save).not.toHaveBeenCalled();
  });
  it.each([
    {
      buffer: Buffer.from(
        'ffd8ffe000104a46494600010100000100010000ffd9',
        'hex',
      ),
      extension: 'jpg',
      mime: 'image/jpeg',
    },
    {
      buffer: Buffer.from('UklGRhIAAABXRUJQVlA4TAUAAAAvAAAAAA==', 'base64'),
      extension: 'webp',
      mime: 'image/webp',
    },
  ])(
    'recognizes $extension signatures despite an incorrect client filename/MIME',
    async ({ buffer, extension, mime }) => {
      const result = await service.upload(
        [file(buffer, 'payload.exe')],
        actor.id,
      );
      expect(result.files[0].filename).toMatch(new RegExp(`\\.${extension}$`));
      expect(result.files[0].mimeType).toBe(mime);
    },
  );
  it('enforces actual buffer size even if reported size is forged', async () => {
    await expect(
      service.upload([file(Buffer.alloc(5242881))], actor.id),
    ).rejects.toMatchObject({ status: 413 });
  });
  it('validates the entire batch before writing any files', async () => {
    await expect(
      service.upload([file(png), file(Buffer.from('script'))], actor.id),
    ).rejects.toMatchObject({ status: 400 });
    expect(await readdir(directory)).toEqual([]);
  });
  it('cleans up files when metadata persistence fails', async () => {
    files.save.mockRejectedValue(new Error('db failed'));
    await expect(service.upload([file(png)], actor.id)).rejects.toThrow(
      'db failed',
    );
    expect(await readdir(directory)).toEqual([]);
  });
  it('requires at least one file and limits batch size', async () => {
    await expect(service.upload([], actor.id)).rejects.toMatchObject({
      status: 400,
    });
    await expect(
      service.upload(
        Array.from({ length: 11 }, () => file(png)),
        actor.id,
      ),
    ).rejects.toMatchObject({ status: 400 });
  });
  it('rejects traversal names and unauthorized file access', async () => {
    await expect(
      service.authorizedFile('../private.env', actor),
    ).rejects.toMatchObject({ status: 404 });
    const filename = 'd835b7c5-f14e-431d-994c-909d357a8a43.png';
    files.findOneBy.mockResolvedValue({ ownerId: otherId, filename });
    await expect(service.authorizedFile(filename, actor)).rejects.toMatchObject(
      { status: 404 },
    );
    expect(query.andWhere).toHaveBeenCalledWith(
      'incident.reporterId = :userId',
      { userId: actor.id },
    );
    await expect(
      service.authorizedFile(filename, { ...actor, role: 'SECURITY' }),
    ).rejects.toMatchObject({ status: 404 });
    expect(query.andWhere).toHaveBeenCalledWith(
      expect.stringContaining('assignment.securityUserId'),
      expect.objectContaining({ userId: actor.id }),
    );
    query.getExists.mockResolvedValue(true);
    await expect(
      service.authorizedFile(filename, { ...actor, role: 'OPERATOR' }),
    ).resolves.toHaveProperty('filename');
  });
  it('allows owners and Admin to access stored images', async () => {
    const filename = 'd835b7c5-f14e-431d-994c-909d357a8a43.png';
    files.findOneBy.mockResolvedValue({ ownerId: actor.id, filename });
    await expect(
      service.authorizedFile(filename, actor),
    ).resolves.toHaveProperty('filename');
    files.findOneBy.mockResolvedValue({ ownerId: otherId, filename });
    await expect(
      service.authorizedFile(filename, { ...actor, role: 'ADMIN' }),
    ).resolves.toHaveProperty('filename');
  });
});
