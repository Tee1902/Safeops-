import { BadRequestException } from '@nestjs/common';
export const MAX_ATTACHMENT_SIZE = 10 * 1024 * 1024;
export interface EvidenceFile {
  originalname: string;
  mimetype: string;
  size: number;
  buffer: Buffer;
}
export function validateEvidence(file?: EvidenceFile) {
  if (!file?.buffer?.length)
    throw new BadRequestException('Cần tệp bằng chứng ở trường file.');
  const data = file.buffer;
  if (data.length > MAX_ATTACHMENT_SIZE)
    throw new BadRequestException('Tệp tối đa 10 MiB.');
  let type: { mime: string; ext: string } | undefined;
  if (
    data.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
  )
    type = { mime: 'image/png', ext: 'png' };
  else if (
    data.length >= 3 &&
    data[0] === 255 &&
    data[1] === 216 &&
    data[2] === 255
  )
    type = { mime: 'image/jpeg', ext: 'jpg' };
  else if (
    data.length >= 12 &&
    data.toString('ascii', 0, 4) === 'RIFF' &&
    data.toString('ascii', 8, 12) === 'WEBP'
  )
    type = { mime: 'image/webp', ext: 'webp' };
  else if (data.toString('ascii', 0, 5) === '%PDF-')
    type = { mime: 'application/pdf', ext: 'pdf' };
  if (!type || file.mimetype !== type.mime)
    throw new BadRequestException(
      'Chỉ nhận JPEG, PNG, WebP, PDF có MIME và chữ ký tệp phù hợp.',
    );
  const baseName = file.originalname.replace(/\\/g, '/').split('/').pop() || '';
  const name = Array.from(baseName)
    .filter((char) => char.charCodeAt(0) >= 32 && char.charCodeAt(0) !== 127)
    .join('')
    .trim();
  if (!name || name.length > 255)
    throw new BadRequestException(
      'Tên tệp không hợp lệ hoặc dài quá 255 ký tự.',
    );
  return { ...type, name, size: data.length };
}
